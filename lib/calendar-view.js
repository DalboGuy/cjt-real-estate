const {
  getOtaBlockedDates,
  eachDate,
  classifyChannel,
  parseIcalEvents
} = require('./availability');

function dbApi() {
  return require('./db');
}

const DEFAULT_PROPERTY = Object.freeze({
  id: 'sand-sea-manor',
  name: 'Sand & Sea Manor',
  timezone: 'America/Chicago',
  checkinTime: '4:00 PM',
  checkoutTime: '10:00 AM'
});

const CHANNEL_META = Object.freeze({
  direct: { id: 'direct', label: 'Direct', occupancy: true, blocksGuests: true },
  airbnb: { id: 'airbnb', label: 'Airbnb', occupancy: true, blocksGuests: true },
  vrbo: { id: 'vrbo', label: 'VRBO', occupancy: true, blocksGuests: true },
  'booking.com': { id: 'booking.com', label: 'Booking.com', occupancy: true, blocksGuests: true },
  owner_stay: { id: 'owner_stay', label: 'Owner stay', occupancy: false, blocksGuests: true },
  manual_block: { id: 'manual_block', label: 'Manual block', occupancy: false, blocksGuests: true },
  prep: { id: 'prep', label: 'Prep / turnover', occupancy: false, blocksGuests: true },
  other: { id: 'other', label: 'Unknown / Other', occupancy: true, blocksGuests: true }
});

const HOLD_STATUSES = Object.freeze(['inquiry_hold', 'hold_verified']);
const CONFIRMED_STATUSES = Object.freeze(['contract_sent', 'contract_signed', 'confirmed']);
const CLOSED_STATUSES = Object.freeze(['released', 'expired', 'cancelled']);
const DEFAULT_SETTINGS = Object.freeze({
  // Locked owner-calendar defaults (Joel, 2026-09-07):
  // names ON in the night drawer; phone/email hidden; prep opt-in; month view + all filters are UI defaults.
  prepBufferEnabled: false,
  showGuestNames: true,
  showGuestContact: false
});

function pad2(n) {
  return String(n).padStart(2, '0');
}

function addDays(isoDate, n) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function todayInPropertyTz(timezone = DEFAULT_PROPERTY.timezone) {
  return new Date().toLocaleDateString('en-CA', { timeZone: timezone });
}

function monthBounds(year, month) {
  const start = `${year}-${pad2(month)}-01`;
  const nextY = month === 12 ? year + 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  return { start, end: `${nextY}-${pad2(nextM)}-01` };
}

function weekBounds(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const start = addDays(isoDate, -d.getUTCDay());
  return { start, end: addDays(start, 7) };
}

function currentMonthParts(timezone = DEFAULT_PROPERTY.timezone) {
  const today = todayInPropertyTz(timezone);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return { year, month, today };
}

function validIsoDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
}

function reservationStatusBucket(status) {
  if (HOLD_STATUSES.includes(status)) return 'hold';
  if (CONFIRMED_STATUSES.includes(status)) return 'confirmed';
  if (CLOSED_STATUSES.includes(status)) return 'cancelled';
  return 'other';
}

function channelMeta(id) {
  return CHANNEL_META[id] || CHANNEL_META.other;
}

function assembleEvents({ otaEvents = [], reservations = [], entries = [], settings = DEFAULT_SETTINGS }) {
  const events = [];

  for (const r of reservations) {
    const bucket = reservationStatusBucket(r.status);
    const occupies = bucket !== 'cancelled';
    events.push({
      id: `direct:${r.id}`,
      reservationId: r.id,
      channel: 'direct',
      kind: 'direct',
      label: CHANNEL_META.direct.label,
      start: r.checkin,
      end: r.checkout,
      nights: eachDate(r.checkin, r.checkout).length,
      summary: occupies ? 'Direct booking' : `Direct · ${bucket}`,
      guestName: r.guest_name || null,
      guestCount: Number.isInteger(Number(r.guests)) ? Number(r.guests) : null,
      guestEmail: r.guest_email || null,
      guestPhone: r.guest_phone || null,
      notes: r.notes || null,
      status: r.status,
      statusBucket: bucket,
      origin: 'direct',
      occupancy: occupies,
      blocksGuests: occupies,
      canDelete: false
    });
  }

  const seenOta = new Set();
  for (const ev of otaEvents) {
    if (String(ev.status || '').toUpperCase() === 'CANCELLED') continue;
    const channel = ev.channel || classifyChannel({ label: ev.label, host: ev.hostHint, name: ev.feedName }) || 'other';
    const start = ev.start;
    const end = ev.end;
    if (!validIsoDate(start) || !validIsoDate(end) || end <= start) continue;
    const key = `${channel}|${start}|${end}|${String(ev.summary || '').toLowerCase()}`;
    if (seenOta.has(key)) continue;
    seenOta.add(key);
    const tentative = /tentative|hold/i.test(String(ev.status || ''));
    events.push({
      id: `ota:${ev.uid || key}`,
      channel,
      kind: 'ota',
      label: channelMeta(channel).label,
      start,
      end,
      nights: eachDate(start, end).length,
      summary: ev.summary || 'Blocked',
      guestName: null,
      guestCount: null,
      notes: ev.notes || null,
      status: ev.status || 'CONFIRMED',
      statusBucket: tentative ? 'hold' : 'confirmed',
      origin: ev.origin || 'ota',
      sourceLabel: ev.label || ev.feedName || channelMeta(channel).label,
      occupancy: channelMeta(channel).occupancy,
      blocksGuests: true,
      canDelete: false,
      duplicateOf: ev.duplicateOf || null
    });
  }

  for (const row of entries) {
    const channel = row.kind === 'owner_stay' ? 'owner_stay' : 'manual_block';
    const start = row.start_date;
    const end = row.end_date;
    if (!validIsoDate(start) || !validIsoDate(end) || end <= start) continue;
    events.push({
      id: `entry:${row.id}`,
      entryId: Number(row.id),
      channel,
      kind: channel,
      label: channelMeta(channel).label,
      start,
      end,
      nights: eachDate(start, end).length,
      summary: channel === 'owner_stay' ? 'Owner stay' : 'Manual block',
      guestName: null,
      guestCount: null,
      notes: row.notes || null,
      status: 'confirmed',
      statusBucket: 'confirmed',
      origin: 'owner',
      occupancy: false,
      blocksGuests: true,
      canDelete: true
    });
  }

  if (settings.prepBufferEnabled) {
    const occupancyEvents = events.filter((ev) => ev.occupancy && ev.statusBucket !== 'cancelled');
    const prepSeen = new Set();
    for (const ev of occupancyEvents) {
      const checkout = ev.end;
      if (prepSeen.has(checkout)) continue;
      prepSeen.add(checkout);
      events.push({
        id: `prep:${checkout}`,
        channel: 'prep',
        kind: 'prep',
        label: CHANNEL_META.prep.label,
        start: checkout,
        end: addDays(checkout, 1),
        nights: 1,
        summary: 'Prep / turnover',
        notes: '1-day buffer after checkout',
        status: 'confirmed',
        statusBucket: 'confirmed',
        origin: 'derived',
        occupancy: false,
        blocksGuests: true,
        canDelete: false,
        derivedFrom: ev.id
      });
    }
  }

  return events;
}

function buildNightMap(events) {
  const nights = {};
  function slot(date) {
    if (!nights[date]) {
      nights[date] = {
        date,
        channels: [],
        eventIds: [],
        conflict: false,
        checkins: [],
        checkouts: [],
        prep: false
      };
    }
    return nights[date];
  }

  for (const ev of events) {
    if (ev.statusBucket === 'cancelled') continue;
    for (const d of eachDate(ev.start, ev.end)) {
      const n = slot(d);
      if (!n.channels.includes(ev.channel)) n.channels.push(ev.channel);
      if (!n.eventIds.includes(ev.id)) n.eventIds.push(ev.id);
      if (ev.channel === 'prep') n.prep = true;
    }
    slot(ev.start).checkins.push(ev.id);
    const checkoutSlot = slot(ev.end);
    checkoutSlot.checkouts.push(ev.id);
  }

  for (const n of Object.values(nights)) {
    const claiming = n.channels.filter((c) => c !== 'prep');
    const unique = new Set(claiming);
    const occupancyClaim = claiming.some((c) => channelMeta(c).occupancy);
    n.conflict = unique.size > 1 || (n.prep && occupancyClaim);
  }
  return nights;
}

function countsTowardOccupancy(ev) {
  // Booked occupancy = guest holds + confirmed direct stays + OTA/iCal blocks.
  // Owner stays, manual blocks, and prep close inventory but are not "booked".
  return !!ev?.occupancy && ev.statusBucket !== 'cancelled';
}

function occupancyForRange(events, start, end) {
  const days = eachDate(start, end);
  let booked = 0;
  for (const d of days) {
    if (events.some((ev) => countsTowardOccupancy(ev) && ev.start <= d && d < ev.end)) {
      booked += 1;
    }
  }
  const total = days.length;
  return { start, end, booked, total, pct: total ? Math.round((booked / total) * 100) : 0 };
}

function conflictsFromNights(nights) {
  return Object.values(nights)
    .filter((n) => n.conflict)
    .map((n) => ({ date: n.date, channels: n.channels.slice() }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function publicEvent(ev) {
  return {
    id: ev.id,
    entryId: ev.entryId || null,
    reservationId: ev.reservationId || null,
    channel: ev.channel,
    kind: ev.kind,
    label: ev.label,
    start: ev.start,
    end: ev.end,
    nights: ev.nights,
    summary: ev.summary,
    guestName: ev.guestName || null,
    guestCount: ev.guestCount,
    guestEmail: ev.guestEmail || null,
    guestPhone: ev.guestPhone || null,
    notes: ev.notes || null,
    status: ev.status || null,
    statusBucket: ev.statusBucket,
    origin: ev.origin,
    sourceLabel: ev.sourceLabel || ev.label,
    occupancy: !!ev.occupancy,
    blocksGuests: !!ev.blocksGuests,
    canDelete: !!ev.canDelete,
    checkinTime: ev.channel === 'prep' ? null : DEFAULT_PROPERTY.checkinTime,
    checkoutTime: ev.channel === 'prep' ? null : DEFAULT_PROPERTY.checkoutTime
  };
}

function settingsFromRow(row) {
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    prepBufferEnabled: row.prep_buffer_enabled === true,
    showGuestNames: row.show_guest_names !== false,
    showGuestContact: row.show_guest_contact === true
  };
}

async function loadCalendarInputs() {
  const { getActiveReservations, listOwnerCalendarEntries, getCalendarSettings } = dbApi();
  let ota = { dates: new Set(), sources: [], events: [] };
  let otaConfigError = null;
  try {
    ota = await getOtaBlockedDates();
  } catch (error) {
    otaConfigError = error;
    ota = {
      dates: new Set(),
      sources: [{ name: 'ota', ok: false, error: error.message, missingEnv: error.missingEnv, code: error.code }],
      events: []
    };
  }

  const [reservations, entries, settingsRow] = await Promise.all([
    getActiveReservations(true),
    listOwnerCalendarEntries(),
    getCalendarSettings()
  ]);

  return {
    ota,
    otaConfigError,
    reservations,
    entries,
    settings: settingsFromRow(settingsRow)
  };
}

function snapshotFromInputs(inputs, options = {}) {
  const { year, month, focusDate, view } = options;
  const parts = currentMonthParts();
  const y = Number(year) || parts.year;
  const m = Number(month) || parts.month;
  const viewed = monthBounds(y, m);
  const events = assembleEvents({
    otaEvents: inputs.ota.events || [],
    reservations: inputs.reservations || [],
    entries: inputs.entries || [],
    settings: inputs.settings || DEFAULT_SETTINGS
  });
  const nights = buildNightMap(events);
  const blockedDates = new Set();
  for (const ev of events) {
    if (ev.blocksGuests && ev.statusBucket !== 'cancelled') {
      eachDate(ev.start, ev.end).forEach((d) => blockedDates.add(d));
    }
  }

  const next30end = addDays(parts.today, 30);
  const next90end = addDays(parts.today, 90);
  const currentMonth = monthBounds(parts.year, parts.month);
  const occupancy = {
    viewedMonth: { label: `${y}-${pad2(m)}`, ...occupancyForRange(events, viewed.start, viewed.end) },
    thisMonth: occupancyForRange(events, currentMonth.start, currentMonth.end),
    next30: occupancyForRange(events, parts.today, next30end),
    next90: occupancyForRange(events, parts.today, next90end)
  };

  const upcoming = events
    .filter((ev) => ev.statusBucket !== 'cancelled' && ev.end > parts.today)
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))
    .slice(0, 40)
    .map(publicEvent);

  const focus = validIsoDate(focusDate) ? focusDate : parts.today;
  const week = weekBounds(focus);
  const rangeStart = view === 'week' ? week.start : viewed.start;
  const rangeEnd = view === 'week' ? week.end : viewed.end;
  const windowStart = addDays(rangeStart, -7);
  const windowEnd = addDays(rangeEnd, 7);
  const clippedNights = {};
  for (const [date, night] of Object.entries(nights)) {
    if (date >= windowStart && date <= windowEnd) clippedNights[date] = night;
  }
  const visibleEvents = events.filter((ev) => ev.end > windowStart && ev.start < windowEnd);

  return {
    property: DEFAULT_PROPERTY,
    outboundPushEnabled: false,
    settings: inputs.settings || DEFAULT_SETTINGS,
    view: view === 'week' ? 'week' : 'month',
    range: { year: y, month: m, start: viewed.start, end: viewed.end, weekStart: week.start, weekEnd: week.end, today: parts.today },
    occupancy,
    sync: {
      checkedAt: new Date().toISOString(),
      sources: inputs.ota.sources || [],
      configError: inputs.otaConfigError ? {
        code: inputs.otaConfigError.code || 'ota_error',
        message: inputs.otaConfigError.message
      } : null
    },
    nights: clippedNights,
    conflicts: conflictsFromNights(nights).filter((row) => row.date >= rangeStart && row.date < rangeEnd),
    events: visibleEvents.map(publicEvent),
    upcoming,
    blockedDates: [...blockedDates].sort(),
    channels: Object.values(CHANNEL_META)
  };
}

async function buildOwnerCalendarView(options = {}) {
  const inputs = await loadCalendarInputs();
  return snapshotFromInputs(inputs, options);
}

async function getGuestBlockedDates() {
  const { getActiveReservations, listOwnerCalendarEntries, getCalendarSettings } = dbApi();
  const ota = await getOtaBlockedDates();
  const [reservations, entries, settingsRow] = await Promise.all([
    getActiveReservations(),
    listOwnerCalendarEntries(),
    getCalendarSettings()
  ]);
  const events = assembleEvents({
    otaEvents: ota.events || [],
    reservations,
    entries,
    settings: settingsFromRow(settingsRow)
  });
  const dates = new Set();
  for (const ev of events) {
    if (ev.blocksGuests && ev.statusBucket !== 'cancelled') {
      eachDate(ev.start, ev.end).forEach((d) => dates.add(d));
    }
  }
  const sources = [...(ota.sources || [])];
  sources.push({ name: 'direct', ok: true, count: reservations.length, origin: 'db', channel: 'direct' });
  sources.push({ name: 'owner_blocks', ok: true, count: entries.length, origin: 'owner', channel: 'manual_block' });
  return { dates, sources, events };
}

async function listExportBlocks() {
  const { getActiveReservations, listOwnerCalendarEntries, getCalendarSettings } = dbApi();
  const [reservations, entries, settingsRow] = await Promise.all([
    getActiveReservations(),
    listOwnerCalendarEntries(),
    getCalendarSettings()
  ]);
  const settings = settingsFromRow(settingsRow);
  const events = assembleEvents({
    otaEvents: [],
    reservations,
    entries,
    settings
  });
  return events.filter((ev) => ev.blocksGuests && ev.statusBucket !== 'cancelled');
}

module.exports = {
  DEFAULT_PROPERTY,
  CHANNEL_META,
  DEFAULT_SETTINGS,
  HOLD_STATUSES,
  CONFIRMED_STATUSES,
  CLOSED_STATUSES,
  addDays,
  todayInPropertyTz,
  monthBounds,
  weekBounds,
  validIsoDate,
  reservationStatusBucket,
  assembleEvents,
  buildNightMap,
  occupancyForRange,
  countsTowardOccupancy,
  conflictsFromNights,
  snapshotFromInputs,
  buildOwnerCalendarView,
  getGuestBlockedDates,
  listExportBlocks,
  settingsFromRow,
  parseIcalEvents
};
