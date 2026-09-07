const { quoteStay, formatUsd, pricingConfig } = require('../lib/pricing');

function noStore(res) {
  res.setHeader('Cache-Control', 'private, no-store, no-cache, max-age=0, must-revalidate');
}

function queryParam(req, name) {
  if (req.query && req.query[name] != null && req.query[name] !== '') return String(req.query[name]);
  try {
    return new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams.get(name) || '';
  } catch {
    return '';
  }
}

module.exports = async function (req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  const checkin = queryParam(req, 'checkin').slice(0, 10);
  const checkout = queryParam(req, 'checkout').slice(0, 10);
  noStore(res);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkin) || !/^\d{4}-\d{2}-\d{2}$/.test(checkout) || checkout <= checkin) {
    const cfg = pricingConfig();
    return res.status(200).json({
      quote: null,
      stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
      defaults: {
        nightly: formatUsd(cfg.nightlyCents),
        cleaning: formatUsd(cfg.cleaningCents),
        taxPercent: cfg.taxPercent
      }
    });
  }
  const quote = quoteStay(checkin, checkout);
  return res.status(200).json({
    quote,
    display: quote && {
      nights: quote.nights,
      nightly: formatUsd(quote.nightlyCents),
      lodging: formatUsd(quote.lodgingCents),
      cleaning: formatUsd(quote.cleaningCents),
      tax: formatUsd(quote.taxCents),
      total: formatUsd(quote.totalCents)
    },
    stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY)
  });
};
