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

const CALENDAR_VIEWS = Object.freeze(['month', 'week', 'year', 'day']);

function normalizeView(view) {
  const v = String(view || 'month').toLowerCase();
  return CALENDAR_VIEWS.includes(v) ? v : 'month';
}

function monthBounds(year, month) {
  const start = `${year}-${pad2(month)}-01`;
  const nextY = month === 12 ? year + 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  return { start, end: `${nextY}-${pad2(nextM)}-01` };
}

function yearBounds(year) {
  const y = Number(year);
  return { start: `${y}-01-01`, end: `${y + 1}-01-01` };
}

function daysInMonth(year, month) {
  return Number(addDays(monthBounds(year, month).end, -1).slice(8, 10));
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

function arrivalsDepartures(events, start, end) {
  let arrivals = 0;
  let departures = 0;
  for (const ev of events || []) {
    if (!countsTowardOccupancy(ev)) continue;
    if (ev.start >= start && ev.start < end) arrivals += 1;
    if (ev.end > start && ev.end <= end) departures += 1;
  }
  return { arrivals, departures };
}

function occupancyStats(events, start, end) {
  return {
    ...occupancyForRange(events, start, end),
    ...arrivalsDepartures(events, start, end)
  };
}

function agendaStartKind(ev) {
  if (ev.channel === 'owner_stay') return 'owner_stay_begins';
  if (ev.channel === 'manual_block') return 'maintenance_block';
  if (ev.channel === 'prep') return 'prep';
  return 'check_in';
}

function agendaEndKind(ev) {
  if (ev.channel === 'owner_stay') return 'owner_stay_ends';
  if (ev.channel === 'manual_block') return 'block_ends';
  if (ev.channel === 'prep') return 'prep_ends';
  return 'check_out';
}

function agendaStartLabel(ev) {
  if (ev.channel === 'owner_stay') return 'Owner stay begins';
  if (ev.channel === 'manual_block') return 'Maintenance block';
  if (ev.channel === 'prep') return 'Prep / turnover';
  return 'Check-in';
}

function agendaEndLabel(ev) {
  if (ev.channel === 'owner_stay') return 'Owner stay ends';
  if (ev.channel === 'manual_block') return 'Block ends (available again)';
  if (ev.channel === 'prep') return 'Prep ends';
  return 'Check-out';
}

function operationsAgenda(events, fromYmd, days = 21) {
  const last = addDays(fromYmd, days);
  const items = [];
  for (const ev of events || []) {
    if (ev.statusBucket === 'cancelled') continue;
    if (ev.start >= fromYmd && ev.start <= last) {
      items.push({
        date: ev.start,
        kind: agendaStartKind(ev),
        label: agendaStartLabel(ev),
        eventId: ev.id,
        reservationId: ev.reservationId || null,
        channel: ev.channel,
        sourceLabel: ev.sourceLabel || ev.label,
        guestName: ev.guestName || null
      });
    }
    if (ev.channel !== 'prep' && ev.end > fromYmd && ev.end <= last) {
      items.push({
        date: ev.end,
        kind: agendaEndKind(ev),
        label: agendaEndLabel(ev),
        eventId: ev.id,
        reservationId: ev.reservationId || null,
        channel: ev.channel,
        sourceLabel: ev.sourceLabel || ev.label,
        guestName: ev.guestName || null
      });
    }
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind) || String(a.eventId).localeCompare(String(b.eventId)));
  return items;
}

function isRequiredOtaSource(source) {
  if (!source || source.duplicateOf || source.skipped === 'duplicate_url') return false;
  const channel = String(source.channel || '').toLowerCase();
  const name = String(source.name || source.label || '').toLowerCase();
  return channel === 'airbnb' || channel === 'vrbo' || name === 'airbnb' || name === 'vrbo';
}

function unverifiedRequiredOta(sources = []) {
  return sources.filter((s) => isRequiredOtaSource(s) && s.ok === false);
}

function assertRequiredOtaVerified(ota) {
  const failed = unverifiedRequiredOta(ota?.sources || []);
  if (!failed.length) return;
  const names = failed.map((s) => s.label || s.name || s.channel).join(', ');
  const err = new Error(`Required OTA availability could not be verified (${names}). Direct booking is paused until those calendars can be checked.`);
  err.code = 'OTA_AVAILABILITY_UNVERIFIED';
  err.status = 503;
  err.sources = failed.map((s) => ({
    name: s.name,
    label: s.label || null,
    channel: s.channel || null,
    error: s.error || null
  }));
  throw err;
}

function friendlySourceName(source) {
  const channel = String(source.channel || source.name || '').toLowerCase();
  if (channel === 'airbnb' || source.name === 'airbnb') return 'Airbnb';
  if (channel === 'vrbo' || source.name === 'vrbo') return 'Vrbo';
  if (channel === 'booking.com' || source.name === 'booking.com') return 'Booking.com';
  if (source.label && source.label !== source.name) return source.label;
  return source.label || source.name || 'Calendar';
}

function buildSyncSources(inputs, checkedAt) {
  const reservations = inputs.reservations || [];
  const liveCount = reservations.filter((r) => reservationStatusBucket(r.status) !== 'cancelled').length;
  const sources = [{
    id: 'direct',
    name: 'Direct / CJT',
    channel: 'direct',
    kind: 'database',
    ok: true,
    live: true,
    status: 'live',
    configured: true,
    nights: liveCount,
    count: liveCount,
    checkedAt,
    origin: 'db'
  }];
  for (const s of inputs.ota?.sources || []) {
    const ok = s.ok !== false;
    const rec = {
      id: s.name || s.id || friendlySourceName(s),
      name: friendlySourceName(s),
      channel: s.channel || s.name || null,
      kind: 'ical',
      ok,
      live: false,
      status: s.duplicateOf ? 'duplicate' : (ok ? 'connected' : 'issue'),
      configured: s.configured !== false,
      nights: s.count || 0,
      count: s.count || 0,
      checkedAt,
      origin: s.origin || null,
      duplicateOf: s.duplicateOf || null,
      hostHint: s.hostHint || null
    };
    if (ok) rec.lastSuccessfulAt = checkedAt;
    if (s.error) rec.error = s.error;
    if (s.skipped) rec.skipped = s.skipped;
    if (s.code) rec.code = s.code;
    sources.push(rec);
  }
  return sources;
}

function conflictsFromNights(nights) {
  return Object.values(nights)
    .filter((n) => n.conflict)
    .map((n) => ({ date: n.date, channels: n.channels.slice() }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function publicEvent(ev, settings = DEFAULT_SETTINGS) {
  const showNames = settings.showGuestNames !== false;
  const showContact = settings.showGuestContact === true;
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
    guestName: showNames ? (ev.guestName || null) : null,
    guestCount: ev.guestCount,
    guestEmail: showContact ? (ev.guestEmail || null) : null,
    guestPhone: showContact ? (ev.guestPhone || null) : null,
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
  const view = normalizeView(options.view);
  const parts = currentMonthParts();
  const y = Number(options.year) || parts.year;
  const m = Number(options.month) || parts.month;
  const viewed = monthBounds(y, m);
  const yearRange = yearBounds(y);
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

  const settings = inputs.settings || DEFAULT_SETTINGS;
  const focus = validIsoDate(options.focusDate) ? options.focusDate : parts.today;
  const week = weekBounds(focus);
  const dayStart = focus;
  const dayEnd = addDays(dayStart, 1);
  const next30end = addDays(parts.today, 30);
  const next90end = addDays(parts.today, 90);
  const currentMonth = monthBounds(parts.year, parts.month);
  const months = [];
  for (let mi = 1; mi <= 12; mi += 1) {
    const bounds = monthBounds(y, mi);
    months.push({
      month: mi,
      label: `${y}-${pad2(mi)}`,
      ...occupancyStats(events, bounds.start, bounds.end)
    });
  }
  const occupancy = {
    viewedMonth: { label: `${y}-${pad2(m)}`, ...occupancyStats(events, viewed.start, viewed.end) },
    viewedWeek: occupancyStats(events, week.start, week.end),
    viewedYear: occupancyStats(events, yearRange.start, yearRange.end),
    viewedDay: occupancyStats(events, dayStart, dayEnd),
    thisMonth: occupancyStats(events, currentMonth.start, currentMonth.end),
    next30: occupancyStats(events, parts.today, next30end),
    next90: occupancyStats(events, parts.today, next90end),
    months
  };

  const upcoming = events
    .filter((ev) => ev.statusBucket !== 'cancelled' && ev.end > parts.today)
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))
    .slice(0, 40)
    .map((ev) => publicEvent(ev, settings));
  const agenda = operationsAgenda(events, parts.today, 21).map((item) => ({
    ...item,
    guestName: settings.showGuestNames !== false ? item.guestName : null
  }));

  let rangeStart = viewed.start;
  let rangeEnd = viewed.end;
  if (view === 'week') {
    rangeStart = week.start;
    rangeEnd = week.end;
  } else if (view === 'year') {
    rangeStart = yearRange.start;
    rangeEnd = yearRange.end;
  } else if (view === 'day') {
    rangeStart = dayStart;
    rangeEnd = dayEnd;
  }

  const padDays = view === 'year' ? 0 : 7;
  const windowStart = addDays(rangeStart, -padDays);
  const windowEnd = addDays(rangeEnd, padDays);
  const clippedNights = {};
  for (const [date, night] of Object.entries(nights)) {
    if (date >= windowStart && date <= windowEnd) clippedNights[date] = night;
  }
  const visibleEvents = events.filter((ev) => ev.end > windowStart && ev.start < windowEnd);
  const checkedAt = new Date().toISOString();

  return {
    property: DEFAULT_PROPERTY,
    outboundPushEnabled: false,
    settings,
    view,
    range: {
      year: y,
      month: m,
      start: viewed.start,
      end: viewed.end,
      yearStart: yearRange.start,
      yearEnd: yearRange.end,
      weekStart: week.start,
      weekEnd: week.end,
      day: dayStart,
      today: parts.today
    },
    occupancy,
    sync: {
      checkedAt,
      mode: options.syncMode || 'view',
      sources: buildSyncSources(inputs, checkedAt),
      configError: inputs.otaConfigError ? {
        code: inputs.otaConfigError.code || 'ota_error',
        message: inputs.otaConfigError.message
      } : null
    },
    nights: clippedNights,
    conflicts: conflictsFromNights(nights).filter((row) => row.date >= rangeStart && row.date < rangeEnd),
    events: visibleEvents.map((ev) => publicEvent(ev, settings)),
    upcoming,
    operationsAgenda: agenda,
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
  assertRequiredOtaVerified(ota);
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
  CALENDAR_VIEWS,
  HOLD_STATUSES,
  CONFIRMED_STATUSES,
  CLOSED_STATUSES,
  addDays,
  todayInPropertyTz,
  monthBounds,
  yearBounds,
  daysInMonth,
  weekBounds,
  normalizeView,
  validIsoDate,
  reservationStatusBucket,
  assembleEvents,
  buildNightMap,
  occupancyForRange,
  occupancyStats,
  arrivalsDepartures,
  operationsAgenda,
  isRequiredOtaSource,
  unverifiedRequiredOta,
  assertRequiredOtaVerified,
  buildSyncSources,
  countsTowardOccupancy,
  conflictsFromNights,
  snapshotFromInputs,
  publicEvent,
  buildOwnerCalendarView,
  getGuestBlockedDates,
  listExportBlocks,
  settingsFromRow,
  parseIcalEvents
};
