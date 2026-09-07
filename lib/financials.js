const { normalizeOwnerQuote } = require('./pricing');

const CLOSED_STATUSES = new Set(['released', 'expired', 'cancelled']);

function num(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isClosedStatus(status) {
  return CLOSED_STATUSES.has(String(status || ''));
}

function isMtdCheckin(checkin, now = new Date()) {
  const day = String(checkin || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return day.startsWith(`${year}-${month}-`);
}

function quoteParts(quote) {
  const normalized = normalizeOwnerQuote(quote);
  if (!normalized || typeof normalized !== 'object') {
    return { missing: true, lodging: null, taxes: null, cleaning: null, total: null, nights: null, ownerAdjusted: false, legacy: false };
  }
  const lodging = num(normalized.lodgingSubtotal);
  const taxes = num(normalized.taxes);
  const cleaning = num(normalized.cleaningFee);
  const total = num(normalized.total);
  const missing = lodging == null && taxes == null && cleaning == null && total == null;
  return {
    missing,
    lodging,
    taxes,
    cleaning,
    total,
    nights: num(normalized.nights),
    ownerAdjusted: Boolean(normalized.ownerAdjusted),
    legacy: Boolean(normalized.legacy)
  };
}

function expectedPayoutFromQuote(parts) {
  if (!parts || parts.missing) return null;
  if (parts.lodging != null || parts.cleaning != null) return (parts.lodging || 0) + (parts.cleaning || 0);
  return parts.total;
}

function stripeStatus(payment) {
  if (payment?.verified) return 'verified';
  if (payment?.checkoutCreated) return 'checkout_pending';
  return 'unverified';
}

function addMoney(sum, value) {
  if (value == null) return sum;
  return (sum || 0) + value;
}

function presentBooking(row) {
  const quote = quoteParts(row.quote);
  const payment = row.payment || {};
  const closed = isClosedStatus(row.status);
  return {
    id: row.id,
    guestName: row.guest_name,
    guestEmail: row.guest_email,
    guests: row.guests,
    checkin: row.checkin,
    checkout: row.checkout,
    status: row.status,
    closed,
    quote,
    payment: {
      status: stripeStatus(payment),
      verified: Boolean(payment.verified),
      checkoutCreated: Boolean(payment.checkoutCreated),
      verifiedAmount: num(payment.verifiedAmount),
      amountDue: num(payment.amountDue),
      paymentType: payment.paymentType || null,
      verifiedAt: payment.verifiedAt || null
    },
    expectedPayout: closed ? null : expectedPayoutFromQuote(quote)
  };
}

function summarizeBookings(bookings, now = new Date()) {
  const mtd = { lodging: null, taxes: null, cleaning: null, total: null, expectedPayout: null, bookings: 0, quotedBookings: 0 };
  const counts = {
    bookings: bookings.length,
    quotedBookings: 0,
    missingQuote: 0,
    stripeVerified: 0,
    stripePending: 0,
    stripeCheckoutPending: 0,
    active: 0,
    closed: 0
  };

  for (const booking of bookings) {
    if (booking.closed) counts.closed += 1;
    else counts.active += 1;
    if (booking.quote.missing) counts.missingQuote += 1;
    else counts.quotedBookings += 1;
    if (booking.payment.verified) counts.stripeVerified += 1;
    else {
      counts.stripePending += 1;
      if (booking.payment.checkoutCreated) counts.stripeCheckoutPending += 1;
    }
    if (!isMtdCheckin(booking.checkin, now) || booking.closed) continue;
    mtd.bookings += 1;
    if (booking.quote.missing) continue;
    mtd.quotedBookings += 1;
    mtd.lodging = addMoney(mtd.lodging, booking.quote.lodging);
    mtd.taxes = addMoney(mtd.taxes, booking.quote.taxes);
    mtd.cleaning = addMoney(mtd.cleaning, booking.quote.cleaning);
    mtd.total = addMoney(mtd.total, booking.quote.total);
    mtd.expectedPayout = addMoney(mtd.expectedPayout, booking.expectedPayout);
  }

  return {
    mtd,
    counts,
    mtd_gross: mtd.total,
    mtd_expected_payout: mtd.expectedPayout,
    records: counts.quotedBookings,
    stripe_verified: counts.stripeVerified,
    stripe_pending: counts.stripePending,
    source: 'reservations_quotes_payments',
    stripeNote: 'Stripe payment verification is not live. Amounts stay pending until a verified payment event exists.'
  };
}

function groupPaymentEvents(events) {
  const byReservation = new Map();
  for (const event of events) {
    const id = event.reservation_id;
    const list = byReservation.get(id) || [];
    list.push(event);
    byReservation.set(id, list);
  }
  return byReservation;
}

async function loadOwnerFinancials(sql, now = new Date()) {
  const { paymentSnapshotFromEvents } = require('./payments');
  const reservations = await sql`
    SELECT r.id,r.guest_name,r.guest_email,r.guests,r.checkin::text,r.checkout::text,r.status,
           q.quote
    FROM reservations r
    LEFT JOIN LATERAL (
      SELECT e.metadata->'quote' AS quote
      FROM booking_events e
      WHERE e.reservation_id=r.id AND e.metadata ? 'quote'
      ORDER BY e.created_at DESC,e.id DESC
      LIMIT 1
    ) q ON true
    ORDER BY CASE WHEN r.status IN ('released','expired','cancelled') THEN 1 ELSE 0 END, r.checkin ASC, r.created_at DESC
    LIMIT 250
  `;
  const events = await sql`
    SELECT reservation_id,event_type,metadata,created_at
    FROM booking_events
    WHERE event_type IN ('payment_checkout_created','payment_verified','payment_failed')
    ORDER BY created_at ASC,id ASC
  `;
  const eventsByReservation = groupPaymentEvents(events);
  const bookings = reservations.map(row => presentBooking({
    ...row,
    payment: paymentSnapshotFromEvents(eventsByReservation.get(row.id) || [])
  }));
  return { summary: summarizeBookings(bookings, now), bookings };
}

module.exports = {
  loadOwnerFinancials,
  summarizeBookings,
  presentBooking,
  quoteParts,
  expectedPayoutFromQuote,
  isMtdCheckin,
  isClosedStatus
};
