const crypto = require('crypto');
const { CHANNELS, normalizeChannel } = require('./pricing-engine');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = new Map([
  ['sun', 0], ['sunday', 0], ['mon', 1], ['monday', 1], ['tue', 2], ['tues', 2], ['tuesday', 2],
  ['wed', 3], ['wednesday', 3], ['thu', 4], ['thur', 4], ['thurs', 4], ['thursday', 4],
  ['fri', 5], ['friday', 5], ['sat', 6], ['saturday', 6]
]);

function splitCsvLine(line) {
  const cells = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { cells.push(value); value = ''; }
    else value += char;
  }
  if (quoted) throw new Error('Unclosed quoted value.');
  cells.push(value);
  return cells.map((cell) => cell.trim());
}

function parseCsv(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error('CSV needs a header and at least one data row.');
  if (lines.length > 1001) throw new Error('CSV imports are limited to 1,000 rows.');
  const headers = splitCsvLine(lines[0]).map((header) => header.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  if (new Set(headers).size !== headers.length) throw new Error('CSV contains duplicate column names.');
  return lines.slice(1).map((line, index) => {
    const cells = splitCsvLine(line);
    if (cells.length !== headers.length) throw new Error(`Row ${index + 2} has ${cells.length} values; expected ${headers.length}.`);
    return { rowNumber: index + 2, values: Object.fromEntries(headers.map((header, cell) => [header, cells[cell]])) };
  });
}

function number(value, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) return NaN;
  return parsed;
}

function boolean(value) {
  if (value == null || value === '') return true;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
  return null;
}

function weekdays(value) {
  if (!String(value || '').trim()) return [];
  const days = [];
  for (const item of String(value).split(/[|; ]+/).filter(Boolean)) {
    const normalized = item.toLowerCase();
    const day = /^\d$/.test(normalized) ? Number(normalized) : WEEKDAYS.get(normalized);
    if (!Number.isInteger(day) || day < 0 || day > 6) return null;
    if (!days.includes(day)) days.push(day);
  }
  return days.sort();
}

function validateRow(entry) {
  const row = entry.values;
  const errors = [];
  const recordType = String(row.record_type || row.type || '').trim().toLowerCase();
  const name = String(row.name || '').trim().slice(0, 120);
  const requestedChannel = String(row.channel || 'all').trim().toLowerCase();
  const channel = normalizeChannel(requestedChannel);
  const start = String(row.start_date || row.start || '').trim() || null;
  const end = String(row.end_date || row.end || '').trim() || null;
  const active = boolean(row.active);
  if (!['discount', 'override'].includes(recordType)) errors.push('record_type must be discount or override');
  if (!name) errors.push('name is required');
  if (!CHANNELS.has(requestedChannel)) errors.push('channel must be all, direct, airbnb, vrbo, booking.com, or houfy');
  if (active == null) errors.push('active must be yes/no or true/false');
  if (start && !DATE_RE.test(start)) errors.push('start_date must be YYYY-MM-DD');
  if (end && !DATE_RE.test(end)) errors.push('end_date must be YYYY-MM-DD');
  if (start && end && end < start) errors.push('end_date must be on or after start_date');

  if (recordType === 'override') {
    const nightlyRate = number(row.nightly_rate ?? row.rate, { min: 0.01, max: 20000 });
    const minNights = number(row.minimum_nights ?? row.min_nights, { min: 1, max: 30, integer: true });
    if (!start || !end) errors.push('overrides require start_date and end_date');
    if (!Number.isFinite(nightlyRate)) errors.push('nightly_rate must be between 0.01 and 20000');
    if (Number.isNaN(minNights)) errors.push('minimum_nights must be a whole number from 1 to 30');
    return { rowNumber: entry.rowNumber, recordType, valid: !errors.length, errors, data: { name, channel, start, end, nightlyRate, minNights, active } };
  }

  const discountType = String(row.discount_type || 'percent').trim().toLowerCase();
  const value = number(row.value ?? row.discount_value, { min: 0.01, max: discountType === 'percent' ? 100 : 20000 });
  const minimumNights = number(row.minimum_nights ?? row.min_nights, { min: 1, max: 90, integer: true }) ?? 1;
  const maximumNights = number(row.maximum_nights ?? row.max_nights, { min: minimumNights, max: 90, integer: true });
  const eligibleWeekdays = weekdays(row.eligible_weekdays ?? row.weekdays);
  if (!['percent', 'fixed'].includes(discountType)) errors.push('discount_type must be percent or fixed');
  if (!Number.isFinite(value)) errors.push(discountType === 'percent' ? 'value must be between 0.01 and 100' : 'value must be between 0.01 and 20000');
  if (!Number.isFinite(minimumNights)) errors.push('minimum_nights must be a whole number from 1 to 90');
  if (Number.isNaN(maximumNights)) errors.push('maximum_nights must be a whole number from minimum_nights to 90');
  if (eligibleWeekdays == null) errors.push('eligible_weekdays contains an invalid day');
  return { rowNumber: entry.rowNumber, recordType, valid: !errors.length, errors, data: { name, channel, start, end, discountType, value, minimumNights, maximumNights, eligibleWeekdays, active } };
}

function rangesOverlap(a, b) {
  return a.start <= b.end && b.start <= a.end;
}

function previewPricingImport(text, fileName = 'pricing.csv') {
  let parsed;
  try { parsed = parseCsv(text); }
  catch (error) { return { ok: false, fileName, hash: null, rows: [], errors: [{ rowNumber: 1, errors: [error.message] }] }; }
  const rows = parsed.map(validateRow);
  const seen = new Map();
  for (const row of rows) {
    if (!row.valid) continue;
    const data = row.data;
    const key = `${row.recordType}|${data.channel}|${data.name.toLowerCase()}|${data.start || ''}|${data.end || ''}`;
    if (seen.has(key)) {
      row.valid = false;
      row.errors.push(`duplicates row ${seen.get(key)}`);
    } else seen.set(key, row.rowNumber);
  }
  const validOverrides = rows.filter((row) => row.valid && row.recordType === 'override');
  for (let i = 0; i < validOverrides.length; i += 1) {
    for (let j = i + 1; j < validOverrides.length; j += 1) {
      const a = validOverrides[i], b = validOverrides[j];
      if (a.data.channel === b.data.channel && rangesOverlap(a.data, b.data)) {
        b.valid = false;
        b.errors.push(`overlaps override on row ${a.rowNumber} for channel ${a.data.channel}`);
      }
    }
  }
  const errors = rows.filter((row) => !row.valid).map(({ rowNumber, errors: rowErrors }) => ({ rowNumber, errors: rowErrors }));
  return {
    ok: errors.length === 0,
    fileName: String(fileName || 'pricing.csv').slice(0, 200),
    hash: crypto.createHash('sha256').update(String(text || '')).digest('hex'),
    rowCount: rows.length,
    validCount: rows.length - errors.length,
    rows,
    errors
  };
}

module.exports = { splitCsvLine, parseCsv, validateRow, previewPricingImport, rangesOverlap };
