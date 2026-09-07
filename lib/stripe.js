const crypto = require('crypto');

function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

async function stripeRequest(path, { method = 'GET', body } = {}) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    const err = new Error('STRIPE_SECRET_KEY is not configured');
    err.code = 'stripe_not_configured';
    throw err;
  }
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body ? body.toString() : undefined
  });
  const data = await r.json();
  if (!r.ok) {
    const err = new Error(data.error?.message || `Stripe request failed (${r.status})`);
    err.code = data.error?.code || 'stripe_error';
    err.status = r.status;
    throw err;
  }
  return data;
}

function createCheckoutSession({ origin, reservation, quote, guest }) {
  const success = `${origin}/booking-success?session_id={CHECKOUT_SESSION_ID}`;
  const cancel = `${origin}/#book`;
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', success);
  params.set('cancel_url', cancel);
  params.set('customer_email', guest.email);
  params.set('client_reference_id', reservation.id);
  params.set('expires_at', String(Math.floor(Date.now() / 1000) + 30 * 60));
  params.set('metadata[reservation_id]', reservation.id);
  params.set('metadata[checkin]', reservation.checkin);
  params.set('metadata[checkout]', reservation.checkout);
  params.set('payment_intent_data[metadata][reservation_id]', reservation.id);
  const items = [
    {
      name: `Sand & Sea Manor · ${quote.nights} night${quote.nights === 1 ? '' : 's'} (${reservation.checkin} to ${reservation.checkout})`,
      amount: quote.lodgingCents
    },
    { name: 'Cleaning fee', amount: quote.cleaningCents },
    { name: `Tax (${quote.taxPercent}%)`, amount: quote.taxCents }
  ].filter((item) => item.amount > 0);
  items.forEach((item, i) => {
    params.set(`line_items[${i}][quantity]`, '1');
    params.set(`line_items[${i}][price_data][currency]`, quote.currency);
    params.set(`line_items[${i}][price_data][unit_amount]`, String(item.amount));
    params.set(`line_items[${i}][price_data][product_data][name]`, item.name);
  });
  return stripeRequest('checkout/sessions', { method: 'POST', body: params });
}

function retrieveCheckoutSession(id) {
  return stripeRequest(`checkout/sessions/${encodeURIComponent(id)}`);
}

function verifyStripeSignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const parts = {};
  for (const item of String(header).split(',')) {
    const i = item.indexOf('=');
    if (i > 0) parts[item.slice(0, i).trim()] = item.slice(i + 1).trim();
  }
  if (!parts.t || !parts.v1) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(parts.v1, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  stripeConfigured,
  stripeRequest,
  createCheckoutSession,
  retrieveCheckoutSession,
  verifyStripeSignature
};
