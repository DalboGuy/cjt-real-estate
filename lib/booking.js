const { db, ensureSchema } = require('./db');
const { sendPaymentReceivedEmail } = require('./email');
const { toYmd } = require('./availability');

const PAID_OR_LATER = ['payment_received', 'contract_sent', 'contract_signed', 'confirmed'];

function paymentIntentId(session) {
  if (!session || session.payment_intent == null) return null;
  return typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent.id || null;
}

async function applyStripePayment(session) {
  const id = (session && (session.client_reference_id || (session.metadata && session.metadata.reservation_id))) || '';
  if (!id) return { ok: false, reason: 'missing_reservation' };
  if (session.payment_status && session.payment_status !== 'paid') {
    return { ok: false, reason: 'not_paid' };
  }
  await ensureSchema();
  const sql = db();
  const rows = await sql`
    SELECT id, guest_name, guest_email, guest_phone, guests, notes, checkin::text AS checkin, checkout::text AS checkout,
           status, amount_cents, hold_expires_at, paid_at
    FROM reservations WHERE id=${id} LIMIT 1
  `;
  if (!rows.length) return { ok: false, reason: 'not_found' };
  const current = rows[0];
  if (PAID_OR_LATER.includes(current.status)) {
    return { ok: true, already: true, reservation: { ...current, checkin: toYmd(current.checkin), checkout: toYmd(current.checkout) } };
  }
  if (current.status !== 'checkout_pending') {
    console.error('stripe payment ignored for status', current.status, id);
    return { ok: false, reason: 'invalid_status', status: current.status };
  }
  const pi = paymentIntentId(session);
  const amount = Number(session.amount_total) || current.amount_cents || 0;
  const updated = await sql`
    UPDATE reservations
    SET status='payment_received',
        stripe_checkout_session_id=${session.id},
        stripe_payment_intent_id=${pi},
        amount_cents=${amount},
        paid_at=now(),
        deposit_received_at=COALESCE(deposit_received_at, now()),
        hold_expires_at=NULL,
        updated_at=now()
    WHERE id=${id} AND status='checkout_pending'
    RETURNING id, guest_name, guest_email, guests, notes, checkin::text AS checkin, checkout::text AS checkout,
              status, amount_cents, paid_at
  `;
  if (!updated.length) {
    return { ok: true, already: true, reservation: { ...current, checkin: toYmd(current.checkin), checkout: toYmd(current.checkout) } };
  }
  const reservation = { ...updated[0], checkin: toYmd(updated[0].checkin), checkout: toYmd(updated[0].checkout) };
  await sql`INSERT INTO booking_events (reservation_id,event_type,actor,metadata) VALUES (${id},'payment_received','stripe',${JSON.stringify({ session_id: session.id })}::jsonb)`;
  try {
    await sendPaymentReceivedEmail({
      to: reservation.guest_email,
      name: reservation.guest_name,
      id: reservation.id,
      checkin: reservation.checkin,
      checkout: reservation.checkout,
      amountCents: reservation.amount_cents
    });
  } catch (e) {
    console.error('payment received email error', e);
  }
  return { ok: true, reservation };
}

module.exports = { applyStripePayment, PAID_OR_LATER };
