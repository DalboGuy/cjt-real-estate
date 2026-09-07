const { normalizeOwnerQuote } = require('./pricing');

const CLOSED_STATUSES = new Set(['released', 'expired', 'cancelled']);
const OTA_CLOSED_STATUSES = new Set(['cancelled']);
const PROPERTY_TIMEZONE = 'America/Chicago';
const CHANNEL_LABELS = {
  direct: 'Direct',
  airbnb: 'Airbnb',
  vrbo: 'Vrbo',
  'booking.com': 'Booking.com',
  houfy: 'Houfy',
  other: 'Other'
};

function datePartsInTimeZone(date, timeZone = PROPERTY_TIMEZONE) {
  const when = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(when);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return { year: get('year'), month: get('month'), day: get('day') };
}

function monthKeyInTimeZone(date, timeZone = PROPERTY_TIMEZONE) {
  const { year, month } = datePartsInTimeZone(date, timeZone);
  return year && month ? `${year}-${month}` : '';
}

function monthLabelInTimeZone(date, timeZone = PROPERTY_TIMEZONE) {
  const when = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', year: 'numeric' }).format(when);
}

function yearKeyInTimeZone(date, timeZone = PROPERTY_TIMEZONE) {
  return datePartsInTimeZone(date, timeZone).year || '';
}

function lastDayOfMonth(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m) return '';
  const day = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function stayDate(value) {
  const day = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '';
}

function nightsBetween(checkin, checkout) {
  const start = stayDate(checkin);
  const end = stayDate(checkout);
  if (!start || !end) return null;
  const ms = Date.parse(`${end}T12:00:00`) - Date.parse(`${start}T12:00:00`);
  if (!Number.isFinite(ms)) return null;
  const nights = Math.round(ms / 86400000);
  return nights > 0 ? nights : null;
}

function dateRangeForPreset(preset, now = new Date(), custom = {}) {
  const parts = datePartsInTimeZone(now);
  const year = parts.year;
  const month = parts.month;
  if (preset === 'month') {
    return { preset: 'month', from: year && month ? `${year}-${month}-01` : '', to: lastDayOfMonth(year, month) };
  }
  if (preset === 'year') {
    return { preset: 'year', from: year ? `${year}-01-01` : '', to: year ? `${year}-12-31` : '' };
  }
  if (preset === 'custom') {
    return { preset: 'custom', from: stayDate(custom.from), to: stayDate(custom.to) };
  }
  return { preset: 'all', from: '', to: '' };
}

function isCheckinInRange(checkin, range = {}) {
  const day = stayDate(checkin);
  if (!day) return false;
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
}

function num(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isClosedStatus(status) {
  return CLOSED_STATUSES.has(String(status || ''));
}

function isMtdCheckin(checkin, now = new Date()) {
  const day = stayDate(checkin);
  if (!day) return false;
  const key = monthKeyInTimeZone(now);
  return Boolean(key) && day.startsWith(`${key}-`);
}

function channelLabel(channel) {
  return CHANNEL_LABELS[String(channel || '').toLowerCase()] || String(channel || 'Other');
}

function guestNameFromNotes(notes) {
  const text = String(notes || '').trim();
  const match = text.match(/^\s*Guest:\s*(.+)$/i);
  if (!match) return text || 'Guest';
  return match[1].split('|')[0].trim() || 'Guest';
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
  const nights = quote.nights != null ? quote.nights : nightsBetween(row.checkin, row.checkout);
  return {
    id: row.id,
    kind: 'direct',
    channel: 'direct',
    sourceLabel: 'Direct',
    guestName: row.guest_name,
    guestEmail: row.guest_email,
    guests: row.guests,
    checkin: row.checkin,
    checkout: row.checkout,
    nights,
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
    expectedPayout: closed ? null : expectedPayoutFromQuote(quote),
    revenue: quote.missing ? null : quote.total,
    imported: false
  };
}

function presentImportedStay(row) {
  const channel = String(row.channel || 'other').toLowerCase();
  const closed = OTA_CLOSED_STATUSES.has(String(row.status || ''));
  const total = num(row.gross_revenue);
  const taxes = num(row.taxes);
  const cleaning = num(row.cleaning_fee);
  const missing = total == null && taxes == null && cleaning == null;
  const nights = nightsBetween(row.checkin, row.checkout);
  return {
    id: row.booking_key || row.external_reference || `${channel}:${row.checkin}`,
    kind: 'ota',
    channel,
    sourceLabel: channelLabel(channel),
    guestName: guestNameFromNotes(row.notes),
    guestEmail: null,
    guests: null,
    checkin: row.checkin,
    checkout: row.checkout,
    nights,
    status: row.status,
    closed,
    quote: {
      missing,
      lodging: null,
      taxes,
      cleaning,
      total,
      nights,
      ownerAdjusted: false,
      legacy: false
    },
    payment: {
      status: 'ota',
      verified: false,
      checkoutCreated: false,
      verifiedAmount: num(row.collected_amount),
      amountDue: null,
      paymentType: null,
      verifiedAt: null
    },
    expectedPayout: closed ? null : num(row.expected_payout),
    revenue: missing ? null : total,
    imported: true,
    importedSource: row.source || null,
    externalReference: row.external_reference || null
  };
}

function emptyPeriod() {
  return {
    lodging: null,
    taxes: null,
    cleaning: null,
    total: null,
    expectedPayout: null,
    bookings: 0,
    quotedBookings: 0,
    nights: null,
    revenuePerNight: null,
    directRevenue: null,
    otaRevenue: null
  };
}

function contributePeriod(period, booking) {
  period.bookings += 1;
  if (booking.quote.missing) return;
  period.quotedBookings += 1;
  period.lodging = addMoney(period.lodging, booking.quote.lodging);
  period.taxes = addMoney(period.taxes, booking.quote.taxes);
  period.cleaning = addMoney(period.cleaning, booking.quote.cleaning);
  period.total = addMoney(period.total, booking.quote.total);
  period.expectedPayout = addMoney(period.expectedPayout, booking.expectedPayout);
  period.nights = addMoney(period.nights, booking.nights);
  if (booking.kind === 'ota') period.otaRevenue = addMoney(period.otaRevenue, booking.quote.total);
  else period.directRevenue = addMoney(period.directRevenue, booking.quote.total);
}

function finishPeriod(period) {
  if (period.total != null && period.nights) period.revenuePerNight = period.total / period.nights;
  return period;
}

function monthKeysBetween(from, to) {
  const start = stayDate(from);
  const end = stayDate(to);
  if (!start || !end || start > end) return [];
  const keys = [];
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7));
  const endYear = Number(end.slice(0, 4));
  const endMonth = Number(end.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

function monthlyRevenueSeries(bookings, range = {}) {
  const contributing = bookings.filter((booking) => !booking.closed && !booking.quote.missing);
  const dates = contributing.map((booking) => stayDate(booking.checkin)).filter(Boolean).sort();
  const from = dates[0] || range.from || '';
  const to = dates[dates.length - 1] || range.to || '';
  const keys = monthKeysBetween(from ? `${from.slice(0, 7)}-01` : '', to ? lastDayOfMonth(to.slice(0, 4), to.slice(5, 7)) : '');
  const byMonth = new Map(keys.map((key) => [key, { month: key, label: monthLabelInTimeZone(`${key}-15T12:00:00`), direct: null, ota: null, total: null }]));
  for (const booking of contributing) {
    const key = stayDate(booking.checkin).slice(0, 7);
    const bucket = byMonth.get(key);
    if (!bucket) continue;
    const amount = booking.quote.total;
    bucket.total = addMoney(bucket.total, amount);
    if (booking.kind === 'ota') bucket.ota = addMoney(bucket.ota, amount);
    else bucket.direct = addMoney(bucket.direct, amount);
  }
  return [...byMonth.values()];
}

function summarizeBookings(bookings, now = new Date()) {
  const mtd = emptyPeriod();
  const counts = {
    bookings: bookings.length,
    quotedBookings: 0,
    missingQuote: 0,
    stripeVerified: 0,
    stripePending: 0,
    stripeCheckoutPending: 0,
    active: 0,
    closed: 0,
    direct: 0,
    ota: 0
  };

  for (const booking of bookings) {
    if (booking.closed) counts.closed += 1;
    else counts.active += 1;
    if (booking.kind === 'ota') counts.ota += 1;
    else counts.direct += 1;
    if (booking.quote.missing) counts.missingQuote += 1;
    else counts.quotedBookings += 1;
    if (booking.kind !== 'ota') {
      if (booking.payment.verified) counts.stripeVerified += 1;
      else {
        counts.stripePending += 1;
        if (booking.payment.checkoutCreated) counts.stripeCheckoutPending += 1;
      }
    }
    if (!isMtdCheckin(booking.checkin, now) || booking.closed) continue;
    contributePeriod(mtd, booking);
  }

  finishPeriod(mtd);

  return {
    mtd,
    counts,
    mtdMonth: monthKeyInTimeZone(now),
    mtdMonthLabel: monthLabelInTimeZone(now),
    timezone: PROPERTY_TIMEZONE,
    mtd_gross: mtd.total,
    mtd_expected_payout: mtd.expectedPayout,
    records: counts.quotedBookings,
    stripe_verified: counts.stripeVerified,
    stripe_pending: counts.stripePending,
    source: 'reservations_quotes_payments_booking_financials',
    stripeNote: 'Stripe payment verification is not live. Amounts stay pending until a verified payment event exists. OTA stays settle on their channel, not Stripe.'
  };
}

function summarizePeriod(bookings, range = {}, now = new Date()) {
  const period = emptyPeriod();
  const inRange = bookings.filter((booking) => isCheckinInRange(booking.checkin, range));
  for (const booking of inRange) {
    if (booking.closed) continue;
    contributePeriod(period, booking);
  }
  finishPeriod(period);
  const summary = summarizeBookings(bookings, now);
  return {
    ...summary,
    period,
    range,
    chart: monthlyRevenueSeries(inRange, range)
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

function isMissingRelation(error) {
  return error?.code === '42P01' || /does not exist/i.test(String(error?.message || ''));
}

async function tableExists(sql, name) {
  const rows = await sql`SELECT to_regclass(${`public.${name}`})::text AS relation`;
  return Boolean(rows[0]?.relation);
}

async function loadImportedFinancials(sql) {
  try {
    if (!(await tableExists(sql, 'booking_financials'))) {
      return { rows: [], available: false };
    }
    const rows = await sql`
      SELECT booking_key, channel, checkin::text, checkout::text, status,
             gross_revenue, taxes, cleaning_fee, expected_payout, collected_amount,
             source, external_reference, notes
      FROM booking_financials
      ORDER BY checkin DESC, booking_key DESC
      LIMIT 500
    `;
    return { rows, available: true };
  } catch (error) {
    if (isMissingRelation(error)) return { rows: [], available: false };
    throw error;
  }
}

function sortBookings(bookings) {
  return [...bookings].sort((a, b) => {
    if (a.closed !== b.closed) return a.closed ? 1 : -1;
    const checkin = String(a.checkin || '').localeCompare(String(b.checkin || ''));
    if (checkin) return checkin;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
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
  const imported = await loadImportedFinancials(sql);
  const eventsByReservation = groupPaymentEvents(events);
  const direct = reservations.map(row => presentBooking({
    ...row,
    payment: paymentSnapshotFromEvents(eventsByReservation.get(row.id) || [])
  }));
  const ota = imported.rows.map(presentImportedStay);
  const bookings = sortBookings([...direct, ...ota]);
  const yearRange = dateRangeForPreset('year', now);
  const summary = summarizePeriod(bookings, yearRange, now);
  summary.ota = {
    available: imported.available,
    count: ota.length,
    source: imported.available ? 'booking_financials' : null
  };
  return { summary, bookings };
}

module.exports = {
  loadOwnerFinancials,
  loadImportedFinancials,
  summarizeBookings,
  summarizePeriod,
  presentBooking,
  presentImportedStay,
  quoteParts,
  expectedPayoutFromQuote,
  isMtdCheckin,
  isCheckinInRange,
  isClosedStatus,
  dateRangeForPreset,
  monthlyRevenueSeries,
  nightsBetween,
  guestNameFromNotes,
  channelLabel,
  PROPERTY_TIMEZONE,
  monthKeyInTimeZone,
  monthLabelInTimeZone,
  yearKeyInTimeZone,
  lastDayOfMonth
};
