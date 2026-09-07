const crypto = require('crypto');
const { db, ensureSchema, expireHolds } = require('../lib/db');
const { getOtaBlockedDates, eachDate, toYmd } = require('../lib/availability');
const { quoteStay, formatUsd } = require('../lib/pricing');
const { stripeConfigured, createCheckoutSession, retrieveCheckoutSession } = require('../lib/stripe');
const { applyStripePayment } = require('../lib/booking');

function clean(v, max = 500) { return String(v || '').trim().slice(0, max); }
function validDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
function makeId(checkin) { return `DB-${String(checkin).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`; }
function queryParam(req, name) {
  if (req.query && req.query[name] != null && req.query[name] !== '') return String(req.query[name]);
  try {
    return new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams.get(name) || '';
  } catch {
    return '';
  }
}
function noStore(res) {
  res.setHeader('Cache-Control', 'private, no-store, no-cache, max-age=0, must-revalidate');
}
function siteOrigin(req) {
  if (process.env.PUBLIC_SITE_URL) return process.env.PUBLIC_SITE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'cjtbookingpage.vercel.app';
  return `${proto}://${host}`;
}

async function datesOpen(checkin, checkout) {
  const { dates: otaBlocked } = await getOtaBlockedDates();
  const requested = eachDate(checkin, checkout);
  if (requested.some((d) => otaBlocked.has(d))) return false;
  const sql = db();
  const overlap = await sql`
    SELECT id FROM reservations
    WHERE status IN ('inquiry_hold','hold_verified','checkout_pending','payment_received','contract_sent','contract_signed','confirmed')
      AND daterange(checkin,checkout,'[)') && daterange(${checkin}::date,${checkout}::date,'[)')
    LIMIT 1
  `;
  return overlap.length === 0;
}

async function handleGet(req, res) {
  const sessionId = queryParam(req, 'session_id').trim();
  if (!sessionId) return res.status(400).json({ error: 'missing_session' });
  try {
    const session = await retrieveCheckoutSession(sessionId);
    if (session.payment_status === 'paid') {
      await applyStripePayment(session);
    }
    const sql = db();
    const id = session.client_reference_id || (session.metadata && session.metadata.reservation_id);
    if (!id) return res.status(404).json({ error: 'not_found' });
    const rows = await sql`
      SELECT id, guest_name, guest_email, guests, checkin::text AS checkin, checkout::text AS checkout,
             status, amount_cents, paid_at
      FROM reservations WHERE id=${id} LIMIT 1
    `;
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    const reservation = { ...rows[0], checkin: toYmd(rows[0].checkin), checkout: toYmd(rows[0].checkout) };
    return res.status(200).json({
      reservation,
      paid: ['payment_received', 'contract_sent', 'contract_signed', 'confirmed'].includes(reservation.status),
      confirmed: reservation.status === 'confirmed',
      total: reservation.amount_cents != null ? formatUsd(reservation.amount_cents) : null
    });
  } catch (e) {
    console.error('checkout status error', e);
    if (e.code === 'stripe_not_configured') {
      return res.status(503).json({ error: 'stripe_not_configured', message: 'Stripe is not configured. Set STRIPE_SECRET_KEY in Vercel.' });
    }
    return res.status(500).json({ error: 'checkout_status_failed', message: e.message || 'Could not load payment status.' });
  }
}

async function handlePost(req, res) {
  if (!stripeConfigured()) {
    return res.status(503).json({
      error: 'stripe_not_configured',
      message: 'Online payment is not configured yet. Set STRIPE_SECRET_KEY in Vercel, then add STRIPE_WEBHOOK_SECRET for the webhook at /api/stripe-webhook.'
    });
  }
  await ensureSchema();
  await expireHolds();
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const guest_name = clean(body.name, 120);
  const guest_email = clean(body.email, 180);
  const guest_phone = clean(body.phone, 60);
  const notes = clean(body.message, 2000);
  const checkin = clean(body.checkin, 10);
  const checkout = clean(body.checkout, 10);
  const guests = Number(body.guests);
  if (!guest_name || !guest_email.includes('@') || !guest_phone || !validDate(checkin) || !validDate(checkout) || !Number.isInteger(guests) || guests < 1 || guests > 12) {
    return res.status(400).json({ error: 'invalid_request', message: 'Please complete name, email, phone, dates, and guest count.' });
  }
  if (checkout <= checkin) return res.status(400).json({ error: 'invalid_dates', message: 'Check-out must be after check-in.' });
  const today = new Date().toISOString().slice(0, 10);
  if (checkin < today) return res.status(400).json({ error: 'past_date', message: 'Check-in must be a future date.' });
  const quote = quoteStay(checkin, checkout);
  if (!quote) return res.status(400).json({ error: 'invalid_dates', message: 'Check-out must be after check-in.' });
  if (!(await datesOpen(checkin, checkout))) {
    return res.status(409).json({ error: 'dates_unavailable', message: 'Those dates are currently held or booked.' });
  }
  const sql = db();
  const id = makeId(checkin);
  let rows;
  try {
    rows = await sql`
      INSERT INTO reservations (
        id, guest_name, guest_email, guest_phone, guests, notes, checkin, checkout,
        status, hold_expires_at, amount_cents, currency
      )
      VALUES (
        ${id}, ${guest_name}, ${guest_email}, ${guest_phone}, ${guests}, ${notes || null},
        ${checkin}::date, ${checkout}::date, 'checkout_pending', now() + interval '30 minutes',
        ${quote.totalCents}, ${quote.currency}
      )
      RETURNING id, checkin::text AS checkin, checkout::text AS checkout, status, amount_cents, hold_expires_at
    `;
  } catch (e) {
    if (String(e.message || '').toLowerCase().includes('reservations_no_overlap')) {
      return res.status(409).json({ error: 'dates_unavailable', message: 'Those dates were just reserved by another guest.' });
    }
    throw e;
  }
  const reservation = { ...rows[0], checkin: toYmd(rows[0].checkin), checkout: toYmd(rows[0].checkout) };
  await sql`INSERT INTO booking_events (reservation_id,event_type,actor,metadata) VALUES (${id},'checkout_started','guest',${JSON.stringify({ guests, totalCents: quote.totalCents })}::jsonb)`;
  try {
    const session = await createCheckoutSession({
      origin: siteOrigin(req),
      reservation,
      quote,
      guest: { email: guest_email }
    });
    await sql`UPDATE reservations SET stripe_checkout_session_id=${session.id}, updated_at=now() WHERE id=${id}`;
    return res.status(201).json({
      url: session.url,
      reservation,
      quote,
      message: 'Continue to Stripe to pay in full and secure these dates.'
    });
  } catch (e) {
    await sql`UPDATE reservations SET status='cancelled', released_at=now(), updated_at=now() WHERE id=${id} AND status='checkout_pending'`;
    console.error('checkout session error', e);
    if (e.code === 'stripe_not_configured') {
      return res.status(503).json({ error: 'stripe_not_configured', message: e.message });
    }
    return res.status(500).json({ error: 'checkout_unavailable', message: 'We could not start checkout. Please contact CJT or try again.' });
  }
}

module.exports = async function (req, res) {
  noStore(res);
  try {
    if (req.method === 'GET') return handleGet(req, res);
    if (req.method === 'POST') return handlePost(req, res);
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('checkout error', e);
    return res.status(500).json({ error: 'booking_unavailable', message: 'We could not start checkout. Please contact CJT directly.' });
  }
};
