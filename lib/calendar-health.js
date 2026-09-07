'use strict';

const CHANNELS = ['airbnb', 'vrbo', 'booking.com'];

function calendarHostHint(url) {
  try {
    const host = new URL(String(url || '')).hostname.toLowerCase().replace(/^www\./, '');
    return host || '';
  } catch {
    return '';
  }
}

function classifyCalendarChannel({ name = '', label = '', url = '' } = {}) {
  const hay = `${name} ${label} ${url} ${calendarHostHint(url)}`.toLowerCase();
  if (hay.includes('airbnb')) {
    return { channel: 'airbnb', label: label || 'Airbnb', hostHint: calendarHostHint(url) };
  }
  if (hay.includes('vrbo') || hay.includes('homeaway')) {
    return { channel: 'vrbo', label: label || 'VRBO', hostHint: calendarHostHint(url) };
  }
  if (hay.includes('booking.com') || /(^|[^a-z])booking([^a-z]|$)/.test(hay)) {
    return { channel: 'booking.com', label: label || 'Booking.com', hostHint: calendarHostHint(url) };
  }
  return { channel: '', label: label || name || 'Calendar', hostHint: calendarHostHint(url) };
}

function sourceChannel(source) {
  if (source && source.channel) return String(source.channel).toLowerCase();
  return classifyCalendarChannel(source || {}).channel;
}

function summarizeCalendarHealth(sources = []) {
  const list = Array.isArray(sources) ? sources : [];
  const channels = {};
  for (const channel of CHANNELS) {
    const matches = list.filter((source) => sourceChannel(source) === channel);
    if (!matches.length) continue;
    channels[channel] = {
      configured: true,
      ok: matches.some((source) => source.ok !== false),
      sources: matches.map((source) => source.name || source.label || channel),
    };
  }
  const degraded = Object.entries(channels)
    .filter(([, info]) => !info.ok)
    .map(([channel]) => channel);
  const satisfied = Object.entries(channels)
    .filter(([, info]) => info.ok)
    .map(([channel]) => channel);
  const summary = {
    ok: degraded.length === 0,
    degraded,
    satisfied,
    channels,
  };
  summary.message = calendarHealthCopy(summary);
  return summary;
}

function calendarHealthCopy(health = {}, { fetchFailed = false } = {}) {
  if (fetchFailed) {
    return 'Live calendar feeds could not be refreshed. Open nights stay selectable; only past dates and known blocked nights are disabled. Request to Book still rechecks availability.';
  }
  const degraded = Array.isArray(health.degraded) ? health.degraded : [];
  if (degraded.length) {
    return `Calendar feeds are degraded (${degraded.join(', ')}). Open nights stay selectable; blocked nights stay blocked. Request to Book still rechecks live availability.`;
  }
  return 'Availability synced from connected calendars.';
}

function guestDayDisabled({ past = false, isBlocked = false, checkoutOption = false } = {}) {
  return Boolean(past || (isBlocked && !checkoutOption));
}

module.exports = {
  CHANNELS,
  calendarHostHint,
  classifyCalendarChannel,
  sourceChannel,
  summarizeCalendarHealth,
  calendarHealthCopy,
  guestDayDisabled,
};
