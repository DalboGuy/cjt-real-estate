const test = require('node:test');
const assert = require('node:assert/strict');
const { applyPricingPolicy, calculateCostFloor, selectDiscount } = require('./pricing-engine');
const { quoteStayWithCatalog } = require('./pricing');
const { validateCostPolicyInput } = require('./pricing-store');

const lines = (rates, start = 7) => rates.map((rate, index) => ({
  date: `2026-09-${String(start + index).padStart(2, '0')}`,
  rate,
  minNights: 2,
  season: 'Base'
}));

test('cost floor prorates monthly cost by annual days', () => {
  const floor = calculateCostFloor({ mode: 'monitor', monthlyOperatingCost: 6368.21, cleaningCost: 240, channelFeeRate: 0.03 }, 7, 240);
  assert.equal(floor.allocatedOperatingCost, 1465.56);
  assert.equal(floor.requiredLodging, 1518.31);
});

test('best eligible discount wins and discounts do not stack', () => {
  const winner = selectDiscount([
    { id: 1, name: 'Weekly 10%', discountType: 'percent', value: 10, minimumNights: 7, channel: 'all' },
    { id: 2, name: 'Weekly $500', discountType: 'fixed', value: 500, minimumNights: 7, channel: 'direct' },
    { id: 3, name: 'Short stay', discountType: 'percent', value: 50, minimumNights: 2, maximumNights: 3, channel: 'all' }
  ], { nightLines: lines([500, 500, 500, 500, 500, 500, 500]), checkin: '2026-09-07', checkout: '2026-09-14', channel: 'direct' });
  assert.equal(winner.name, 'Weekly $500');
  assert.equal(winner.amount, 500);
  assert.equal(winner.stackingPolicy, 'best');
});

test('one entered percentage point means a one-percent discount', () => {
  const winner = selectDiscount([
    { name: 'One percent', discountType: 'percent', value: 1, minimumNights: 1, channel: 'direct' }
  ], { nightLines: lines([500, 500]), checkin: '2026-09-07', checkout: '2026-09-09', channel: 'direct' });
  assert.equal(winner.amount, 10);
});

test('owner-entered channel fee is stored as a decimal rate', () => {
  const policy = validateCostPolicyInput({
    channel: 'direct', monthlyOperatingCost: 6368.21, cleaningCost: 240,
    channelFeeRate: 1, minimumContribution: 0, mode: 'monitor'
  });
  assert.equal(policy.channelFeeRate, 0.01);
});

test('date override applies before discount', () => {
  const result = applyPricingPolicy({
    nightLines: lines([500, 500, 500]),
    checkin: '2026-09-07', checkout: '2026-09-10', cleaningFee: 240, channel: 'direct',
    overrides: [{ id: 4, name: 'Tuesday push', channel: 'direct', start: '2026-09-08', end: '2026-09-08', nightlyRate: 700 }],
    discounts: [{ id: 8, name: 'Ten percent', channel: 'all', discountType: 'percent', value: 10, minimumNights: 3 }]
  });
  assert.equal(result.baseLodging, 1500);
  assert.equal(result.overriddenLodging, 1700);
  assert.equal(result.discount.amount, 170);
  assert.equal(result.lodgingSubtotal, 1530);
  assert.deepEqual(result.overrides, [{ id: 4, name: 'Tuesday push', channel: 'direct', nights: 1 }]);
});

test('monitor reports floor risk without changing price', () => {
  const result = applyPricingPolicy({
    nightLines: lines([100, 100, 100]), checkin: '2026-09-07', checkout: '2026-09-10', cleaningFee: 240,
    costPolicy: { mode: 'monitor', monthlyOperatingCost: 6368.21, cleaningCost: 240, channelFeeRate: 3 }
  });
  assert.equal(result.lodgingSubtotal, 300);
  assert.equal(result.costGuard.atRisk, true);
  assert.equal(result.costGuard.applied, false);
});

test('enforce raises lodging to the smallest cent that clears the floor', () => {
  const result = applyPricingPolicy({
    nightLines: lines([100, 100, 100]), checkin: '2026-09-07', checkout: '2026-09-10', cleaningFee: 240,
    costPolicy: { mode: 'enforce', monthlyOperatingCost: 6368.21, cleaningCost: 240, channelFeeRate: 3, minimumContribution: 100 }
  });
  assert.equal(result.costGuard.applied, true);
  assert.equal(result.lodgingSubtotal, result.costGuard.requiredLodging);
  assert.ok(result.costGuard.projectedContribution >= 100);
});

test('midweek discount requires every occupied night to be eligible', () => {
  const rules = [{ name: 'Midweek', discountType: 'percent', value: 20, minimumNights: 2, eligibleWeekdays: [1, 2, 3, 4], channel: 'direct' }];
  assert.ok(selectDiscount(rules, { nightLines: lines([500, 500], 7), checkin: '2026-09-07', checkout: '2026-09-09', channel: 'direct' }));
  assert.equal(selectDiscount(rules, { nightLines: lines([500, 500], 11), checkin: '2026-09-11', checkout: '2026-09-13', channel: 'direct' }), null);
});

test('override minimum stay replaces the seasonal minimum before validation', () => {
  const quote = quoteStayWithCatalog({
    cleaningFee: 240, taxRate: 0.15, maxGuests: 14, pricingThrough: '2026-12-31', weekendDays: [],
    seasons: [{ name: 'Base', start: '2026-09-01', end: '2026-12-31', weekday: 500, weekend: 500, minNights: 3 }],
    overrides: [{ id: 1, name: 'Two-night opening', channel: 'direct', start: '2026-09-07', end: '2026-09-08', nightlyRate: 550, minNights: 2 }],
    discounts: [], costPolicies: []
  }, '2026-09-07', '2026-09-09', 2);
  assert.equal(quote.minimumStay, 2);
  assert.equal(quote.lodgingSubtotal, 1100);
});

test('public quote omits internal cost-floor diagnostics', () => {
  const catalog = {
    cleaningFee: 240, taxRate: 0.15, maxGuests: 14, pricingThrough: '2026-12-31', weekendDays: [],
    seasons: [{ name: 'Base', start: '2026-09-01', end: '2026-12-31', weekday: 100, weekend: 100, minNights: 2 }],
    overrides: [], discounts: [], costPolicies: [{ channel: 'direct', mode: 'monitor', monthlyOperatingCost: 6368.21, cleaningCost: 240, channelFeeRate: 0.03 }]
  };
  const publicQuote = quoteStayWithCatalog(catalog, '2026-09-07', '2026-09-09', 2);
  const ownerPreview = quoteStayWithCatalog(catalog, '2026-09-07', '2026-09-09', 2, { includeInternal: true });
  assert.equal(Object.hasOwn(publicQuote, 'costGuard'), false);
  assert.equal(ownerPreview.costGuard.atRisk, true);
});
