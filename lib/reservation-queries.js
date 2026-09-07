/**
 * Reservation list reads use a stay-date window instead of a hard LIMIT.
 * Default: last 365 days in America/Chicago through unbounded future, so
 * far-future bookings are not dropped behind older rows. Pass from/to
 * (YYYY-MM-DD, to inclusive) to override. Overlap is checkout > from and
 * checkin <= to.
 */
const PROPERTY_TIMEZONE = 'America/Chicago';
const DEFAULT_RESERVATION_LOOKBACK_DAYS = 365;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function ReservationWindowError(message) {
  const error = new Error(message);
  error.code = 'invalid_date_range';
  error.status = 400;
  return error;
}

function isIsoDate(value) {
  const day = String(value || '');
  if (!ISO_DATE.test(day)) return false;
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  const utc = new Date(Date.UTC(year, month - 1, date));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === date;
}

function firstQueryValue(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  if (value == null) return '';
  return String(value).trim();
}

function todayInPropertyTz(now = new Date(), timeZone = PROPERTY_TIMEZONE) {
  const when = now instanceof Date ? now : new Date(now);
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(when);
}

function addUtcDays(isoDate, delta) {
  if (!isIsoDate(isoDate) || !Number.isFinite(Number(delta))) return '';
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const date = Number(isoDate.slice(8, 10));
  const shifted = new Date(Date.UTC(year, month - 1, date + Number(delta)));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

function queryParams(req = {}) {
  if (req.query && typeof req.query === 'object') return req.query;
  try {
    return Object.fromEntries(new URL(req.url || '', 'http://localhost').searchParams);
  } catch {
    return {};
  }
}

function readReservationWindowParams(input = {}) {
  const query = input && typeof input === 'object' && (input.query || input.url)
    ? queryParams(input)
    : input;
  return {
    from: firstQueryValue(query.from),
    to: firstQueryValue(query.to)
  };
}

function resolveReservationWindow({ from, to, now } = {}) {
  const requestedFrom = firstQueryValue(from);
  const requestedTo = firstQueryValue(to);
  if (requestedFrom && !isIsoDate(requestedFrom)) {
    throw ReservationWindowError('from must be a valid YYYY-MM-DD date.');
  }
  if (requestedTo && !isIsoDate(requestedTo)) {
    throw ReservationWindowError('to must be a valid YYYY-MM-DD date.');
  }
  const today = todayInPropertyTz(now);
  const resolvedFrom = requestedFrom || addUtcDays(today, -DEFAULT_RESERVATION_LOOKBACK_DAYS);
  const resolvedTo = requestedTo || null;
  if (!resolvedFrom) {
    throw ReservationWindowError('from must be a valid YYYY-MM-DD date.');
  }
  if (resolvedTo && resolvedFrom > resolvedTo) {
    throw ReservationWindowError('from must be on or before to.');
  }
  return { from: resolvedFrom, to: resolvedTo };
}

function overlapsReservationWindow(row, window) {
  const checkin = String(row?.checkin || '').slice(0, 10);
  const checkout = String(row?.checkout || '').slice(0, 10);
  if (!isIsoDate(checkin) || !isIsoDate(checkout)) return false;
  if (!(checkout > window.from)) return false;
  if (window.to && !(checkin <= window.to)) return false;
  return true;
}

async function listReservations(sql, options = {}) {
  const includeClosed = Boolean(options.includeClosed);
  const withQuote = Boolean(options.withQuote);
  const window = resolveReservationWindow(options);

  if (withQuote && window.to) {
    return sql`
      SELECT r.id,r.guest_name,r.guest_email,r.guest_phone,r.guests,r.notes,
             r.trip_type,r.bringing_pet,r.pet_details,r.planning_event,r.event_details,
             r.checkin::text,r.checkout::text,r.status,r.hold_expires_at,
             r.contract_sent_at,r.contract_signed_at,r.deposit_received_at,r.released_at,r.created_at,r.updated_at,
             q.quote
      FROM reservations r
      LEFT JOIN LATERAL (
        SELECT e.metadata->'quote' AS quote
        FROM booking_events e
        WHERE e.reservation_id=r.id AND e.metadata ? 'quote'
        ORDER BY e.created_at DESC,e.id DESC
        LIMIT 1
      ) q ON true
      WHERE r.checkout > ${window.from}::date
        AND r.checkin <= ${window.to}::date
        AND (${includeClosed} OR r.status IN ('inquiry_hold','hold_verified','contract_sent','contract_signed','confirmed'))
      ORDER BY CASE WHEN r.status IN ('released','expired','cancelled') THEN 1 ELSE 0 END, r.checkin ASC, r.created_at DESC
    `;
  }

  if (withQuote) {
    return sql`
      SELECT r.id,r.guest_name,r.guest_email,r.guest_phone,r.guests,r.notes,
             r.trip_type,r.bringing_pet,r.pet_details,r.planning_event,r.event_details,
             r.checkin::text,r.checkout::text,r.status,r.hold_expires_at,
             r.contract_sent_at,r.contract_signed_at,r.deposit_received_at,r.released_at,r.created_at,r.updated_at,
             q.quote
      FROM reservations r
      LEFT JOIN LATERAL (
        SELECT e.metadata->'quote' AS quote
        FROM booking_events e
        WHERE e.reservation_id=r.id AND e.metadata ? 'quote'
        ORDER BY e.created_at DESC,e.id DESC
        LIMIT 1
      ) q ON true
      WHERE r.checkout > ${window.from}::date
        AND (${includeClosed} OR r.status IN ('inquiry_hold','hold_verified','contract_sent','contract_signed','confirmed'))
      ORDER BY CASE WHEN r.status IN ('released','expired','cancelled') THEN 1 ELSE 0 END, r.checkin ASC, r.created_at DESC
    `;
  }

  if (window.to) {
    return sql`
      SELECT r.id, r.guest_name, r.guest_email, r.guest_phone, r.guests, r.notes,
             r.trip_type, r.bringing_pet, r.pet_details, r.planning_event, r.event_details,
             r.checkin::text, r.checkout::text, r.status, r.hold_expires_at
      FROM reservations r
      WHERE r.checkout > ${window.from}::date
        AND r.checkin <= ${window.to}::date
        AND (${includeClosed} OR r.status IN ('inquiry_hold','hold_verified','contract_sent','contract_signed','confirmed'))
      ORDER BY r.checkin ASC
    `;
  }

  return sql`
    SELECT r.id, r.guest_name, r.guest_email, r.guest_phone, r.guests, r.notes,
           r.trip_type, r.bringing_pet, r.pet_details, r.planning_event, r.event_details,
           r.checkin::text, r.checkout::text, r.status, r.hold_expires_at
    FROM reservations r
    WHERE r.checkout > ${window.from}::date
      AND (${includeClosed} OR r.status IN ('inquiry_hold','hold_verified','contract_sent','contract_signed','confirmed'))
    ORDER BY r.checkin ASC
  `;
}

module.exports = {
  DEFAULT_RESERVATION_LOOKBACK_DAYS,
  PROPERTY_TIMEZONE,
  addUtcDays,
  isIsoDate,
  listReservations,
  overlapsReservationWindow,
  queryParams,
  readReservationWindowParams,
  resolveReservationWindow,
  todayInPropertyTz
};
