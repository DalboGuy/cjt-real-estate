const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DATE_LOCKING_STATUSES } = require('./booking-transitions');
const {
  INQUIRY_LOCK_STATUSES,
  DATES_JUST_HELD,
  REQUEST_VS_OWNER,
  HOLD_MESSAGE,
  INVALID_TRIP_TYPE,
  normalizeEmail,
  normalizeInquiryOptions,
  isOverlapConstraint,
  isOccupancyConstraintViolation,
  isDuplicateStay,
  inquirySuccessBody,
  inquiryHttpStatus,
  quoteFromCreatedEvent,
  persistInquiry,
  resolveDatesConflict
} = require('./inquiry-create');
const { DATE_LOCK_ADVISORY_KEY } = require('./date-conflicts');

const SAMPLE_QUOTE = Object.freeze({
  total: 1426,
  nights: 3,
  lodgingSubtotal: 1000,
  cleaningFee: 240,
  taxes: 186,
  quoteVersion: 'seasonal-v2'
});

const REQUEST = Object.freeze({
  id: 'DB-20261010-ABC123',
  guest_name: 'Ada Guest',
  guest_email: 'Ada@Example.com',
  guest_phone: '555-0100',
  guests: 4,
  notes: 'Anniversary',
  checkin: '2026-10-10',
  checkout: '2026-10-13',
  quote: SAMPLE_QUOTE
});

function existingRow(overrides = {}) {
  return {
    id: 'DB-20261010-EXIST1',
    guest_name: 'Ada Guest',
    guest_email: 'ada@example.com',
    guests: 4,
    notes: 'Anniversary',
    checkin: '2026-10-10',
    checkout: '2026-10-13',
    status: 'inquiry_hold',
    hold_expires_at: null,
    ...overrides
  };
}

function overlapError() {
  const error = new Error('conflicting key value violates exclusion constraint "reservations_no_overlap"');
  error.constraint = 'reservations_no_overlap';
  return error;
}

function occupancyError() {
  const error = new Error('new row for relation "reservations" violates check constraint "reservation_guest_count_valid"');
  error.constraint = 'reservation_guest_count_valid';
  return error;
}

function sqlText(strings) {
  return strings.join('?');
}

function makeSql({
  duplicates = [],
  events = [],
  overlapOnInsert = false,
  occupancyOnInsert = false,
  inserted = {
    id: REQUEST.id,
    checkin: REQUEST.checkin,
    checkout: REQUEST.checkout,
    status: 'inquiry_hold',
    hold_expires_at: null
  }
} = {}) {
  const calls = [];
  function exec(strings, values) {
    const text = sqlText(strings);
    calls.push({ text, values });
    if (/pg_advisory_xact_lock/i.test(text)) {
      return Promise.resolve([{ pg_advisory_xact_lock: '' }]);
    }
    if (/FROM reservations/i.test(text) && /lower\(guest_email\)/i.test(text)) {
      return Promise.resolve(duplicates);
    }
    if (/FROM booking_events/i.test(text) && /inquiry_created/i.test(text)) {
      return Promise.resolve(events);
    }
    if (/INSERT INTO reservations/i.test(text)) {
      if (overlapOnInsert) return Promise.reject(overlapError());
      if (occupancyOnInsert) return Promise.reject(occupancyError());
      return Promise.resolve([inserted]);
    }
    if (/INSERT INTO booking_events/i.test(text)) {
      return Promise.resolve([{ reservation_id: REQUEST.id }]);
    }
    return Promise.reject(new Error(`unexpected sql: ${text}`));
  }
  function sql(strings, ...values) {
    return exec(strings, values);
  }
  sql.transaction = async (queries) => Promise.all(queries);
  return { sql, calls };
}

describe('inquiry duplicate identity', () => {
  it('normalizes email case and matches exact stay dates', () => {
    assert.equal(normalizeEmail(' Ada@Example.COM '), 'ada@example.com');
    assert.equal(isDuplicateStay(existingRow(), REQUEST), true);
    assert.equal(isDuplicateStay(existingRow({ checkout: '2026-10-14' }), REQUEST), false);
    assert.equal(isDuplicateStay(existingRow({ guest_email: 'other@example.com' }), REQUEST), false);
  });

  it('keeps the #67 locking status set and does not treat released rows as duplicates', () => {
    assert.deepEqual(INQUIRY_LOCK_STATUSES, DATE_LOCKING_STATUSES);
    assert.equal(INQUIRY_LOCK_STATUSES.includes('released'), false);
    assert.equal(INQUIRY_LOCK_STATUSES.includes('expired'), false);
  });
});

describe('inquiry write errors', () => {
  it('detects overlap and occupancy constraint failures', () => {
    assert.equal(isOverlapConstraint(overlapError()), true);
    assert.equal(isOverlapConstraint(new Error('deadlock')), false);
    assert.equal(isOccupancyConstraintViolation(occupancyError()), true);
  });
});

describe('inquiry response shape', () => {
  it('returns 201 for a new hold and 200 for a replay, with no 24h expiry claim', () => {
    assert.equal(inquiryHttpStatus(false), 201);
    assert.equal(inquiryHttpStatus(true), 200);
    const body = inquirySuccessBody({
      reservation: existingRow(),
      quote: SAMPLE_QUOTE,
      replayed: true
    });
    assert.equal(body.replayed, true);
    assert.equal(body.message, HOLD_MESSAGE);
    assert.equal(body.reservation.hold_expires_at, null);
    assert.match(body.message, /until an owner releases them/i);
    assert.doesNotMatch(body.message, /24/);
    assert.equal(quoteFromCreatedEvent({ metadata: { guests: 4, quote: SAMPLE_QUOTE } }, null), SAMPLE_QUOTE);
  });
});

describe('persistInquiry', () => {
  it('writes reservation + quote snapshot + audit event in one transaction with a NULL hold expiry', async () => {
    const { sql, calls } = makeSql();
    let transactionBatches = 0;
    const innerTransaction = sql.transaction;
    sql.transaction = async (queries) => {
      transactionBatches += 1;
      assert.equal(queries.length, 3);
      return innerTransaction(queries);
    };
    const result = await persistInquiry(sql, REQUEST);
    assert.equal(transactionBatches, 1);
    assert.equal(result.ok, true);
    assert.equal(result.replayed, false);
    assert.equal(result.reservation.id, REQUEST.id);
    assert.equal(result.reservation.hold_expires_at, null);
    assert.equal(result.quote.total, SAMPLE_QUOTE.total);

    const lock = calls.find((c) => /pg_advisory_xact_lock/i.test(c.text));
    const insertReservation = calls.find((c) => /INSERT INTO reservations/i.test(c.text));
    const insertEvent = calls.find((c) => /INSERT INTO booking_events/i.test(c.text));
    assert.ok(lock, 'expected shared date advisory lock');
    assert.equal(Number(lock.values[0]), DATE_LOCK_ADVISORY_KEY);
    assert.ok(insertReservation, 'expected reservation insert');
    assert.ok(insertEvent, 'expected booking_events insert');
    assert.equal(insertReservation.text.includes('hold_expires_at'), true);
    assert.match(insertReservation.text, /'inquiry_hold',\s*NULL/);
    assert.match(insertReservation.text, /WHERE NOT EXISTS/);
    assert.match(insertReservation.text, /owner_calendar_entries/);
    assert.doesNotMatch(insertReservation.text, /24 hours/i);
    assert.match(insertEvent.text, /inquiry_created/);
    assert.match(insertEvent.text, /WHERE EXISTS/);
    const metadataJson = insertEvent.values.find((v) => typeof v === 'string' && v.includes('"quote"'));
    const snapshot = JSON.parse(metadataJson);
    assert.equal(snapshot.guests, 4);
    assert.equal(snapshot.quote.total, SAMPLE_QUOTE.total);
    assert.equal(snapshot.trip_type, null);
    assert.equal(snapshot.bringing_pet, null);
    assert.equal(snapshot.pet_details, null);
    assert.equal(snapshot.planning_event, null);
    assert.equal(snapshot.event_details, null);
  });

  it('returns the existing reservation on retry and does not insert a second hold', async () => {
    const stored = existingRow();
    const { sql, calls } = makeSql({
      duplicates: [stored],
      events: [{ event_type: 'inquiry_created', metadata: { guests: 4, quote: SAMPLE_QUOTE } }]
    });
    const result = await persistInquiry(sql, { ...REQUEST, id: 'DB-20261010-RETRY1' });
    assert.equal(result.ok, true);
    assert.equal(result.replayed, true);
    assert.equal(result.reservation.id, stored.id);
    assert.equal(result.quote.total, SAMPLE_QUOTE.total);
    assert.equal(calls.some((c) => /INSERT INTO reservations/i.test(c.text)), false);
    assert.equal(calls.some((c) => /INSERT INTO booking_events/i.test(c.text)), false);
  });

  it('treats an overlap race from the same guest as a replay, not a second lock', async () => {
    let lookups = 0;
    const stored = existingRow();
    const { sql, calls } = makeSql({ overlapOnInsert: true });
    const original = sql;
    function sqlWithRace(strings, ...values) {
      const text = sqlText(strings);
      if (/FROM reservations/i.test(text) && /lower\(guest_email\)/i.test(text)) {
        lookups += 1;
        return Promise.resolve(lookups === 1 ? [] : [stored]);
      }
      return original(strings, ...values);
    }
    sqlWithRace.transaction = original.transaction;
    const result = await persistInquiry(sqlWithRace, REQUEST);
    assert.equal(result.ok, true);
    assert.equal(result.replayed, true);
    assert.equal(result.reservation.id, stored.id);
    assert.equal(calls.some((c) => /INSERT INTO reservations/i.test(c.text)), true);
  });

  it('returns dates_unavailable when overlap belongs to another guest', async () => {
    const { sql } = makeSql({ overlapOnInsert: true, duplicates: [] });
    const result = await persistInquiry(sql, REQUEST);
    assert.equal(result.ok, false);
    assert.equal(result.status, 409);
    assert.equal(result.error, DATES_JUST_HELD.error);
    assert.equal(result.message, DATES_JUST_HELD.message);
  });

  it('returns dates_unavailable when an owner block wins the concurrent write', async () => {
    const { sql, calls } = makeSql({
      inserted: undefined
    });
    const original = sql;
    function sqlEmptyInsert(strings, ...values) {
      const text = sqlText(strings);
      if (/INSERT INTO reservations/i.test(text)) return Promise.resolve([]);
      return original(strings, ...values);
    }
    sqlEmptyInsert.transaction = original.transaction;
    const result = await persistInquiry(sqlEmptyInsert, REQUEST);
    assert.equal(result.ok, false);
    assert.equal(result.status, 409);
    assert.equal(result.error, REQUEST_VS_OWNER.error);
    assert.equal(result.message, REQUEST_VS_OWNER.message);
    assert.equal(calls.some((c) => /UPDATE reservations/i.test(c.text)), false);
  });

  it('keeps the occupancy migration response for 13–14 guests', async () => {
    const { sql } = makeSql({ occupancyOnInsert: true });
    const result = await persistInquiry(sql, { ...REQUEST, guests: 14 });
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
    assert.equal(result.error, 'occupancy_migration_pending');
  });
});

function optionFieldsFromInsert(insertReservation) {
  const values = insertReservation.values;
  return {
    trip_type: values[8],
    bringing_pet: values[9],
    pet_details: values[10],
    planning_event: values[11],
    event_details: values[12]
  };
}

function metadataFromCalls(calls) {
  const insertEvent = calls.find((c) => /INSERT INTO booking_events/i.test(c.text));
  const metadataJson = insertEvent.values.find((v) => typeof v === 'string' && v.includes('"quote"'));
  return JSON.parse(metadataJson);
}

describe('optional inquiry trip / pets / event', () => {
  it('omits all optional fields as null and does not invent answers', async () => {
    const omitted = normalizeInquiryOptions({});
    assert.equal(omitted.ok, true);
    assert.equal(omitted.trip_type, null);
    assert.equal(omitted.bringing_pet, null);
    assert.equal(omitted.pet_details, null);
    assert.equal(omitted.planning_event, null);
    assert.equal(omitted.event_details, null);

    const { sql, calls } = makeSql();
    const result = await persistInquiry(sql, REQUEST);
    assert.equal(result.ok, true);
    assert.deepEqual(optionFieldsFromInsert(calls.find((c) => /INSERT INTO reservations/i.test(c.text))), {
      trip_type: null,
      bringing_pet: null,
      pet_details: null,
      planning_event: null,
      event_details: null
    });
    const snapshot = metadataFromCalls(calls);
    assert.equal(snapshot.trip_type, null);
    assert.equal(snapshot.bringing_pet, null);
    assert.equal(snapshot.planning_event, null);
  });

  it('stores a valid trip_type only', async () => {
    const normalized = normalizeInquiryOptions({ trip_type: 'Leisure' });
    assert.equal(normalized.ok, true);
    assert.equal(normalized.trip_type, 'Leisure');
    assert.equal(normalized.bringing_pet, null);

    const { sql, calls } = makeSql();
    const result = await persistInquiry(sql, { ...REQUEST, trip_type: 'Family' });
    assert.equal(result.ok, true);
    const inserted = optionFieldsFromInsert(calls.find((c) => /INSERT INTO reservations/i.test(c.text)));
    assert.equal(inserted.trip_type, 'Family');
    assert.equal(inserted.bringing_pet, null);
    assert.equal(metadataFromCalls(calls).trip_type, 'Family');
  });

  it('rejects an invalid trip_type', () => {
    const rejected = normalizeInquiryOptions({ trip_type: 'Vacation' });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.status, 400);
    assert.equal(rejected.error, INVALID_TRIP_TYPE.error);
    assert.equal(rejected.message, INVALID_TRIP_TYPE.message);
    assert.equal(normalizeInquiryOptions({ trip_type: 'leisure' }).error, 'invalid_trip_type');
    assert.equal(normalizeInquiryOptions({ trip_type: 1 }).error, 'invalid_trip_type');
  });

  it('stores pet Yes + details and clears details when pet is No', async () => {
    const yes = normalizeInquiryOptions({ bringing_pet: 'Yes', pet_details: '  small dog  ' });
    assert.equal(yes.ok, true);
    assert.equal(yes.bringing_pet, true);
    assert.equal(yes.pet_details, 'small dog');

    const no = normalizeInquiryOptions({ bringing_pet: 'No', pet_details: 'ignored' });
    assert.equal(no.ok, true);
    assert.equal(no.bringing_pet, false);
    assert.equal(no.pet_details, null);

    const { sql, calls } = makeSql();
    await persistInquiry(sql, { ...REQUEST, bringing_pet: true, pet_details: 'One small dog' });
    const stored = optionFieldsFromInsert(calls.find((c) => /INSERT INTO reservations/i.test(c.text)));
    assert.equal(stored.bringing_pet, true);
    assert.equal(stored.pet_details, 'One small dog');
    assert.equal(metadataFromCalls(calls).pet_details, 'One small dog');

    const cleared = makeSql();
    await persistInquiry(cleared.sql, { ...REQUEST, bringing_pet: false, pet_details: 'ignored' });
    const clearedFields = optionFieldsFromInsert(cleared.calls.find((c) => /INSERT INTO reservations/i.test(c.text)));
    assert.equal(clearedFields.bringing_pet, false);
    assert.equal(clearedFields.pet_details, null);
    assert.equal(metadataFromCalls(cleared.calls).pet_details, null);
  });

  it('stores event Yes + details and omits unanswered event fields', async () => {
    const yes = normalizeInquiryOptions({ planning_event: true, event_details: '  family reunion  ' });
    assert.equal(yes.ok, true);
    assert.equal(yes.planning_event, true);
    assert.equal(yes.event_details, 'family reunion');

    const unanswered = normalizeInquiryOptions({});
    assert.equal(unanswered.planning_event, null);
    assert.equal(unanswered.event_details, null);

    const { sql, calls } = makeSql();
    await persistInquiry(sql, { ...REQUEST, planning_event: true, event_details: 'family reunion' });
    const stored = optionFieldsFromInsert(calls.find((c) => /INSERT INTO reservations/i.test(c.text)));
    assert.equal(stored.planning_event, true);
    assert.equal(stored.event_details, 'family reunion');
    assert.equal(metadataFromCalls(calls).planning_event, true);
    assert.equal(metadataFromCalls(calls).event_details, 'family reunion');
  });
});

describe('resolveDatesConflict', () => {
  it('replays the same-guest hold instead of 409 when dates look blocked', async () => {
    const stored = existingRow();
    const { sql } = makeSql({
      duplicates: [stored],
      events: [{ event_type: 'inquiry_created', metadata: { guests: 4, quote: SAMPLE_QUOTE } }]
    });
    const result = await resolveDatesConflict(sql, REQUEST, 'Those dates are currently being held or are booked.');
    assert.equal(result.ok, true);
    assert.equal(result.replayed, true);
    assert.equal(result.reservation.id, stored.id);
  });

  it('keeps dates_unavailable when the blocker is another guest or channel', async () => {
    const { sql } = makeSql({ duplicates: [] });
    const result = await resolveDatesConflict(sql, REQUEST, 'Those dates are currently being held or are booked.');
    assert.equal(result.ok, false);
    assert.equal(result.status, 409);
    assert.equal(result.error, 'dates_unavailable');
  });
});
