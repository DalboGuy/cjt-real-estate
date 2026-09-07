const crypto = require('crypto');
const { db, ensureSchema, expireHolds } = require('../lib/db');
const { quoteStay, eachDate } = require('../lib/pricing');
const { loadPricingCatalog } = require('../lib/pricing-store');
const { markRequestReceived, datesAvailable } = require('../lib/booking-lifecycle');

function clean(v, max = 500) { return String(v || '').trim().slice(0, max); }
function validDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
function isOccupancyConstraintViolation(error) {
  return error?.constraint === 'reservation_guest_count_valid' || String(error?.message || '').toLowerCase().includes('reservation_guest_count_valid');
}
function makeId(checkin) { return `DB-${String(checkin).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`; }
function yesNo(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'yes' || v === 'true' || v === '1') return 'yes';
  return 'no';
}

module.exports = async function (req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    await ensureSchema();
    await expireHolds();
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const guest_name = clean(body.name, 120);
    const guest_email = clean(body.email, 180);
    const guest_phone = clean(body.phone, 60);
    const notes = clean(body.message, 2000);
    const tripType = clean(body.trip_type || body.tripType, 80);
    const petRequest = yesNo(body.pets);
    const eventRequest = yesNo(body.event);
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
    try { quote = await quoteStay(checkin, checkout, guests, catalog); }
    catch (e) {
      return res.status(e.status || 422).json({ error: e.code || 'pricing_unavailable', message: e.message || 'Pricing is not available for those dates.' });
    }

    const sql = db();
    try {
      await datesAvailable(sql, checkin, checkout, '');
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.code, message: e.message });
      throw e;
    }

    const requestNotes = [
      notes,
      petRequest === 'yes' ? 'Guest is asking for pet approval.' : '',
      eventRequest === 'yes' ? 'Guest is asking about an event/gathering.' : '',
      tripType ? `Trip type: ${tripType}` : ''
    ].filter(Boolean).join('\n');

    const id = makeId(checkin);
    let rows;
    try {
      rows = await sql`
        INSERT INTO reservations (id,guest_name,guest_email,guest_phone,guests,notes,checkin,checkout,status,hold_expires_at)
        VALUES (${id},${guest_name},${guest_email},${guest_phone || null},${guests},${requestNotes || null},${checkin}::date,${checkout}::date,'inquiry_hold',now()+interval '24 hours')
        RETURNING id,guest_name,checkin::text,checkout::text,guests,status,hold_expires_at
      `;
    } catch (e) {
      const detail = String(e.message || '').toLowerCase();
      if (detail.includes('reservations_no_overlap')) {
        return res.status(409).json({ error: 'dates_unavailable', message: 'Those dates were just placed on hold by another guest.' });
      }
      if (isOccupancyConstraintViolation(e) && guests > 12) {
        return res.status(503).json({ error: 'occupancy_migration_pending', message: 'The home accommodates up to 14 guests, but online submission for groups of 13–14 is being updated. Please contact CJT Realty and we will place the request directly.' });
      }
      throw e;
    }
    await markRequestReceived(sql, rows[0], {
      guests,
      quote,
      tripType: tripType || null,
      petRequest,
      eventRequest,
      notes: notes || null,
      confirmed: false,
      paymentCollected: false
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(201).json({
      reservation: rows[0],
      quote,
      blockedDates: eachDate(checkin, checkout),
      holdHours: 24,
      calendarBlocked: true,
      confirmed: false,
      paymentCollected: false,
      message: 'Your request is not yet confirmed. Those dates are blocked on the public calendar for 24 hours while CJT Realty reviews the request. No payment is collected now.'
    });
  } catch (e) {
    console.error('inquiry error', e);
    return res.status(500).json({ error: 'booking_unavailable', message: 'We could not place the hold. Please contact CJT Realty directly.' });
  }
};
