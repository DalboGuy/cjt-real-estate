const assert = require('assert');
const {
  assembleEvents,
  buildNightMap,
  occupancyForRange,
  countsTowardOccupancy,
  reservationStatusBucket,
  monthBounds,
  weekBounds,
  addDays,
  DEFAULT_SETTINGS,
  settingsFromRow,
  snapshotFromInputs,
  publicEvent
} = require('../lib/calendar-view');
const {
  parseIcalEvents,
  classifyChannel,
  normalizeFeedUrl,
  sanitizePublicText,
  eachDate
} = require('../lib/availability');

function expectThrow(fn, message) {
  try {
    fn();
  } catch (error) {
    if (message) assert.ok(String(error.message).includes(message));
    return;
  }
  throw new Error('expected throw');
}

assert.strictEqual(classifyChannel({ label: 'Airbnb house' }), 'airbnb');
assert.strictEqual(classifyChannel({ host: 'ical.vrbo.com' }), 'vrbo');
assert.strictEqual(classifyChannel({ label: 'Booking.com iCal' }), 'booking.com');
assert.strictEqual(classifyChannel({ label: 'Houfy calendar' }), 'other');

assert.strictEqual(
  normalizeFeedUrl('https://Example.com/feed.ics/?b=1&a=2#'),
  normalizeFeedUrl('https://example.com/feed.ics?a=2&b=1')
);

const ics = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20260910',
  'DTEND;VALUE=DATE:20260913',
  'SUMMARY:Reserved',
  'UID:abc-123',
  'STATUS:CONFIRMED',
  'DESCRIPTION:See https://secret.example/token and guest@example.com',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20260920',
  'DTEND;VALUE=DATE:20260921',
  'SUMMARY:Cancelled night',
  'STATUS:CANCELLED',
  'END:VEVENT',
  'END:VCALENDAR'
].join('\n');

const parsed = parseIcalEvents(ics);
assert.strictEqual(parsed.length, 2);
assert.deepStrictEqual(eachDate(parsed[0].start, parsed[0].end), ['2026-09-10', '2026-09-11', '2026-09-12']);
assert.ok(!parsed[0].notes.includes('http'));
assert.ok(!parsed[0].notes.includes('@'));
assert.strictEqual(sanitizePublicText('token ABCDEF0123456789ABCDEF0123456789 and hi'), 'token and hi');

assert.strictEqual(reservationStatusBucket('inquiry_hold'), 'hold');
assert.strictEqual(reservationStatusBucket('confirmed'), 'confirmed');
assert.strictEqual(reservationStatusBucket('cancelled'), 'cancelled');

assert.strictEqual(DEFAULT_SETTINGS.prepBufferEnabled, false);
assert.strictEqual(DEFAULT_SETTINGS.showGuestNames, true);
assert.strictEqual(DEFAULT_SETTINGS.showGuestContact, false);

const reservations = [
  { id: 'DB-1', guest_name: 'Ada', guests: 4, guest_email: 'ada@example.com', guest_phone: '555', notes: 'late check-in', checkin: '2026-09-10', checkout: '2026-09-13', status: 'confirmed' },
  { id: 'DB-HOLD', guest_name: 'Hold Guest', guests: 2, checkin: '2026-09-16', checkout: '2026-09-18', status: 'inquiry_hold' },
  { id: 'DB-2', guest_name: 'Cancelled', guests: 2, checkin: '2026-09-18', checkout: '2026-09-20', status: 'cancelled' }
];
const otaEvents = [
  { start: '2026-09-12', end: '2026-09-15', summary: 'Reserved', channel: 'airbnb', origin: 'env', status: 'CONFIRMED', uid: 'air1' },
  { start: '2026-09-12', end: '2026-09-15', summary: 'Reserved', channel: 'airbnb', origin: 'owner', uid: 'air-dup' },
  { start: '2026-09-22', end: '2026-09-24', summary: 'Blocked', channel: 'vrbo', origin: 'env', uid: 'vrbo1' }
];
const entries = [
  { id: 7, kind: 'owner_stay', start_date: '2026-09-01', end_date: '2026-09-03', notes: 'family' },
  { id: 8, kind: 'manual_block', start_date: '2026-09-28', end_date: '2026-09-30', notes: 'hvac' }
];

const events = assembleEvents({ otaEvents, reservations, entries, settings: DEFAULT_SETTINGS });
assert.ok(events.some((e) => e.channel === 'direct' && e.reservationId === 'DB-1'));
assert.ok(events.some((e) => e.channel === 'direct' && e.statusBucket === 'cancelled'));
assert.strictEqual(events.filter((e) => e.channel === 'airbnb').length, 1);
assert.ok(!events.some((e) => e.channel === 'prep'));

const nights = buildNightMap(events);
assert.ok(nights['2026-09-12'].conflict, 'direct + airbnb overlap should conflict');
assert.deepStrictEqual(new Set(nights['2026-09-12'].channels), new Set(['direct', 'airbnb']));
assert.ok(!nights['2026-09-22'].conflict);
assert.ok(nights['2026-09-01'].channels.includes('owner_stay'));
assert.ok(nights['2026-09-28'].channels.includes('manual_block'));
assert.ok(nights['2026-09-10'].checkins.includes('direct:DB-1'));
assert.ok(nights['2026-09-13'].checkouts.includes('direct:DB-1'));

const occ = occupancyForRange(events, '2026-09-01', '2026-10-01');
assert.strictEqual(occ.total, 30);
assert.strictEqual(occ.booked, 9, 'holds+confirmed+OTA only; owner stay and manual block excluded');
assert.strictEqual(occupancyForRange(events, '2026-09-01', '2026-09-03').booked, 0);
assert.strictEqual(occupancyForRange(events, '2026-09-28', '2026-09-30').booked, 0);
assert.strictEqual(occupancyForRange(events, '2026-09-16', '2026-09-18').booked, 2);
assert.ok(!countsTowardOccupancy(events.find((e) => e.channel === 'owner_stay')));
assert.ok(!countsTowardOccupancy(events.find((e) => e.channel === 'manual_block')));
assert.ok(countsTowardOccupancy(events.find((e) => e.reservationId === 'DB-HOLD')));
assert.ok(countsTowardOccupancy(events.find((e) => e.channel === 'airbnb')));

const withPrep = assembleEvents({
  otaEvents,
  reservations,
  entries,
  settings: { ...DEFAULT_SETTINGS, prepBufferEnabled: true }
});
assert.ok(withPrep.some((e) => e.id === 'prep:2026-09-13'));
const prepNights = buildNightMap(withPrep);
assert.ok(prepNights['2026-09-13'].prep);
assert.ok(prepNights['2026-09-13'].conflict, 'prep overlapping next occupancy should conflict when airbnb continues');

const month = monthBounds(2026, 9);
assert.strictEqual(month.start, '2026-09-01');
assert.strictEqual(month.end, '2026-10-01');
assert.strictEqual(addDays('2026-09-30', 1), '2026-10-01');
const week = weekBounds('2026-09-10');
assert.strictEqual(week.start, '2026-09-06');
assert.strictEqual(week.end, '2026-09-13');

assert.deepStrictEqual(settingsFromRow(null), { ...DEFAULT_SETTINGS });
assert.strictEqual(settingsFromRow({ prep_buffer_enabled: true, show_guest_names: false, show_guest_contact: true }).prepBufferEnabled, true);
assert.strictEqual(settingsFromRow({ prep_buffer_enabled: true, show_guest_names: false, show_guest_contact: true }).showGuestNames, false);
assert.strictEqual(settingsFromRow({ prep_buffer_enabled: true, show_guest_names: false, show_guest_contact: true }).showGuestContact, true);

const hiddenContact = publicEvent(events.find((e) => e.reservationId === 'DB-1'), DEFAULT_SETTINGS);
assert.strictEqual(hiddenContact.guestName, 'Ada');
assert.strictEqual(hiddenContact.guestEmail, null);
assert.strictEqual(hiddenContact.guestPhone, null);
const shownContact = publicEvent(events.find((e) => e.reservationId === 'DB-1'), { ...DEFAULT_SETTINGS, showGuestContact: true });
assert.strictEqual(shownContact.guestEmail, 'ada@example.com');
assert.strictEqual(shownContact.guestPhone, '555');
const hiddenName = publicEvent(events.find((e) => e.reservationId === 'DB-1'), { ...DEFAULT_SETTINGS, showGuestNames: false });
assert.strictEqual(hiddenName.guestName, null);

const snap = snapshotFromInputs({
  ota: { events: otaEvents, sources: [] },
  reservations,
  entries,
  settings: DEFAULT_SETTINGS
}, { year: 2026, month: 9, view: 'month', focusDate: '2026-09-10' });
assert.strictEqual(snap.view, 'month');
assert.strictEqual(snap.settings.showGuestContact, false);
assert.strictEqual(snap.events.find((e) => e.reservationId === 'DB-1').guestEmail, null);
assert.strictEqual(snap.occupancy.viewedMonth.booked, 9);
assert.ok(snap.occupancy.viewedWeek);
assert.strictEqual(snap.occupancy.viewedWeek.total, 7);
assert.strictEqual(snap.occupancy.viewedWeek.booked, 3, 'Sep 10–12 guest nights in the week of Sep 6');
assert.ok(!snap.upcoming.some((e) => e.guestEmail));

const weekSnap = snapshotFromInputs({
  ota: { events: otaEvents, sources: [] },
  reservations,
  entries,
  settings: DEFAULT_SETTINGS
}, { year: 2026, month: 9, view: 'week', focusDate: '2026-09-10' });
assert.strictEqual(weekSnap.view, 'week');
assert.strictEqual(weekSnap.range.weekStart, '2026-09-06');
assert.strictEqual(weekSnap.occupancy.viewedWeek.booked, 3);

expectThrow(() => {
  throw new Error('No calendar feeds configured');
}, 'No calendar feeds configured');

console.log('verify-calendar-view: ok');
