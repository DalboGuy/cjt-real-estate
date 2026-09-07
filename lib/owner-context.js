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

function contextChips(context = {}, labels = {}) {
  return Object.entries(context)
    .filter(([key]) => key !== 'property')
    .map(([key, value]) => ({
      key,
      value,
      label: labels[key] || key,
      display: `${labels[key] || key}: ${value}`
    }));
}

function cannotApplyMessage(selection, destinationLabel) {
  const what = String(selection || 'that selection').trim() || 'that selection';
  const where = String(destinationLabel || 'this page').trim() || 'this page';
  return `${where} could not apply ${what}. The destination is open; clear filters or choose another record.`;
}

module.exports = {
  CONTEXT_KEYS,
  readContext,
  writeContext,
  contextChips,
  cannotApplyMessage
};
