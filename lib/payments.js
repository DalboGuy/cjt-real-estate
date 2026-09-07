const crypto = require('crypto');
const { db } = require('./db');

function paymentError(code, message, status=400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function requireStripeSecret() {
  if (!process.env.STRIPE_SECRET_KEY) throw paymentError('stripe_not_configured', 'Stripe payments are not configured for this environment.', 503);
  return process.env.STRIPE_SECRET_KEY;
}

function minorUnits(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw paymentError('invalid_payment_amount', 'The stored quote does not contain a payable amount.', 409);
  return Math.round(value * 100);
}

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return {}; }
}

async function reservationContext(sql, id, paymentType='deposit') {
  const rows = await sql`
    SELECT r.id,r.guest_name,r.guest_email,r.status,r.checkin::text,r.checkout::text,
           q.quote
    FROM reservations r
    LEFT JOIN LATERAL (
      SELECT e.metadata->'quote' AS quote
      FROM booking_events e
      WHERE e.reservation_id=r.id AND e.metadata ? 'quote'
      ORDER BY e.created_at DESC,e.id DESC LIMIT 1
    ) q ON true
    WHERE r.id=${id} LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw paymentError('reservation_not_found', 'Reservation not found.', 404);
  if (['released','expired','cancelled'].includes(row.status)) throw paymentError('reservation_closed', 'This reservation is no longer payable.', 409);
  const quote = row.quote || {};
  const schedule = quote.paymentSchedule || {};
  const type = paymentType === 'balance' ? 'balance' : (schedule.mode === 'split' ? 'deposit' : 'full');
  const amount = type === 'balance' ? schedule.remainingBalance : (schedule.dueAtBooking ?? quote.total);
  if (type === 'balance' && !(Number(amount) > 0)) throw paymentError('balance_not_due', 'No balance is due for this reservation.', 409);
  const currency = String(quote.currency || 'USD').toLowerCase();
  if (currency !== 'usd') throw paymentError('unsupported_currency', 'Only USD payments are enabled.', 409);
  return { ...row, quote, paymentType: type, amount: Number(amount), currency, amountMinor: minorUnits(amount) };
}

async function eventsFor(sql, id) {
  return sql`
    SELECT event_type,metadata,created_at
    FROM booking_events
    WHERE reservation_id=${id}
      AND event_type IN ('payment_checkout_created','payment_verified','payment_failed')
    ORDER BY created_at ASC,id ASC
  `;
}

function paymentSnapshotFromEvents(events) {
  const checkouts = new Map();
  const verified = new Map();
  for (const event of events) {
    const metadata = parseMetadata(event.metadata);
    const key = String(metadata.paymentType || 'full');
    if (event.event_type === 'payment_checkout_created') checkouts.set(String(metadata.stripeSessionId || key), { ...metadata, createdAt: event.created_at });
    if (event.event_type === 'payment_verified') verified.set(key, { ...metadata, verifiedAt: event.created_at });
  }
  const verifiedRows = [...verified.values()];
  const latest = verifiedRows[verifiedRows.length - 1] || null;
  const checkoutRows = [...checkouts.values()];
  return {
    verified: Boolean(latest),
    paymentType: latest?.paymentType || null,
    verifiedAmount: latest?.amount != null ? Number(latest.amount) : null,
    currency: latest?.currency || 'usd',
    verifiedAt: latest?.verifiedAt || null,
    checkoutCreated: checkoutRows.length > 0,
    checkoutCount: checkoutRows.length,
    amountDue: checkoutRows.length ? Number(checkoutRows[checkoutRows.length - 1].amount) : null
  };
}

async function paymentSnapshot(sql, id) {
  const events = await eventsFor(sql || db(), id);
  return paymentSnapshotFromEvents(events);
}

async function stripeRequest(path, options={}) {
  const key = requireStripeSecret();
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: options.method || 'GET',
    headers: { Authorization: `Bearer ${key}`, ...(options.body ? {'Content-Type':'application/x-www-form-urlencoded'} : {}) },
    body: options.body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('stripe request failed', response.status, data?.error?.type || data?.error?.code || 'unknown');
    throw paymentError('stripe_request_failed', 'Stripe could not complete the payment request.', 502);
  }
  return data;
}

function siteOrigin(req) {
  const configured = String(process.env.PUBLIC_SITE_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  const host = String(req.headers.host || '').trim();
  if (!host) throw paymentError('site_url_not_configured', 'A public site URL is required to create Checkout Sessions.', 503);
  const protocol = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return `${protocol}://${host}`;
}

async function createCheckoutSession(req, sql, id, guestEmail, requestedType) {
  const context = await reservationContext(sql, id, requestedType);
  if (String(guestEmail || '').trim().toLowerCase() !== String(context.guest_email || '').trim().toLowerCase()) {
    throw paymentError('guest_identity_mismatch', 'The guest email does not match this reservation.', 403);
  }
  const prior = await eventsFor(sql, id);
  if (prior.some(event => event.event_type === 'payment_verified' && parseMetadata(event.metadata).paymentType === context.paymentType)) {
    throw paymentError('payment_already_verified', 'This payment is already verified.', 409);
  }
  const origin = siteOrigin(req);
  const query = `reservation_id=${encodeURIComponent(id)}`;
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('line_items[0][price_data][currency]', context.currency);
  params.set('line_items[0][price_data][unit_amount]', String(context.amountMinor));
  params.set('line_items[0][price_data][product_data][name]', `Sand & Sea Manor ${context.paymentType} payment`);
  params.set('line_items[0][quantity]', '1');
  params.set('customer_email', context.guest_email);
  params.set('success_url', `${origin}/payment-confirmation.html?${query}&session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${origin}/payment-confirmation.html?${query}&cancelled=1`);
  params.set('metadata[reservation_id]', id);
  params.set('metadata[payment_type]', context.paymentType);
  params.set('metadata[quote_total]', String(context.quote.total || ''));
  params.set('payment_intent_data[metadata][reservation_id]', id);
  params.set('payment_intent_data[metadata][payment_type]', context.paymentType);
  const session = await stripeRequest('/v1/checkout/sessions', { method: 'POST', body: params.toString() });
  await sql`
    INSERT INTO booking_events(reservation_id,event_type,actor,metadata)
    VALUES (${id},'payment_checkout_created','guest',${JSON.stringify({
      stripeSessionId: session.id, paymentType: context.paymentType, amount: context.amount,
      currency: context.currency, quoteTotal: context.quote.total, quoteVersion: context.quote.quoteVersion
    })}::jsonb)
  `;
  return { id: session.id, url: session.url, amount: context.amount, currency: context.currency, paymentType: context.paymentType };
}

async function verifyCheckoutSession(sql, session, actor='stripe', stripeEventId=null) {
  const id = String(session?.id || '').trim();
  if (!id) throw paymentError('missing_session_id', 'A Checkout Session is required.', 400);
  const metadata = session.metadata || {};
  const reservationId = String(metadata.reservation_id || '').trim();
  if (!reservationId) throw paymentError('session_missing_reservation', 'The Checkout Session is not linked to a reservation.', 409);
  const rows = await sql`
    SELECT metadata FROM booking_events
    WHERE reservation_id=${reservationId} AND event_type='payment_checkout_created'
      AND metadata->>'stripeSessionId'=${id}
    ORDER BY created_at DESC,id DESC LIMIT 1
  `;
  const checkout = parseMetadata(rows[0]?.metadata);
  if (!checkout.stripeSessionId) throw paymentError('checkout_not_registered', 'This Checkout Session is not registered for a reservation.', 409);
  const amount = Number(session.amount_total);
  if (session.payment_status !== 'paid' || !session.status || session.status !== 'complete') throw paymentError('payment_not_paid', 'Stripe has not marked this Checkout Session as paid.', 409);
  if (amount !== minorUnits(checkout.amount) || String(session.currency || '').toLowerCase() !== String(checkout.currency || 'usd').toLowerCase()) {
    throw paymentError('payment_amount_mismatch', 'The Stripe amount does not match the stored quote payment.', 409);
  }
  const paymentType = checkout.paymentType || 'full';
  const existing = await sql`
    SELECT id FROM booking_events
    WHERE reservation_id=${reservationId} AND event_type='payment_verified'
      AND metadata->>'stripeSessionId'=${id} LIMIT 1
  `;
  if (!existing.length) {
    await sql`
      INSERT INTO booking_events(reservation_id,event_type,actor,metadata)
      VALUES (${reservationId},'payment_verified',${actor},${JSON.stringify({
        stripeSessionId:id, paymentType, amount:checkout.amount, currency:checkout.currency,
        stripePaymentIntent:session.payment_intent || null, stripeEventId:stripeEventId || null
      })}::jsonb)
    `;
  }
  return { reservationId, paymentType, amount:Number(checkout.amount), currency:checkout.currency, verified:true };
}

async function verifySessionId(sql, sessionId) {
  const session = await stripeRequest(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
  return verifyCheckoutSession(sql, session, 'guest_verify');
}

function verifyWebhookSignature(rawBody, signature) {
  const secret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!secret) throw paymentError('stripe_webhook_not_configured', 'Stripe webhook verification is not configured.', 503);
  const parts = Object.fromEntries(String(signature || '').split(',').map(part => part.split('=')));
  const timestamp = Number(parts.t);
  const received = String(parts.v1 || '');
  if (!timestamp || !received || Math.abs(Date.now()/1000 - timestamp) > 300) throw paymentError('invalid_webhook_signature', 'Invalid Stripe webhook signature.', 400);
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const a=Buffer.from(expected), b=Buffer.from(received);
  if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) throw paymentError('invalid_webhook_signature', 'Invalid Stripe webhook signature.', 400);
}

async function handleWebhook(sql, rawBody, signature) {
  verifyWebhookSignature(rawBody, signature);
  let event;
  try { event=JSON.parse(rawBody); } catch (_) { throw paymentError('invalid_webhook_body', 'Invalid Stripe webhook body.', 400); }
  if (event.type === 'checkout.session.completed' && event.data?.object) {
    return { handled:true, ...(await verifyCheckoutSession(sql, event.data.object, 'stripe_webhook', event.id || null)) };
  }
  return { handled:false, type:event.type || null };
}

async function confirmReservation(sql, id, sessionId=null) {
  const events = await eventsFor(sql, id);
  const verified = events.filter(event => event.event_type === 'payment_verified').map(event => parseMetadata(event.metadata));
  if (sessionId && !verified.some(item => item.stripeSessionId === sessionId)) throw paymentError('payment_not_verified', 'Verify the Stripe payment before confirming the reservation.', 409);
  const payment = verified[verified.length-1];
  if (!payment) throw paymentError('payment_not_verified', 'Verify the Stripe payment before confirming the reservation.', 409);
  await sql`UPDATE reservations SET status='confirmed',deposit_received_at=COALESCE(deposit_received_at,now()),hold_expires_at=NULL,updated_at=now() WHERE id=${id} AND status NOT IN ('released','cancelled','expired')`;
  await sql`INSERT INTO booking_events(reservation_id,event_type,actor,metadata) VALUES (${id},'guest_confirmed','guest',${JSON.stringify({stripeSessionId:payment.stripeSessionId,paymentType:payment.paymentType,amount:payment.amount})}::jsonb)`;
  return { confirmed:true, paymentType:payment.paymentType, amount:Number(payment.amount), currency:payment.currency };
}

module.exports = { paymentSnapshot, paymentSnapshotFromEvents, reservationContext, createCheckoutSession, verifySessionId, handleWebhook, confirmReservation };
