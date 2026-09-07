/**
 * Atomic guest inquiry create + duplicate-safe retries.
 *
 * Reservation row, quote snapshot, and inquiry_created audit event are written
 * in one Neon HTTP transaction. Same-email + same-dates retries return the
 * existing locking reservation instead of inserting a second hold.
 *
 * Date lock (#67): hold_expires_at stays NULL. expireHolds is not called.
 * Owner blocks are re-checked under the shared date advisory lock so a
 * concurrent manual block / owner stay cannot double-book these nights.
 * OpenSign / Stripe / confirmation sequence are not part of this path.
 */

const { DATE_LOCKING_STATUSES } = require('./booking-transitions');
const {
  REQUEST_VS_OWNER,
  withDateLock
} = require('./date-conflicts');

const INQUIRY_LOCK_STATUSES = DATE_LOCKING_STATUSES;

const DATES_UNAVAILABLE = Object.freeze({
  error: 'dates_unavailable',
  message: 'Those dates are currently being held or are booked.'
});

const DATES_JUST_HELD = Object.freeze({
  error: 'dates_unavailable',
  message: 'Those dates were just placed on hold by another guest.'
});

const OCCUPANCY_MIGRATION_PENDING = Object.freeze({
  error: 'occupancy_migration_pending',
  message: 'The home accommodates up to 14 guests, but online submission for groups of 13–14 is being updated. Please contact CJT Realty and we will place the request directly.'
});

const HOLD_MESSAGE = 'Your dates are reserved while CJT reviews your request and remain unavailable until an owner releases them.';

const TRIP_TYPES = Object.freeze(['Leisure', 'Family', 'Business', 'Other']);
const DETAILS_MAX = 1000;

const INVALID_TRIP_TYPE = Object.freeze({
  error: 'invalid_trip_type',
  message: 'Trip type must be Leisure, Family, Business, or Other.'
});

function normalizeTripType(value) {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== 'string') {
    return { ok: false, status: 400, ...INVALID_TRIP_TYPE };
  }
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (!TRIP_TYPES.includes(trimmed)) {
    return { ok: false, status: 400, ...INVALID_TRIP_TYPE };
  }
  return { ok: true, value: trimmed };
}

function normalizeOptionalBoolean(value, field) {
  if (value == null) return { ok: true, value: null };
  if (typeof value === 'boolean') return { ok: true, value };
  if (typeof value === 'string') {
    const key = value.trim().toLowerCase();
    if (!key) return { ok: true, value: null };
    if (key === 'true' || key === 'yes') return { ok: true, value: true };
    if (key === 'false' || key === 'no') return { ok: true, value: false };
  }
  return {
    ok: false,
    status: 400,
    error: 'invalid_request',
    message: `${field} must be yes, no, true, or false.`
  };
}

function normalizeOptionalDetails(value, max = DETAILS_MAX) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function inquiryOptionsFromPayload(payload = {}) {
  const trip_type = payload.trip_type ?? null;
  const bringing_pet = payload.bringing_pet ?? null;
  const planning_event = payload.planning_event ?? null;
  return {
    trip_type,
    bringing_pet,
    pet_details: bringing_pet === true ? (payload.pet_details ?? null) : null,
    planning_event,
    event_details: planning_event === true ? (payload.event_details ?? null) : null
  };
}

function normalizeInquiryOptions(body = {}) {
  const trip = normalizeTripType(body.trip_type);
  if (!trip.ok) return trip;

  const pet = normalizeOptionalBoolean(body.bringing_pet, 'bringing_pet');
  if (!pet.ok) return pet;

  const event = normalizeOptionalBoolean(body.planning_event, 'planning_event');
  if (!event.ok) return event;

  return {
    ok: true,
    ...inquiryOptionsFromPayload({
      trip_type: trip.value,
      bringing_pet: pet.value,
      pet_details: pet.value === true ? normalizeOptionalDetails(body.pet_details) : null,
      planning_event: event.value,
      event_details: event.value === true ? normalizeOptionalDetails(body.event_details) : null
    })
  };
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isOverlapConstraint(error) {
  const constraint = String(error?.constraint || '');
  const detail = String(error?.message || '').toLowerCase();
  return constraint === 'reservations_no_overlap' || detail.includes('reservations_no_overlap');
}

function isOccupancyConstraintViolation(error) {
  return error?.constraint === 'reservation_guest_count_valid'
    || String(error?.message || '').toLowerCase().includes('reservation_guest_count_valid');
}

function isDuplicateStay(row, request) {
  if (!row) return false;
  const sameEmail = normalizeEmail(row.guest_email) === normalizeEmail(request.guest_email);
  const sameCheckin = String(row.checkin) === String(request.checkin);
  const sameCheckout = String(row.checkout) === String(request.checkout);
  return sameEmail && sameCheckin && sameCheckout;
}

function metadataObject(value) {
  if (value == null) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return {}; }
  }
  if (typeof value === 'object') return value;
  return {};
}

function reservationPublicFields(row) {
  return {
    id: row.id,
    checkin: row.checkin,
    checkout: row.checkout,
    status: row.status,
    hold_expires_at: row.hold_expires_at ?? null
  };
}

function inquirySuccessBody({ reservation, quote, replayed }) {
  return {
    reservation: reservationPublicFields(reservation),
    quote,
    replayed: Boolean(replayed),
    message: HOLD_MESSAGE
  };
}

function inquiryHttpStatus(replayed) {
  return replayed ? 200 : 201;
}

function quoteFromCreatedEvent(event, fallbackQuote) {
  const meta = metadataObject(event?.metadata);
  return meta.quote || fallbackQuote;
}

async function findDuplicateReservation(sql, { guest_email, checkin, checkout }) {
  const email = normalizeEmail(guest_email);
  const rows = await sql`
    SELECT id, guest_name, guest_email, guests, notes,
           checkin::text, checkout::text, status, hold_expires_at
    FROM reservations
    WHERE lower(guest_email) = ${email}
      AND checkin = ${checkin}::date
      AND checkout = ${checkout}::date
      AND status IN ('inquiry_hold','hold_verified','contract_sent','contract_signed','confirmed')
    ORDER BY created_at ASC
    LIMIT 1
  `;
  return rows[0] || null;
}

async function quoteSnapshotFor(sql, reservationId, fallbackQuote) {
  const events = await sql`
    SELECT event_type, metadata
    FROM booking_events
    WHERE reservation_id = ${reservationId} AND event_type = 'inquiry_created'
    ORDER BY created_at ASC
    LIMIT 1
  `;
  return quoteFromCreatedEvent(events[0], fallbackQuote);
}

async function insertInquiryAtomic(sql, payload) {
  const options = inquiryOptionsFromPayload(payload);
  const metadata = JSON.stringify({ guests: payload.guests, quote: payload.quote, ...options });
  const [inserted] = await withDateLock(sql, [
    sql`
      INSERT INTO reservations (id,guest_name,guest_email,guest_phone,guests,notes,checkin,checkout,trip_type,bringing_pet,pet_details,planning_event,event_details,status,hold_expires_at)
      SELECT ${payload.id},${payload.guest_name},${payload.guest_email},${payload.guest_phone || null},${payload.guests},${payload.notes || null},${payload.checkin}::date,${payload.checkout}::date,${options.trip_type},${options.bringing_pet},${options.pet_details},${options.planning_event},${options.event_details},'inquiry_hold',NULL
      WHERE NOT EXISTS (
        SELECT 1 FROM owner_calendar_entries
        WHERE property_id = 'sand-sea-manor'
          AND daterange(start_date, end_date, '[)') && daterange(${payload.checkin}::date, ${payload.checkout}::date, '[)')
      )
      RETURNING id,checkin::text,checkout::text,status,hold_expires_at
    `,
    sql`
      INSERT INTO booking_events (reservation_id,event_type,actor,metadata)
      SELECT ${payload.id},'inquiry_created','guest',${metadata}::jsonb
      WHERE EXISTS (SELECT 1 FROM reservations WHERE id = ${payload.id})
    `
  ]);
  return inserted && inserted[0] ? inserted[0] : null;
}

async function replayExisting(sql, existing, fallbackQuote) {
  const quote = await quoteSnapshotFor(sql, existing.id, fallbackQuote);
  return { ok: true, replayed: true, reservation: existing, quote };
}

async function resolveDatesConflict(sql, payload, message = DATES_UNAVAILABLE.message) {
  const existing = await findDuplicateReservation(sql, payload);
  if (existing) return replayExisting(sql, existing, payload.quote);
  return { ok: false, status: 409, error: 'dates_unavailable', message };
}

async function persistInquiry(sql, payload) {
  const existing = await findDuplicateReservation(sql, payload);
  if (existing) return replayExisting(sql, existing, payload.quote);

  try {
    const reservation = await insertInquiryAtomic(sql, payload);
    if (!reservation) {
      return resolveDatesConflict(sql, payload, REQUEST_VS_OWNER.message);
    }
    return { ok: true, replayed: false, reservation, quote: payload.quote };
  } catch (error) {
    if (isOverlapConstraint(error)) {
      return resolveDatesConflict(sql, payload, DATES_JUST_HELD.message);
    }
    if (isOccupancyConstraintViolation(error) && payload.guests > 12) {
      return { ok: false, status: 503, ...OCCUPANCY_MIGRATION_PENDING };
    }
    throw error;
  }
}

module.exports = {
  INQUIRY_LOCK_STATUSES,
  DATES_UNAVAILABLE,
  DATES_JUST_HELD,
  REQUEST_VS_OWNER,
  HOLD_MESSAGE,
  TRIP_TYPES,
  DETAILS_MAX,
  INVALID_TRIP_TYPE,
  normalizeEmail,
  normalizeInquiryOptions,
  inquiryOptionsFromPayload,
  isOverlapConstraint,
  isOccupancyConstraintViolation,
  isDuplicateStay,
  reservationPublicFields,
  inquirySuccessBody,
  inquiryHttpStatus,
  quoteFromCreatedEvent,
  findDuplicateReservation,
  quoteSnapshotFor,
  insertInquiryAtomic,
  resolveDatesConflict,
  persistInquiry
};
