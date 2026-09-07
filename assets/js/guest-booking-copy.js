'use strict';

/**
 * Guest booking copy and inquiry payload helpers.
 * Wire: POST /api/inquiries accepts only name, email, phone, message, checkin, checkout, guests.
 * Hold copy matches lib/inquiry-create.js HOLD_MESSAGE. No 24-hour language.
 */

const HOLD_MESSAGE = 'Your dates are reserved while CJT reviews your request and remain unavailable until an owner releases them.';
const MAX_GUESTS = 14;
const AVAILABILITY_UNKNOWN = 'Live availability is temporarily unavailable. Dates cannot be requested until calendars are verified.';

const CTA = Object.freeze({
  checkDates: 'Check dates',
  seeQuote: 'See quote',
  requestToBook: 'Request to Book'
});

const LISTING_CHARGE_NOTE = "You won't be charged yet. Requesting these dates reserves them until CJT reviews or an owner releases them.";

function clampGuests(value) {
  const n = Number(value);
  if (!Number.isInteger(n)) return 1;
  return Math.max(1, Math.min(MAX_GUESTS, n));
}

function guestsLabel(count) {
  const n = clampGuests(count);
  return `${n} guest${n === 1 ? '' : 's'}`;
}

function listingCta({ hasDates, hasQuote, calendarHealthy }) {
  if (calendarHealthy === false) return CTA.checkDates;
  if (!hasDates) return CTA.checkDates;
  if (!hasQuote) return CTA.seeQuote;
  return CTA.requestToBook;
}

function failClosedCopy(body, fallback) {
  const msg = body && typeof body.message === 'string' ? body.message.trim() : '';
  return msg || fallback || AVAILABILITY_UNKNOWN;
}

function inquiryPayload({ name, email, phone, message, checkin, checkout, guests }) {
  return {
    name: String(name || '').trim(),
    email: String(email || '').trim(),
    phone: String(phone || '').trim(),
    message: String(message || '').trim(),
    checkin: String(checkin || '').trim(),
    checkout: String(checkout || '').trim(),
    guests: String(clampGuests(guests))
  };
}

function successCopy({ replayed, reservationId, serverMessage }) {
  const hold = (serverMessage && String(serverMessage).trim()) || HOLD_MESSAGE;
  const reference = reservationId ? String(reservationId) : '';
  if (replayed) {
    return {
      title: 'Request already received',
      hold,
      reference,
      next: 'CJT Realty already has this request. Your dates remain reserved until an owner releases them. Agreement and payment steps are owner-controlled.',
      isReplay: true
    };
  }
  return {
    title: 'Reservation received',
    hold,
    reference,
    next: 'CJT Realty will review your request. Agreement and payment steps are owner-controlled and come next only if they accept.',
    isReplay: false
  };
}

const api = {
  HOLD_MESSAGE,
  MAX_GUESTS,
  AVAILABILITY_UNKNOWN,
  CTA,
  LISTING_CHARGE_NOTE,
  clampGuests,
  guestsLabel,
  listingCta,
  failClosedCopy,
  inquiryPayload,
  successCopy
};

if (typeof module === 'object' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.CJTGuestBooking = api;
}
