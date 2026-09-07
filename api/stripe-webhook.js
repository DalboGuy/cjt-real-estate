const { verifyStripeSignature, retrieveCheckoutSession } = require('../lib/stripe');
const { applyStripePayment } = require('../lib/booking');
const { db, ensureSchema } = require('../lib/db');

module.exports.config = { api: { bodyParser: false } };

async function readRawBody(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (chunks.length) return Buffer.concat(chunks).toString('utf8');
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  return '';
}

async function expireAbandonedCheckout(session) {
  const id = session.client_reference_id || (session.metadata && session.metadata.reservation_id);
  if (!id) return;
  await ensureSchema();
  const sql = db();
  const updated = await sql`
    UPDATE reservations
    SET status='expired', updated_at=now()
    WHERE id=${id} AND status='checkout_pending'
    RETURNING id
  `;
  if (updated.length) {
    await sql`INSERT INTO booking_events (reservation_id,event_type,actor) VALUES (${id},'checkout_expired','stripe')`;
  }
}

module.exports = async function (req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('stripe webhook missing STRIPE_WEBHOOK_SECRET');
    return res.status(503).json({ error: 'webhook_not_configured' });
  }
  const raw = await readRawBody(req);
  const sig = req.headers['stripe-signature'];
  if (!verifyStripeSignature(raw, sig, secret)) {
    return res.status(400).json({ error: 'invalid_signature' });
  }
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'invalid_json' });
  }
  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data && event.data.object;
      if (session) {
        if (session.payment_status !== 'paid' && session.id) {
          const fresh = await retrieveCheckoutSession(session.id);
          await applyStripePayment(fresh);
        } else {
          await applyStripePayment(session);
        }
      }
    } else if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      await expireAbandonedCheckout(event.data && event.data.object);
    }
    return res.status(200).json({ received: true });
  } catch (e) {
    console.error('stripe webhook error', e);
    return res.status(500).json({ error: 'webhook_failed' });
  }
};
