const assert = require('assert');
const {
  AGREEMENT_VERSION,
  AGREEMENT_LABEL,
  AGREEMENT_NOT_VERIFIED_NOTE,
  paymentScheduleCopy,
  quoteHash,
  materialQuoteChanged,
  buildAgreementDocument,
  typedNameValid,
  validateAcceptanceInput,
  createCompletionToken,
  hashCompletionToken,
  bindCompletionLink,
  acceptanceRecord
} = require('../lib/agreement');
const { lifecycleFromEvents } = require('../lib/booking-lifecycle');
const { eachDate } = require('../lib/pricing');
const fs = require('fs');
const path = require('path');

function expectThrow(fn, code) {
  try {
    fn();
  } catch (error) {
    assert.strictEqual(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    return;
  }
  throw new Error(`expected ${code}`);
}

assert.strictEqual(AGREEMENT_VERSION, 'ssm-rental-v1');
assert.strictEqual(AGREEMENT_LABEL, 'Agreement accepted');
assert.match(AGREEMENT_NOT_VERIFIED_NOTE, /not a signature or identity verification/i);

const splitQuote = {
  currency: 'USD',
  checkin: '2026-12-10',
  checkout: '2026-12-13',
  guests: 4,
  lodgingSubtotal: 2000,
  cleaningFee: 240,
  taxes: 336,
  total: 2576,
  paymentSchedule: {
    mode: 'split',
    dueAtBooking: 1288,
    remainingBalance: 1288,
    balanceDueDateLabel: 'Nov 10, 2026'
  }
};
const fullQuote = {
  ...splitQuote,
  checkin: '2026-09-10',
  checkout: '2026-09-13',
  paymentSchedule: { mode: 'full', dueAtBooking: 2576, remainingBalance: 0, reason: 'within_30_days' }
};

const splitCopy = paymentScheduleCopy(splitQuote.paymentSchedule, splitQuote.total);
assert.match(splitCopy.headline, /50%/);
assert.match(splitCopy.deferredNote, /deferred/i);
const fullCopy = paymentScheduleCopy(fullQuote.paymentSchedule, fullQuote.total);
assert.match(fullCopy.headline, /in full/i);

assert.ok(!materialQuoteChanged(splitQuote, { ...splitQuote }));
assert.ok(materialQuoteChanged(splitQuote, { ...splitQuote, total: 3000, lodgingSubtotal: 2400 }));
assert.notStrictEqual(quoteHash(splitQuote), quoteHash(fullQuote));

const reservation = {
  id: 'DB-20261210-TEST01',
  guest_name: 'Alex Guest',
  guests: 4,
  checkin: '2026-12-10',
  checkout: '2026-12-13'
};
const document = buildAgreementDocument({ reservation, quote: splitQuote });
assert.strictEqual(document.version, AGREEMENT_VERSION);
assert.match(document.contentText, /Sand & Sea Manor/);
assert.match(document.contentText, /1720 Avenue M/);
assert.match(document.contentText, /DB-20261210-TEST01/);
assert.match(document.contentText, /14 overnight guests/);
assert.match(document.contentText, /No smoking/);
assert.match(document.contentText, /does not confirm/);
assert.ok(document.contentHash);

const revised = buildAgreementDocument({ reservation, quote: { ...splitQuote, total: 3000, lodgingSubtotal: 2400, taxes: 360 } });
assert.notStrictEqual(revised.contentHash, document.contentHash);

assert.strictEqual(typedNameValid('Alex Guest'), true);
assert.strictEqual(typedNameValid('Mary-Anne O\'Neil'), true);
assert.strictEqual(typedNameValid('Alex'), false);
assert.strictEqual(typedNameValid(''), false);
expectThrow(() => validateAcceptanceInput({ agreed: false, acceptedName: 'Alex Guest' }), 'agreement_not_checked');
expectThrow(() => validateAcceptanceInput({ agreed: true, acceptedName: 'Alex' }), 'invalid_accepted_name');
assert.strictEqual(validateAcceptanceInput({ agreed: true, acceptedName: '  Alex Guest  ' }), 'Alex Guest');

const token = createCompletionToken();
assert.strictEqual(token.length, 64);
assert.notStrictEqual(hashCompletionToken(token), token);
assert.strictEqual(hashCompletionToken(token), hashCompletionToken(token.toUpperCase()));
assert.match(bindCompletionLink('https://preview.example', token), /\/complete-booking\?token=/);

const record = acceptanceRecord({
  reservationId: reservation.id,
  document,
  acceptedName: 'Alex Guest',
  acceptedAt: '2026-09-07T12:00:00.000Z'
});
assert.strictEqual(record.label, AGREEMENT_LABEL);
assert.strictEqual(record.identityVerified, false);
assert.strictEqual(record.signatureVerified, false);
assert.strictEqual(record.agreementVersion, AGREEMENT_VERSION);
assert.ok(record.agreementContent.includes(reservation.id));

const events = [
  { event_type: 'request_received', created_at: '2026-09-07T10:00:00.000Z', metadata: { quote: splitQuote } },
  { event_type: 'request_processing', created_at: '2026-09-07T10:05:00.000Z', metadata: {} },
  { event_type: 'owner_approved', created_at: '2026-09-07T10:10:00.000Z', metadata: { quote: splitQuote } },
  { event_type: 'agreement_sent', created_at: '2026-09-07T10:10:01.000Z', metadata: { agreementHash: document.contentHash, quoteHash: quoteHash(splitQuote) } },
  { event_type: 'payment_pending', created_at: '2026-09-07T10:10:02.000Z', metadata: { deferred: true } },
  { event_type: 'agreement_accepted', created_at: '2026-09-07T10:20:00.000Z', metadata: { agreementHash: document.contentHash, quoteHash: quoteHash(splitQuote), acceptedName: 'Alex Guest', acceptedAt: '2026-09-07T10:20:00.000Z' } }
];
const accepted = lifecycleFromEvents(events, reservation, splitQuote);
assert.strictEqual(accepted.ownerApproved, true);
assert.strictEqual(accepted.agreementAccepted, true);
assert.strictEqual(accepted.agreementLabel, AGREEMENT_LABEL);
assert.strictEqual(accepted.paymentDeferred, true);
assert.strictEqual(accepted.confirmationDeferred, true);
assert.strictEqual(accepted.identityVerified, false);

const stale = lifecycleFromEvents(events, reservation, { ...splitQuote, total: 3000, lodgingSubtotal: 2400, taxes: 360 });
assert.strictEqual(stale.agreementAccepted, false);
assert.strictEqual(stale.agreementStale, true);

const processing = lifecycleFromEvents(events.slice(0, 2), reservation, splitQuote);
assert.strictEqual(processing.processing, true);
assert.strictEqual(processing.ownerApproved, false);

const holdNights = eachDate('2026-12-10', '2026-12-13');
assert.deepStrictEqual(holdNights, ['2026-12-10', '2026-12-11', '2026-12-12']);
const calendarSrc = fs.readFileSync(path.join(__dirname, '../api/calendar.js'), 'utf8');
const icsSrc = fs.readFileSync(path.join(__dirname, '../api/direct-bookings.js'), 'utf8');
assert.match(calendarSrc, /no-store/);
assert.doesNotMatch(calendarSrc, /s-maxage=60/);
assert.match(icsSrc, /no-store/);
assert.doesNotMatch(icsSrc, /s-maxage=60/);
assert.match(icsSrc, /Hold - Direct Booking Request/);

console.log('verify-booking-completion: ok');
