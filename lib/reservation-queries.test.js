const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DATE_LOCKING_STATUSES } = require('./booking-transitions');
const {
  DEFAULT_RESERVATION_LOOKBACK_DAYS,
  addUtcDays,
  isIsoDate,
  listReservations,
  overlapsReservationWindow,
  readReservationWindowParams,
  resolveReservationWindow,
  todayInPropertyTz
} = require('./reservation-queries');

function sqlText(strings) {
  return strings.join('?');
}

function makeSql(rows = []) {
  const calls = [];
  function sql(strings, ...values) {
    const text = sqlText(strings);
    calls.push({ text, values });
    return Promise.resolve(rows);
  }
  return { sql, calls };
}

const INQUIRY_READ_FIELDS = [
  'trip_type',
  'bringing_pet',
  'pet_details',
  'planning_event',
  'event_details'
];

function reservationListLimit(text) {
  const withoutQuoteSubquery = String(text || '').replace(
    /LEFT JOIN LATERAL \([\s\S]*?LIMIT 1\s*\) q ON true/i,
    ''
  );
  const match = withoutQuoteSubquery.match(/LIMIT\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

function assertInquiryReadFieldsSelected(text) {
  for (const field of INQUIRY_READ_FIELDS) {
    assert.match(String(text || ''), new RegExp(`\\br\\.${field}\\b`));
  }
}

function nullInquiryFields() {
  return {
    trip_type: null,
    bringing_pet: null,
    pet_details: null,
    planning_event: null,
    event_details: null
  };
}

describe('resolveReservationWindow', () => {
  it('defaults to 365-day lookback and unbounded future in property timezone', () => {
    const now = new Date('2026-09-08T04:30:00.000Z');
    const today = todayInPropertyTz(now);
    assert.equal(today, '2026-09-07');
    const window = resolveReservationWindow({ now });
    assert.equal(window.from, addUtcDays(today, -DEFAULT_RESERVATION_LOOKBACK_DAYS));
    assert.equal(window.from, '2025-09-07');
    assert.equal(window.to, null);
    assert.equal(DEFAULT_RESERVATION_LOOKBACK_DAYS, 365);
  });

  it('accepts explicit from/to and keeps to inclusive', () => {
    const window = resolveReservationWindow({ from: '2026-01-01', to: '2026-12-31' });
    assert.deepEqual(window, { from: '2026-01-01', to: '2026-12-31' });
  });

  it('rejects inverted and invalid dates', () => {
    assert.throws(
      () => resolveReservationWindow({ from: '2026-12-31', to: '2026-01-01' }),
      (error) => error.code === 'invalid_date_range' && error.status === 400
    );
    assert.throws(
      () => resolveReservationWindow({ from: '2026-13-40' }),
      (error) => error.code === 'invalid_date_range'
    );
    assert.throws(
      () => resolveReservationWindow({ to: 'not-a-date' }),
      (error) => error.code === 'invalid_date_range'
    );
  });
});

describe('readReservationWindowParams', () => {
  it('reads from/to from Vercel query or the request URL', () => {
    assert.deepEqual(
      readReservationWindowParams({ query: { from: '2026-06-01', to: '2027-06-01' } }),
      { from: '2026-06-01', to: '2027-06-01' }
    );
    assert.deepEqual(
      readReservationWindowParams({ url: '/api/owner?from=2026-06-01&to=2028-12-20' }),
      { from: '2026-06-01', to: '2028-12-20' }
    );
  });
});

describe('overlapsReservationWindow', () => {
  const from = '2025-09-07';

  it('keeps a far-future stay that ORDER BY checkin ASC LIMIT would drop', () => {
    const past = Array.from({ length: 500 }, (_, index) => ({
      id: `old-${index}`,
      checkin: '2018-01-01',
      checkout: '2018-01-08'
    }));
    const future = { id: 'future-2028', checkin: '2028-12-20', checkout: '2028-12-27' };
    const rows = [...past, future].sort((a, b) => a.checkin.localeCompare(b.checkin));
    const limited = rows.slice(0, 400);
    assert.equal(limited.some((row) => row.id === 'future-2028'), false);
    const ranged = rows.filter((row) => overlapsReservationWindow(row, { from, to: null }));
    assert.equal(ranged.length, 1);
    assert.equal(ranged[0].id, 'future-2028');
  });

  it('includes stays that overlap the from bound and treats to as inclusive', () => {
    const spanning = { checkin: '2025-09-01', checkout: '2025-09-10' };
    const onTo = { checkin: '2026-12-31', checkout: '2027-01-03' };
    const afterTo = { checkin: '2027-01-01', checkout: '2027-01-05' };
    const departedOnFrom = { checkin: '2025-09-01', checkout: '2025-09-07' };
    assert.equal(overlapsReservationWindow(spanning, { from, to: null }), true);
    assert.equal(overlapsReservationWindow(departedOnFrom, { from, to: null }), false);
    assert.equal(overlapsReservationWindow(onTo, { from, to: '2026-12-31' }), true);
    assert.equal(overlapsReservationWindow(afterTo, { from, to: '2026-12-31' }), false);
  });
});

describe('listReservations', () => {
  it('queries a date range with no reservation-list LIMIT', async () => {
    const { sql, calls } = makeSql();
    await listReservations(sql, { includeClosed: true, now: new Date('2026-09-07T17:00:00.000Z') });
    assert.equal(calls.length, 1);
    assert.match(calls[0].text, /r\.checkout > \?::date/);
    assert.doesNotMatch(calls[0].text, /r\.checkin <= \?::date/);
    assert.equal(reservationListLimit(calls[0].text), null);
    assert.equal(calls[0].values[0], '2025-09-07');
    assert.equal(calls[0].values[1], true);
  });

  it('filters locking statuses unless includeClosed is set', async () => {
    const { sql, calls } = makeSql();
    await listReservations(sql, { from: '2026-01-01' });
    assert.match(
      calls[0].text,
      /status IN \('inquiry_hold','hold_verified','contract_sent','contract_signed','confirmed'\)/
    );
    assert.deepEqual(DATE_LOCKING_STATUSES, [
      'inquiry_hold',
      'hold_verified',
      'contract_sent',
      'contract_signed',
      'confirmed'
    ]);
    assert.equal(calls[0].values[1], false);
  });

  it('applies an inclusive to bound and keeps the latest-quote subquery LIMIT 1', async () => {
    const { sql, calls } = makeSql();
    await listReservations(sql, {
      includeClosed: true,
      withQuote: true,
      from: '2026-01-01',
      to: '2026-12-31'
    });
    assert.equal(calls.length, 1);
    assert.match(calls[0].text, /r\.checkin <= \?::date/);
    assert.match(calls[0].text, /LEFT JOIN LATERAL/);
    assert.match(calls[0].text, /FROM booking_events[\s\S]*LIMIT 1/);
    assert.equal(reservationListLimit(calls[0].text), null);
    assert.deepEqual(calls[0].values, ['2026-01-01', '2026-12-31', true]);
  });

  it('selects trip/pets/event fields on every list branch (null OK)', async () => {
    const unanswered = { id: 'DB-old-row', ...nullInquiryFields() };
    const branches = [
      { includeClosed: true, now: new Date('2026-09-07T17:00:00.000Z') },
      { from: '2026-01-01', to: '2026-12-31' },
      { withQuote: true, from: '2026-01-01' },
      { withQuote: true, includeClosed: true, from: '2026-01-01', to: '2026-12-31' }
    ];
    for (const options of branches) {
      const { sql, calls } = makeSql([unanswered]);
      const rows = await listReservations(sql, options);
      assert.equal(calls.length, 1);
      assertInquiryReadFieldsSelected(calls[0].text);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, 'DB-old-row');
      for (const field of INQUIRY_READ_FIELDS) {
        assert.ok(Object.prototype.hasOwnProperty.call(rows[0], field));
        assert.equal(rows[0][field], null);
      }
    }
  });
});

describe('reservation list sources', () => {
  it('removes hard LIMITs from getActiveReservations and owner GET', () => {
    const dbSource = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
    const ownerSource = fs.readFileSync(path.join(__dirname, '../api/owner.js'), 'utf8');
    assert.doesNotMatch(dbSource, /LIMIT 400/);
    assert.match(dbSource, /listReservations/);
    assert.match(dbSource, /async function expireHolds/);
    assert.doesNotMatch(ownerSource, /LIMIT 250/);
    assert.match(ownerSource, /readReservationWindowParams/);
    assert.match(ownerSource, /listReservations\(sql,\{includeClosed:true,withQuote:true/);
  });

  it('treats YYYY-MM-DD as a real calendar day', () => {
    assert.equal(isIsoDate('2026-09-07'), true);
    assert.equal(isIsoDate('2026-02-31'), false);
    assert.equal(isIsoDate('2026-13-01'), false);
  });
});
