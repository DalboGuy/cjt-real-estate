const crypto = require('crypto');
const { db, ensureSchema } = require('../lib/db');
const { getGuestBlockedDates } = require('../lib/calendar-view');
const { quoteStay, eachDate } = require('../lib/pricing');
const { loadPricingCatalog } = require('../lib/pricing-store');
const {
  DATES_UNAVAILABLE,
  findDuplicateReservation,
  inquiryHttpStatus,
  inquirySuccessBody,
  persistInquiry,
  quoteSnapshotFor,
  resolveDatesConflict
} = require('../lib/inquiry-create');

function clean(v, max = 500) {
  return String(v || '').trim().slice(0, max);
}
function validDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
}
function makeId(checkin) {
  return `DB-${String(checkin).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function sendInquiryResult(res, result) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(inquiryHttpStatus(result.replayed)).json(inquirySuccessBody(result));
}

module.exports = async function (req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    await ensureSchema();
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const guest_name = clean(body.name, 120);
    const guest_email = clean(body.email, 180);
    const guest_phone = clean(body.phone, 60);
    const notes = clean(body.message, 2000);
    const checkin = clean(body.checkin, 10);
    const checkout = clean(body.checkout, 10);
    const guests = Number(body.guests);
    const catalog = await loadPricingCatalog();
    const maxGuests = Number(catalog.maxGuests || 14);
    if (!guest_name || !guest_email.includes('@') || !validDate(checkin) || !validDate(checkout) || !Number.isInteger(guests) || guests < 1 || guests > maxGuests) {
      return res.status(400).json({ error: 'invalid_request', message: `Please complete all required booking fields. Maximum overnight occupancy is ${maxGuests} guests.` });
    }
    if (checkout <= checkin) return res.status(400).json({ error: 'invalid_dates', message: 'Check-out must be after check-in.' });
    const today = new Date().toISOString().slice(0, 10);
    if (checkin < today) return res.status(400).json({ error: 'past_date', message: 'Check-in must be a future date.' });

    let quote;
    try {
      quote = await quoteStay(checkin, checkout, guests, catalog);
    } catch (e) {
      return res.status(e.status || 422).json({ error: e.code || 'pricing_unavailable', message: e.message || 'Pricing is not available for those dates.' });
    }

    const payload = {
      id: makeId(checkin),
      guest_name,
      guest_email,
      guest_phone,
      guests,
      notes,
      checkin,
      checkout,
      quote
    };

    const sql = db();
    const existing = await findDuplicateReservation(sql, payload);
    if (existing) {
      const storedQuote = await quoteSnapshotFor(sql, existing.id, quote);
      return sendInquiryResult(res, { reservation: existing, quote: storedQuote, replayed: true });
    }

    const { dates: blockedDates } = await getGuestBlockedDates();
    const requested = eachDate(checkin, checkout);
    if (requested.some((d) => blockedDates.has(d))) {
      const conflict = await resolveDatesConflict(sql, payload, DATES_UNAVAILABLE.message);
      if (conflict.ok) return sendInquiryResult(res, conflict);
      return res.status(409).json({ error: conflict.error, message: conflict.message });
    }

    const overlap = await sql`
      SELECT id FROM reservations
      WHERE status IN ('inquiry_hold','hold_verified','contract_sent','contract_signed','confirmed')
        AND daterange(checkin,checkout,'[)') && daterange(${checkin}::date,${checkout}::date,'[)')
      LIMIT 1
    `;
    if (overlap.length) {
      const conflict = await resolveDatesConflict(sql, payload, DATES_UNAVAILABLE.message);
      if (conflict.ok) return sendInquiryResult(res, conflict);
      return res.status(409).json({ error: conflict.error, message: conflict.message });
    }

    const created = await persistInquiry(sql, payload);
    if (!created.ok) {
      return res.status(created.status || 500).json({ error: created.error, message: created.message });
    }
    return sendInquiryResult(res, created);
  } catch (e) {
    console.error('inquiry error', e);
    return res.status(500).json({ error: 'booking_unavailable', message: 'We could not place the hold. Please contact CJT Realty directly.' });
  }
};
