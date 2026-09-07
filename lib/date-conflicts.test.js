const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DATE_LOCKING_STATUSES } = require('./booking-transitions');
const {
  DATE_LOCK_ADVISORY_KEY,
  DATES_UNAVAILABLE,
  DEFAULT_PROPERTY_ID,
  OWNER_VS_REQUEST,
  REQUEST_VS_OWNER,
  dateConflictBody,
  findOverlappingLocks,
  findOverlappingOwnerBlocks,
  insertOwnerBlockIfClear,
  ownerBlockConflict,
  rangesOverlap,
  reservationConflict,
  withDateLock
} = require('./date-conflicts');

function sqlText(strings) {
  return strings.join('?');
}

function makeSql({
  locks = [],
  blocks = [],
  insertedEntry = {
    id: 11,
    kind: 'manual_block',
    start_date: '2026-11-10',
    end_date: '2026-11-14',
    notes: 'paint'
  },
  insertRows = undefined
} = {}) {
  const calls = [];
  function exec(strings, values) {
    const text = sqlText(strings);
    calls.push({ text, values });
    if (/pg_advisory_xact_lock/i.test(text)) {
      return Promise.resolve([{ pg_advisory_xact_lock: '' }]);
    }
    if (/FROM reservations/i.test(text) && /daterange/i.test(text) && !/INSERT/i.test(text)) {
      return Promise.resolve(locks);
    }
    if (/FROM owner_calendar_entries/i.test(text) && /daterange/i.test(text) && !/INSERT/i.test(text)) {
      return Promise.resolve(blocks);
    }
    if (/INSERT INTO owner_calendar_entries/i.test(text)) {
      return Promise.resolve(insertRows !== undefined ? insertRows : [insertedEntry]);
    }
    return Promise.reject(new Error(`unexpected sql: ${text}`));
  }
  function sql(strings, ...values) {
    return exec(strings, values);
  }
  sql.transaction = async (queries) => Promise.all(queries);
  return { sql, calls };
}

describe('rangesOverlap', () => {
  it('uses half-open [start, end) so adjacent stays do not conflict', () => {
    assert.equal(rangesOverlap('2026-11-10', '2026-11-13', '2026-11-13', '2026-11-16'), false);
    assert.equal(rangesOverlap('2026-11-10', '2026-11-13', '2026-11-12', '2026-11-16'), true);
    assert.equal(rangesOverlap('2026-11-10', '2026-11-13', '2026-11-08', '2026-11-10'), false);
    assert.equal(rangesOverlap('2026-11-10', '2026-11-13', '2026-11-10', '2026-11-11'), true);
  });
});

describe('conflict payloads', () => {
  it('keeps guest and owner writers on the same dates_unavailable error', () => {
    assert.equal(DATES_UNAVAILABLE.error, 'dates_unavailable');
    assert.equal(REQUEST_VS_OWNER.error, 'dates_unavailable');
    assert.equal(OWNER_VS_REQUEST.error, 'dates_unavailable');
    assert.match(OWNER_VS_REQUEST.message, /until you release them/i);
    assert.doesNotMatch(OWNER_VS_REQUEST.message, /24/);
    assert.deepEqual(DATE_LOCKING_STATUSES, [
      'inquiry_hold',
      'hold_verified',
      'contract_sent',
      'contract_signed',
      'confirmed'
    ]);
    assert.equal(typeof DATE_LOCK_ADVISORY_KEY, 'number');
    assert.equal(DEFAULT_PROPERTY_ID, 'sand-sea-manor');
  });

  it('names the conflicting source without rewriting the lock', () => {
    const reservation = reservationConflict({
      id: 'DB-20261110-AAAAAA',
      status: 'inquiry_hold',
      checkin: '2026-11-10',
      checkout: '2026-11-13'
    });
    const block = ownerBlockConflict({
      id: 9,
      kind: 'owner_stay',
      start_date: '2026-11-10',
      end_date: '2026-11-12'
    });
    assert.deepEqual(reservation, {
      source: 'direct_request',
      reservationId: 'DB-20261110-AAAAAA',
      status: 'inquiry_hold',
      checkin: '2026-11-10',
      checkout: '2026-11-13'
    });
    assert.deepEqual(block, {
      source: 'owner_block',
      entryId: 9,
      kind: 'owner_stay',
      startDate: '2026-11-10',
      endDate: '2026-11-12'
    });
    assert.deepEqual(
      dateConflictBody({ ...OWNER_VS_REQUEST, conflict: reservation }),
      { ...OWNER_VS_REQUEST, conflict: reservation }
    );
  });
});

describe('overlap lookups', () => {
  it('queries locking reservations and owner blocks with half-open daterange overlap', async () => {
    const { sql, calls } = makeSql({
      locks: [{ id: 'DB-1', status: 'inquiry_hold', checkin: '2026-11-10', checkout: '2026-11-13' }],
      blocks: [{ id: 3, kind: 'manual_block', start_date: '2026-12-01', end_date: '2026-12-04' }]
    });
    const locks = await findOverlappingLocks(sql, '2026-11-10', '2026-11-13');
    const blocks = await findOverlappingOwnerBlocks(sql, '2026-12-01', '2026-12-04');
    assert.equal(locks[0].id, 'DB-1');
    assert.equal(blocks[0].kind, 'manual_block');
    assert.match(calls[0].text, /reservations_no_overlap|status IN \('inquiry_hold'/);
    assert.match(calls[0].text, /daterange\(checkin, checkout, '\[\)'\) && daterange/);
    assert.match(calls[1].text, /owner_calendar_entries/);
    assert.match(calls[1].text, /daterange\(start_date, end_date, '\[\)'\) && daterange/);
  });
});

describe('withDateLock', () => {
  it('takes the shared advisory lock before the writer queries', async () => {
    const { sql, calls } = makeSql();
    let seen = 0;
    const inner = sql.transaction;
    sql.transaction = async (queries) => {
      seen += 1;
      assert.equal(queries.length, 2);
      return inner(queries);
    };
    const results = await withDateLock(sql, [
      sql`
        SELECT id, status, checkin::text, checkout::text
        FROM reservations
        WHERE status IN ('inquiry_hold','hold_verified','contract_sent','contract_signed','confirmed')
          AND daterange(checkin, checkout, '[)') && daterange(${'2026-11-10'}::date, ${'2026-11-13'}::date, '[)')
      `
    ]);
    assert.equal(seen, 1);
    assert.equal(results.length, 1);
    assert.match(calls[0].text, /pg_advisory_xact_lock/);
    assert.match(calls[0].text, String(DATE_LOCK_ADVISORY_KEY));
  });
});

describe('insertOwnerBlockIfClear', () => {
  it('inserts a block only when no locking reservation overlaps', async () => {
    const { sql, calls } = makeSql();
    const result = await insertOwnerBlockIfClear(sql, {
      kind: 'manual_block',
      startDate: '2026-11-10',
      endDate: '2026-11-14',
      notes: 'paint'
    });
    assert.equal(result.ok, true);
    assert.equal(result.entry.id, 11);
    const insert = calls.find((c) => /INSERT INTO owner_calendar_entries/i.test(c.text));
    assert.ok(insert);
    assert.match(insert.text, /WHERE NOT EXISTS/);
    assert.match(insert.text, /FROM reservations/);
    assert.match(insert.text, /inquiry_hold/);
    assert.doesNotMatch(insert.text, /hold_expires_at/);
    assert.match(calls[0].text, /pg_advisory_xact_lock/);
  });

  it('fails closed with dates_unavailable when a guest lock already holds the nights', async () => {
    const lock = {
      id: 'DB-20261110-LOCK01',
      status: 'inquiry_hold',
      checkin: '2026-11-10',
      checkout: '2026-11-13'
    };
    const { sql, calls } = makeSql({ insertRows: [], locks: [lock] });
    const result = await insertOwnerBlockIfClear(sql, {
      kind: 'owner_stay',
      startDate: '2026-11-10',
      endDate: '2026-11-12',
      notes: null
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 409);
    assert.equal(result.error, OWNER_VS_REQUEST.error);
    assert.equal(result.message, OWNER_VS_REQUEST.message);
    assert.equal(result.conflict.reservationId, lock.id);
    assert.equal(result.conflict.source, 'direct_request');
    assert.equal(calls.some((c) => /INSERT INTO owner_calendar_entries/i.test(c.text)), true);
    assert.equal(calls.some((c) => /UPDATE reservations/i.test(c.text)), false);
    assert.equal(calls.some((c) => /DELETE FROM reservations/i.test(c.text)), false);
  });
});
