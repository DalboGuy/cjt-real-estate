/**
 * Shared half-open date overlap + owner-block vs direct-request conflicts.
 *
 * Inventory lock (#67): inquiry_hold / hold_verified / contract_sent /
 * contract_signed / confirmed keep dates reserved until an owner releases
 * them. An owner stay or manual block must not overwrite that lock.
 *
 * Concurrency: both writers take the same transaction advisory lock, then
 * INSERT … SELECT … WHERE NOT EXISTS the other side. Neon HTTP transactions
 * are non-interactive (query arrays), so the conflict check is in the write.
 */

const { DATE_LOCKING_STATUSES } = require('./booking-transitions');

const DEFAULT_PROPERTY_ID = 'sand-sea-manor';

// Stable bigint key for pg_advisory_xact_lock. Shared by inquiry create and
// owner block/stay create so the two paths cannot commit overlapping writes.
const DATE_LOCK_ADVISORY_KEY = 67000001;

const DATES_UNAVAILABLE = Object.freeze({
  error: 'dates_unavailable',
  message: 'Those dates are currently being held or are booked.'
});

const REQUEST_VS_OWNER = Object.freeze({
  error: 'dates_unavailable',
  message: 'Those dates are blocked by an owner stay or manual block.'
});

const OWNER_VS_REQUEST = Object.freeze({
  error: 'dates_unavailable',
  message: 'Those dates are locked by a guest request and stay reserved until you release them.'
});

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return String(aStart) < String(bEnd) && String(bStart) < String(aEnd);
}

function reservationConflict(row) {
  if (!row) return { source: 'direct_request' };
  return {
    source: 'direct_request',
    reservationId: row.id || null,
    status: row.status || null,
    checkin: row.checkin || null,
    checkout: row.checkout || null
  };
}

function ownerBlockConflict(row) {
  if (!row) return { source: 'owner_block' };
  return {
    source: 'owner_block',
    entryId: row.id != null ? Number(row.id) : null,
    kind: row.kind || null,
    startDate: row.start_date || row.startDate || null,
    endDate: row.end_date || row.endDate || null
  };
}

function dateConflictBody({ error, message, conflict = null }) {
  const body = { error, message };
  if (conflict) body.conflict = conflict;
  return body;
}

function dateLockSql(sql) {
  return sql`SELECT pg_advisory_xact_lock(${DATE_LOCK_ADVISORY_KEY}::bigint)`;
}

async function withDateLock(sql, queries) {
  if (typeof sql.transaction !== 'function') {
    throw new Error('Database client does not support transactions');
  }
  const results = await sql.transaction([dateLockSql(sql), ...queries]);
  return results.slice(1);
}

async function findOverlappingLocks(sql, start, end) {
  return sql`
    SELECT id, status, checkin::text, checkout::text
    FROM reservations
    WHERE status IN ('inquiry_hold','hold_verified','contract_sent','contract_signed','confirmed')
      AND daterange(checkin, checkout, '[)') && daterange(${start}::date, ${end}::date, '[)')
    ORDER BY checkin ASC, id ASC
    LIMIT 5
  `;
}

async function findOverlappingOwnerBlocks(sql, start, end, propertyId = DEFAULT_PROPERTY_ID) {
  return sql`
    SELECT id, kind, start_date::text, end_date::text
    FROM owner_calendar_entries
    WHERE property_id = ${propertyId}
      AND daterange(start_date, end_date, '[)') && daterange(${start}::date, ${end}::date, '[)')
    ORDER BY start_date ASC, id ASC
    LIMIT 5
  `;
}

async function insertOwnerBlockIfClear(sql, {
  kind,
  startDate,
  endDate,
  notes,
  propertyId = DEFAULT_PROPERTY_ID
}) {
  const [inserted] = await withDateLock(sql, [
    sql`
      INSERT INTO owner_calendar_entries(property_id, kind, start_date, end_date, notes, updated_at, created_by)
      SELECT ${propertyId}, ${kind}, ${startDate}::date, ${endDate}::date, ${notes}, now(), 'owner'
      WHERE NOT EXISTS (
        SELECT 1 FROM reservations
        WHERE status IN ('inquiry_hold','hold_verified','contract_sent','contract_signed','confirmed')
          AND daterange(checkin, checkout, '[)') && daterange(${startDate}::date, ${endDate}::date, '[)')
      )
      RETURNING id, kind, start_date::text, end_date::text, notes
    `
  ]);
  const entry = inserted && inserted[0];
  if (!entry) {
    const locks = await findOverlappingLocks(sql, startDate, endDate);
    return {
      ok: false,
      status: 409,
      ...dateConflictBody({
        ...OWNER_VS_REQUEST,
        conflict: reservationConflict(locks[0])
      })
    };
  }
  return { ok: true, entry };
}

module.exports = {
  DATE_LOCKING_STATUSES,
  DEFAULT_PROPERTY_ID,
  DATE_LOCK_ADVISORY_KEY,
  DATES_UNAVAILABLE,
  REQUEST_VS_OWNER,
  OWNER_VS_REQUEST,
  rangesOverlap,
  reservationConflict,
  ownerBlockConflict,
  dateConflictBody,
  dateLockSql,
  withDateLock,
  findOverlappingLocks,
  findOverlappingOwnerBlocks,
  insertOwnerBlockIfClear
};
