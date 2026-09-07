const { eachDate } = require('./availability');

const DEFAULT_NIGHTLY_DOLLARS = 450;
const DEFAULT_CLEANING_DOLLARS = 200;
const DEFAULT_TAX_PERCENT = 15;

function dollarsToCents(value, fallbackDollars) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return Math.round(fallbackDollars * 100);
  return Math.round(n * 100);
}

function pricingConfig() {
  const tax = Number(process.env.BOOKING_TAX_PERCENT);
  return {
    nightlyCents: dollarsToCents(process.env.BOOKING_NIGHTLY_RATE, DEFAULT_NIGHTLY_DOLLARS),
    cleaningCents: dollarsToCents(process.env.BOOKING_CLEANING_FEE, DEFAULT_CLEANING_DOLLARS),
    taxPercent: Number.isFinite(tax) && tax >= 0 ? tax : DEFAULT_TAX_PERCENT,
    currency: 'usd'
  };
}

function formatUsd(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((Number(cents) || 0) / 100);
}

function quoteStay(checkin, checkout) {
  const nights = eachDate(checkin, checkout).length;
  if (nights < 1) return null;
  const cfg = pricingConfig();
  const lodgingCents = nights * cfg.nightlyCents;
  const subtotalCents = lodgingCents + cfg.cleaningCents;
  const taxCents = Math.round(subtotalCents * (cfg.taxPercent / 100));
  return {
    checkin,
    checkout,
    nights,
    nightlyCents: cfg.nightlyCents,
    cleaningCents: cfg.cleaningCents,
    lodgingCents,
    taxPercent: cfg.taxPercent,
    taxCents,
    totalCents: subtotalCents + taxCents,
    currency: cfg.currency,
    stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY)
  };
}

module.exports = {
  DEFAULT_NIGHTLY_DOLLARS,
  DEFAULT_CLEANING_DOLLARS,
  DEFAULT_TAX_PERCENT,
  pricingConfig,
  quoteStay,
  formatUsd
};
