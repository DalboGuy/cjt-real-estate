const assert = require('assert');
const { defaultCatalog } = require('../lib/pricing-defaults');
const { quoteStayWithCatalog, paymentScheduleFor } = require('../lib/pricing');
const { guestPaymentTrust, guestPaymentTrustMarkup } = require('../assets/js/quote-trust');
const { validateSettingsInput, validateSeasonInput } = require('../lib/pricing-store');

function expectThrow(fn, code) {
  try {
    fn();
  } catch (error) {
    assert.strictEqual(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    return;
  }
  throw new Error(`expected ${code}`);
}

const catalog = defaultCatalog();
const midweek = quoteStayWithCatalog(catalog, '2026-09-08', '2026-09-10', 2);
assert.strictEqual(midweek.nights, 2);
assert.strictEqual(midweek.lodgingSubtotal, 1058);
assert.strictEqual(midweek.cleaningFee, 240);
assert.strictEqual(midweek.taxRate, 0.15);
assert.strictEqual(midweek.taxes, 194.7);
assert.strictEqual(midweek.total, 1492.7);
assert.strictEqual(midweek.priceLines[0].season, 'Non-Peak 1');

const weekend = quoteStayWithCatalog(catalog, '2026-09-11', '2026-09-13', 2);
assert.strictEqual(weekend.lodgingSubtotal, 1310);
assert.strictEqual(weekend.priceLines[0].nightlyRate, 655);

const festival = quoteStayWithCatalog(catalog, '2026-10-17', '2026-10-19', 2);
assert.strictEqual(festival.priceLines[0].season, 'ARToberFEST');
assert.strictEqual(festival.lodgingSubtotal, 1310);

const edited = quoteStayWithCatalog({ ...catalog, cleaningFee: 300, taxRate: 0.1 }, '2026-09-08', '2026-09-10', 2);
assert.strictEqual(edited.cleaningFee, 300);
assert.strictEqual(edited.taxes, 135.8);
assert.strictEqual(edited.total, 1493.8);

expectThrow(() => quoteStayWithCatalog(catalog, '2028-01-01', '2028-01-03', 2), 'pricing_not_published');
expectThrow(() => quoteStayWithCatalog(catalog, '2026-09-08', '2026-09-09', 2), 'minimum_stay');
expectThrow(() => quoteStayWithCatalog(catalog, '2026-09-08', '2026-09-10', 15), 'invalid_guests');

const settings = validateSettingsInput({ taxRate: 15, advancePaymentPct: 50, cleaningFee: 240, maxGuests: 14, pricingThrough: '2027-08-15', weekendDays: [5, 6], splitPaymentThresholdDays: 30 });
assert.strictEqual(settings.taxRate, 0.15);
assert.strictEqual(settings.advancePaymentPct, 0.5);

expectThrow(() => validateSeasonInput({ name: 'Overlap', start: '2026-10-18', end: '2026-10-16', weekday: 100, weekend: 100, minNights: 2 }), 'validation_error');
expectThrow(() => validateSeasonInput({ name: '', start: '2026-10-18', end: '2026-10-19', weekday: 100, weekend: 100, minNights: 2 }), 'validation_error');
expectThrow(() => validateSettingsInput({ maxGuests: 20 }), 'validation_error');

const asOf = new Date('2026-09-07T12:00:00Z');
const split = paymentScheduleFor(1492.7, '2026-12-01', asOf, { advancePaymentPct: 0.5, splitPaymentThresholdDays: 30 });
assert.strictEqual(split.mode, 'split');
assert.strictEqual(split.depositPct, 0.5);
assert.strictEqual(split.dueAtBooking, 746.35);
assert.strictEqual(split.remainingBalance, 746.35);
assert.strictEqual(split.splitPaymentThresholdDays, 30);
assert.strictEqual(split.balanceDueDate, '2026-11-01');
const splitCopy = guestPaymentTrust({ total: 1492.7, paymentSchedule: split });
assert.strictEqual(splitCopy.depositLabel, '50% deposit due when accepted');
assert.ok(splitCopy.remainingLabel.includes('Nov 1, 2026'));
assert.match(guestPaymentTrustMarkup({ total: 1492.7, paymentSchedule: split }), /50% deposit due when accepted/);
assert.match(guestPaymentTrustMarkup({ total: 1492.7, paymentSchedule: split }), /Booking agreement/);

const full = paymentScheduleFor(1000, '2026-09-20', asOf, { advancePaymentPct: 0.5, splitPaymentThresholdDays: 30 });
assert.strictEqual(full.mode, 'full');
assert.strictEqual(full.depositPct, 1);
assert.strictEqual(full.splitPaymentThresholdDays, 30);
const fullCopy = guestPaymentTrust({ total: 1000, paymentSchedule: full });
assert.strictEqual(fullCopy.depositLabel, 'Full balance due when accepted');
assert.match(fullCopy.holdNote, /within 30 days/);

const custom = paymentScheduleFor(1000, '2026-10-20', asOf, { advancePaymentPct: 0.4, splitPaymentThresholdDays: 14 });
assert.strictEqual(custom.mode, 'split');
assert.strictEqual(custom.dueAtBooking, 400);
assert.strictEqual(custom.splitPaymentThresholdDays, 14);
assert.strictEqual(guestPaymentTrust({ total: 1000, paymentSchedule: custom }).depositLabel, '40% deposit due when accepted');

console.log('verify-pricing-catalog: ok');
