/**
 * Atomic guest inquiry create + duplicate-safe retries.
 *
 * Reservation row, quote snapshot, and inquiry_created audit event are written
 * in one Neon HTTP transaction. Same-email + same-dates retries return the
 * existing locking reservation instead of inserting a second hold.
 *
 * Date lock (#67): hold_expires_at stays NULL. expireHolds is not called.
 * OpenSign / Stripe / confirmation sequence are not part of this path.
 */

const { DATE_LOCKING_STATUSES } = require('./booking-transitions');

const INQUIRY_LOCK_STATUSES = DATE_LOCKING_STATUSES;

const DATES_UNAVAILABLE = Object.freeze({
  error: 'dates_unavailable',
  message: 'Those dates are currently being held or are booked.'
});

const DATES_JUST_HELD = Object.freeze({
  error: 'dates_unavailable',
  message: 'Those dates were just placed on hold by another guest.'
});

const OCCUPANCY_MIGRATION_PENDING = Object.freeze({
  error: 'occupancy_migration_pending',
  message: 'The home accommodates up to 14 guests, but online submission for groups of 13–14 is being updated. Please contact CJT Realty and we will place the request directly.'
});

const HOLD_MESSAGE = 'Your dates are reserved while CJT reviews your request and remain unavailable until an owner releases them.';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isOverlapConstraint(error) {
  const constraint = String(error?.constraint || '');
  const detail = String(error?.message || '').toLowerCase();
  return constraint === 'reservations_no_overlap' || detail.includes('reservations_no_overlap');
}

function isOccupancyConstraintViolation(error) {
  return error?.constraint === 'reservation_guest_count_valid'
    || String(error?.message || '').toLowerCase().includes('reservation_guest_count_valid');
}

function isDuplicateStay(row, request) {
  if (!row) return false;
  const sameEmail = normalizeEmail(row.guest_email) === normalizeEmail(request.guest_email);
  const sameCheckin = String(row.checkin) === String(request.checkin);
  const sameCheckout = String(row.checkout) === String(request.checkout);
  return sameEmail && sameCheckin && sameCheckout;
}

function metadataObject(value) {
  if (value == null) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return {}; }
  }
  if (typeof value === 'object') return value;
  return {};
}

function reservationPublicFields(row) {
  return {
    id: row.id,
    checkin: row.checkin,
    checkout: row.checkout,
    status: row.status,
    hold_expires_at: row.hold_expires_at ?? null
  };
}

function inquirySuccessBody({ reservation, quote, replayed }) {
  return {
    reservation: reservationPublicFields(reservation),
    quote,
    replayed: Boolean(replayed),
    message: HOLD_MESSAGE
  };
}

function inquiryHttpStatus(replayed) {
  return replayed ? 200 : 201;
}

function quoteFromCreatedEvent(event, fallbackQuote) {
  const meta = metadataObject(event?.metadata);
  return meta.quote || fallbackQuote;
}

async function findDuplicateReservation(sql, { guest_email, checkin, checkout }) {
  const email = normalizeEmail(guest_email);
  const rows = await sql`
    SELECT id, guest_name, guest_email, guests, notes,
           checkin::text, checkout::text, status, hold_expires_at
    FROM reservations
    WHERE lower(guest_email) = ${email}
      AND checkin = ${checkin}::date
      AND checkout = ${checkout}::date
      AND status IN ('inquiry_hold','hold_verified','contract_sent','contract_signed','confirmed')
    ORDER BY created_at ASC
    LIMIT 1
  `;
  return rows[0] || null;
}

async function quoteSnapshotFor(sql, reservationId, fallbackQuote) {
  const events = await sql`
    SELECT event_type, metadata
    FROM booking_events
    WHERE reservation_id = ${reservationId} AND event_type = 'inquiry_created'
    ORDER BY created_at ASC
    LIMIT 1
  `;
  return quoteFromCreatedEvent(events[0], fallbackQuote);
}

async function insertInquiryAtomic(sql, payload) {
  if (typeof sql.transaction !== 'function') {
    throw new Error('Database client does not support transactions');
  }
  const metadata = JSON.stringify({ guests: payload.guests, quote: payload.quote });
  const [inserted] = await sql.transaction([
    sql`
      INSERT INTO reservations (id,guest_name,guest_email,guest_phone,guests,notes,checkin,checkout,status,hold_expires_at)
      VALUES (${payload.id},${payload.guest_name},${payload.guest_email},${payload.guest_phone || null},${payload.guests},${payload.notes || null},${payload.checkin}::date,${payload.checkout}::date,'inquiry_hold',NULL)
      RETURNING id,checkin::text,checkout::text,status,hold_expires_at
    `,
    sql`
      INSERT INTO booking_events (reservation_id,event_type,actor,metadata)
      VALUES (${payload.id},'inquiry_created','guest',${metadata}::jsonb)
    `
  ]);
  return inserted[0];
}

async function replayExisting(sql, existing, fallbackQuote) {
  const quote = await quoteSnapshotFor(sql, existing.id, fallbackQuote);
  return { ok: true, replayed: true, reservation: existing, quote };
}

async function resolveDatesConflict(sql, payload, message = DATES_UNAVAILABLE.message) {
  const existing = await findDuplicateReservation(sql, payload);
  if (existing) return replayExisting(sql, existing, payload.quote);
  return { ok: false, status: 409, error: 'dates_unavailable', message };
}

async function persistInquiry(sql, payload) {
  const existing = await findDuplicateReservation(sql, payload);
  if (existing) return replayExisting(sql, existing, payload.quote);

  try {
    const reservation = await insertInquiryAtomic(sql, payload);
    return { ok: true, replayed: false, reservation, quote: payload.quote };
  } catch (error) {
    if (isOverlapConstraint(error)) {
      return resolveDatesConflict(sql, payload, DATES_JUST_HELD.message);
    }
    if (isOccupancyConstraintViolation(error) && payload.guests > 12) {
      return { ok: false, status: 503, ...OCCUPANCY_MIGRATION_PENDING };
    }
    throw error;
  }
}

module.exports = {
  INQUIRY_LOCK_STATUSES,
  DATES_UNAVAILABLE,
  DATES_JUST_HELD,
  HOLD_MESSAGE,
  normalizeEmail,
  isOverlapConstraint,
  isOccupancyConstraintViolation,
  isDuplicateStay,
  reservationPublicFields,
  inquirySuccessBody,
  inquiryHttpStatus,
  quoteFromCreatedEvent,
  findDuplicateReservation,
  quoteSnapshotFor,
  insertInquiryAtomic,
  resolveDatesConflict,
  persistInquiry
};
