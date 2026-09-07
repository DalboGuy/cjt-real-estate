'use strict';

const CONTEXT_KEYS = Object.freeze([
  'property',
  'period',
  'range',
  'from',
  'to',
  'channel',
  'source',
  'status',
  'stripe',
  'q',
  'booking',
  'message',
  'unread',
  'view',
  'date',
  'focus',
  'section',
  'tab',
  'season',
  'assignee',
  'due',
  'id'
]);

const EMPTY_VALUES = new Set(['', 'all', 'false', 'undefined', 'null']);

function readContext(search = '') {
  const raw = String(search || '');
  const params = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
  const context = {};
  CONTEXT_KEYS.forEach((key) => {
    if (!params.has(key)) return;
    const value = String(params.get(key) || '').trim();
    if (!value || EMPTY_VALUES.has(value.toLowerCase())) return;
    context[key] = value;
  });
  if (context.range && !context.period) context.period = context.range;
  if (context.period && !context.range) context.range = context.period;
  if (context.source && !context.channel) context.channel = context.source;
  return context;
}

function writeContext(search, patch = {}, options = {}) {
  const current = readContext(search);
  const next = { ...current };
  Object.entries(patch).forEach(([key, value]) => {
    if (value == null || value === false) {
      delete next[key];
      return;
    }
    const text = String(value).trim();
    if (!text || EMPTY_VALUES.has(text.toLowerCase())) delete next[key];
    else next[key] = text;
  });
  if (options.clear) {
    CONTEXT_KEYS.forEach((key) => {
      if (key === 'property' && !options.clearProperty) return;
      delete next[key];
    });
    Object.assign(next, options.keep || {});
  }
  const params = new URLSearchParams();
  CONTEXT_KEYS.forEach((key) => {
    if (next[key]) params.set(key, next[key]);
  });
  const query = params.toString();
  return { context: next, search: query ? `?${query}` : '' };
}

const STATUS_DISPLAY = Object.freeze({
  pending: 'Request received',
  new: 'Request received',
  inquiry_hold: 'Request received',
  hold_verified: 'Owner approved',
  contract_sent: 'Contract sent',
  contract_signed: 'Contract completed',
  confirmed: 'Confirmed',
  completed: 'Stay completed',
  action: 'Need action',
  active: 'Active',
  closed: 'Closed'
});

const PERIOD_DISPLAY = Object.freeze({
  month: 'This month',
  ytd: 'YTD',
  year: 'This year',
  last12: 'Last 12 months',
  all: 'All'
});

function displayContextValue(key, value) {
  const text = String(value || '');
  if (key === 'status' && STATUS_DISPLAY[text]) return STATUS_DISPLAY[text];
  if ((key === 'period' || key === 'range') && PERIOD_DISPLAY[text]) return PERIOD_DISPLAY[text];
  if (key === 'unread' && (text === '1' || text === 'true')) return 'Unread only';
  return text;
}

function contextChips(context = {}, labels = {}) {
  return Object.entries(context)
    .filter(([key]) => key !== 'property')
    .map(([key, value]) => ({
      key,
      value,
      label: labels[key] || key,
      display: `${labels[key] || key}: ${displayContextValue(key, value)}`
    }));
}

const PERIOD_ALIASES = Object.freeze({
  month: ['month'],
  ytd: ['ytd', 'year'],
  year: ['year', 'ytd'],
  last12: ['last12', 'year', 'all'],
  '2025': ['2025', 'year', 'all'],
  all: ['all', 'last12'],
  custom: ['custom']
});

function mapPeriodToAvailable(requested, available = []) {
  const period = String(requested || '').toLowerCase();
  if (!period) return null;
  const keys = Array.isArray(available) ? available.map((key) => String(key).toLowerCase()) : [];
  const candidates = PERIOD_ALIASES[period] || [period];
  return candidates.find((key) => keys.includes(key)) || null;
}

function cannotApplyMessage(selection, destinationLabel) {
  const what = String(selection || 'that selection').trim() || 'that selection';
  const where = String(destinationLabel || 'this page').trim() || 'this page';
  return `${where} could not apply ${what}. The destination is open; clear filters or choose another record.`;
}

module.exports = {
  CONTEXT_KEYS,
  PERIOD_ALIASES,
  STATUS_DISPLAY,
  PERIOD_DISPLAY,
  readContext,
  writeContext,
  displayContextValue,
  contextChips,
  mapPeriodToAvailable,
  cannotApplyMessage
};
