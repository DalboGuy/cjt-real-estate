const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { defaultCatalog } = require('./pricing-defaults');
const {
  quoteStayWithCatalog,
  ownerAdjustedQuote,
  normalizeOwnerQuote,
  quoteMoneyIsConsistent
} = require('./pricing');
const {
  round2,
  moneyParts,
  averageNightlyRate,
  sumPriceLines,
  computeQuoteBreakdown,
  withConsistentQuoteMoney,
  quoteMoneyIsConsistent: breakdownIsConsistent
} = require('./quote-breakdown');

function assertMoneyConsistent(quote) {
  const money = moneyParts(quote);
  assert.equal(quote.lodgingSubtotal, money.lodgingSubtotal);
  assert.equal(quote.cleaningFee, money.cleaningFee);
  assert.equal(quote.taxes, money.taxes);
  assert.equal(quote.total, money.total);
  assert.equal(quote.averageNightly, averageNightlyRate(quote.lodgingSubtotal, quote.nights));
  assert.equal(sumPriceLines(quote.priceLines), quote.lodgingSubtotal);
  assert.equal(quoteMoneyIsConsistent(quote), true);
  assert.equal(breakdownIsConsistent(quote), true);
}

describe('computeQuoteBreakdown', () => {
  it('derives tax, total, and ANR from lodging', () => {
    const breakdown = computeQuoteBreakdown({
      lodgingSubtotal: 1058,
      cleaningFee: 240,
      taxRate: 0.15,
      nights: 2,
      nightLines: [
        { season: 'Non-Peak 1', rate: 529 },
        { season: 'Non-Peak 1', rate: 529 }
      ]
    });
    assert.equal(breakdown.taxes, 194.7);
    assert.equal(breakdown.total, 1492.7);
    assert.equal(breakdown.averageNightly, 529);
    assert.equal(breakdown.priceLines[0].nights, 2);
    assert.equal(sumPriceLines(breakdown.priceLines), 1058);
  });

  it('scales existing season lines so they still sum to the new lodging', () => {
    const scaled = computeQuoteBreakdown({
      lodgingSubtotal: 1500,
      cleaningFee: 240,
      taxRate: 0.15,
      nights: 3,
      priceLines: [
        { season: 'Non-Peak 1', nightlyRate: 529, nights: 1, subtotal: 529 },
        { season: 'Non-Peak 1', nightlyRate: 655, nights: 2, subtotal: 1310 }
      ],
      scaleToLodging: true
    });
    assert.equal(scaled.lodgingSubtotal, 1500);
    assert.equal(scaled.averageNightly, 500);
    assert.equal(sumPriceLines(scaled.priceLines), 1500);
    assert.equal(scaled.priceLines[0].season, 'Non-Peak 1');
    assert.equal(scaled.priceLines[1].nights, 2);
    assert.equal(scaled.taxes, round2((1500 + 240) * 0.15));
    assert.equal(scaled.total, round2(1500 + 240 + scaled.taxes));
  });

  it('puts remainder cents on the last price line', () => {
    const scaled = computeQuoteBreakdown({
      lodgingSubtotal: 100,
      cleaningFee: 0,
      taxRate: 0,
      nights: 3,
      priceLines: [
        { season: 'A', nights: 1, subtotal: 10 },
        { season: 'B', nights: 1, subtotal: 10 },
        { season: 'C', nights: 1, subtotal: 10 }
      ],
      scaleToLodging: true
    });
    assert.equal(sumPriceLines(scaled.priceLines), 100);
    assert.equal(scaled.priceLines[2].subtotal, round2(100 - scaled.priceLines[0].subtotal - scaled.priceLines[1].subtotal));
    assert.equal(scaled.averageNightly, round2(100 / 3));
  });
});

describe('seasonal quoteStayWithCatalog', () => {
  it('emits a consistent nightly breakdown and ANR', () => {
    const catalog = defaultCatalog();
    const midweek = quoteStayWithCatalog(catalog, '2026-09-08', '2026-09-10', 2);
    assert.equal(midweek.lodgingSubtotal, 1058);
    assert.equal(midweek.averageNightly, 529);
    assertMoneyConsistent(midweek);
    const mixed = quoteStayWithCatalog(catalog, '2026-09-10', '2026-09-13', 2);
    assert.equal(mixed.nights, 3);
    assert.equal(mixed.lodgingSubtotal, 529 + 655 + 655);
    assertMoneyConsistent(mixed);
  });
});

describe('ownerAdjustedQuote', () => {
  it('keeps subtotal, tax, total, nightly breakdown, and ANR in lockstep', async () => {
    const original = quoteStayWithCatalog(defaultCatalog(), '2026-09-08', '2026-09-10', 2);
    const adjusted = await ownerAdjustedQuote(original, 1200);
    assert.equal(adjusted.lodgingSubtotal, 1200);
    assert.equal(adjusted.averageNightly, 600);
    assert.equal(adjusted.cleaningFee, 240);
    assert.equal(adjusted.taxes, 216);
    assert.equal(adjusted.total, 1656);
    assert.equal(adjusted.ownerAdjusted, true);
    assert.equal(adjusted.quoteVersion, 'owner-adjusted-v2');
    assert.equal(adjusted.priceLines[0].nights, 2);
    assert.equal(adjusted.priceLines[0].nightlyRate, 600);
    assert.equal(adjusted.baseLodgingSubtotal, 1058);
    assertMoneyConsistent(adjusted);
  });

  it('preserves mixed-season line counts when scaling lodging', async () => {
    const original = quoteStayWithCatalog(defaultCatalog(), '2026-09-10', '2026-09-13', 2);
    const adjusted = await ownerAdjustedQuote(original, 1800);
    assert.equal(adjusted.nights, 3);
    assert.equal(adjusted.averageNightly, 600);
    assert.equal(adjusted.priceLines.reduce((sum, line) => sum + line.nights, 0), 3);
    assert.ok(adjusted.priceLines.length >= 2);
    assertMoneyConsistent(adjusted);
  });

  it('rebuilds a single owner-adjusted line when stay dates supply nights', async () => {
    const adjusted = await ownerAdjustedQuote({}, 900, { checkin: '2026-11-10', checkout: '2026-11-13', guests: 4 });
    assert.equal(adjusted.nights, 3);
    assert.equal(adjusted.averageNightly, 300);
    assert.equal(adjusted.priceLines.length, 1);
    assert.equal(adjusted.priceLines[0].season, 'Owner adjusted');
    assert.equal(adjusted.checkin, '2026-11-10');
    assert.equal(adjusted.guests, 4);
    assertMoneyConsistent(adjusted);
  });

  it('rejects a missing night count and non-positive lodging', async () => {
    await assert.rejects(() => ownerAdjustedQuote({}, 900), (error) => {
      assert.equal(error.code, 'invalid_quote');
      return true;
    });
    await assert.rejects(() => ownerAdjustedQuote({ nights: 2 }, 0), (error) => {
      assert.equal(error.code, 'invalid_quote');
      return true;
    });
  });
});

describe('normalizeOwnerQuote consistency', () => {
  it('repairs stale ANR and tax on a modern quote', () => {
    const repaired = normalizeOwnerQuote({
      lodgingSubtotal: 1000,
      cleaningFee: 240,
      taxRate: 0.15,
      taxes: 1,
      total: 2,
      nights: 2,
      averageNightly: 9,
      priceLines: [{ season: 'Non-Peak 1', nightlyRate: 400, nights: 2, subtotal: 800 }],
      quoteVersion: 'seasonal-v2'
    });
    assert.equal(repaired.taxes, 186);
    assert.equal(repaired.total, 1426);
    assert.equal(repaired.averageNightly, 500);
    assert.equal(sumPriceLines(repaired.priceLines), 1000);
    assertMoneyConsistent(repaired);
  });
});

describe('withConsistentQuoteMoney', () => {
  it('is idempotent on seasonal quotes', () => {
    const quote = quoteStayWithCatalog(defaultCatalog(), '2026-09-11', '2026-09-13', 2);
    const once = withConsistentQuoteMoney(quote);
    const twice = withConsistentQuoteMoney(once);
    assert.equal(once.lodgingSubtotal, twice.lodgingSubtotal);
    assert.equal(once.taxes, twice.taxes);
    assert.equal(once.total, twice.total);
    assert.equal(once.averageNightly, twice.averageNightly);
    assert.deepEqual(once.priceLines, twice.priceLines);
    assertMoneyConsistent(twice);
  });
});
