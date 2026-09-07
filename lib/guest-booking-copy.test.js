const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  HOLD_MESSAGE,
  MAX_GUESTS,
  CTA,
  LISTING_CHARGE_NOTE,
  clampGuests,
  guestsLabel,
  listingCta,
  failClosedCopy,
  inquiryPayload,
  successCopy
} = require('../assets/js/guest-booking-copy');

describe('guest booking copy', () => {
  it('matches tip hold semantics and never mentions 24 hours', () => {
    assert.equal(
      HOLD_MESSAGE,
      'Your dates are reserved while CJT reviews your request and remain unavailable until an owner releases them.'
    );
    assert.doesNotMatch(HOLD_MESSAGE, /24/);
    assert.doesNotMatch(LISTING_CHARGE_NOTE, /24/);
    const fresh = successCopy({ replayed: false, reservationId: 'DB-1', serverMessage: HOLD_MESSAGE });
    const replay = successCopy({ replayed: true, reservationId: 'DB-1', serverMessage: HOLD_MESSAGE });
    assert.doesNotMatch(fresh.hold + fresh.next + replay.hold + replay.next, /24/);
    assert.match(fresh.hold, /until an owner releases them/i);
    assert.match(replay.next, /already has this request/i);
    assert.equal(replay.isReplay, true);
    assert.equal(fresh.isReplay, false);
  });

  it('clamps occupancy to catalog max 14', () => {
    assert.equal(MAX_GUESTS, 14);
    assert.equal(clampGuests(0), 1);
    assert.equal(clampGuests(14), 14);
    assert.equal(clampGuests(15), 14);
    assert.equal(guestsLabel(1), '1 guest');
    assert.equal(guestsLabel(14), '14 guests');
  });

  it('builds listing CTAs from dates, quote, and calendar health', () => {
    assert.equal(listingCta({ hasDates: false, hasQuote: false, calendarHealthy: true }), CTA.checkDates);
    assert.equal(listingCta({ hasDates: true, hasQuote: false, calendarHealthy: true }), CTA.seeQuote);
    assert.equal(listingCta({ hasDates: true, hasQuote: true, calendarHealthy: true }), CTA.requestToBook);
    assert.equal(listingCta({ hasDates: true, hasQuote: true, calendarHealthy: false }), CTA.checkDates);
  });

  it('uses server fail-closed message and never treats missing health as open', () => {
    assert.equal(
      failClosedCopy({ message: 'One or more calendar feeds could not be verified. Availability is paused until feeds are healthy.' }),
      'One or more calendar feeds could not be verified. Availability is paused until feeds are healthy.'
    );
    assert.match(failClosedCopy(null), /cannot be requested/i);
  });

  it('sends only tip inquiry fields', () => {
    const payload = inquiryPayload({
      name: ' Ada Lovelace ',
      email: 'ada@example.com',
      phone: '409-555-0100',
      message: 'Family trip; one small dog if possible. Not a structured pet field.',
      checkin: '2026-10-10',
      checkout: '2026-10-13',
      guests: 14,
      trip_type: 'Family trip',
      pets: 'yes',
      event: 'yes'
    });
    assert.deepEqual(Object.keys(payload).sort(), ['checkin', 'checkout', 'email', 'guests', 'message', 'name', 'phone']);
    assert.equal(payload.guests, '14');
    assert.equal(payload.name, 'Ada Lovelace');
    assert.equal(payload.trip_type, undefined);
    assert.equal(payload.pets, undefined);
    assert.equal(payload.event, undefined);
  });

  it('does not claim a new hold on replay', () => {
    const copy = successCopy({ replayed: true, reservationId: 'DB-20261010-ABC123', serverMessage: HOLD_MESSAGE });
    assert.equal(copy.title, 'Request already received');
    assert.equal(copy.reference, 'DB-20261010-ABC123');
    assert.doesNotMatch(copy.title + copy.next, /new hold|brand-new|just reserved/i);
  });
});
