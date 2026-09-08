const {
  SEASONS,
  DEFAULT_PROPERTY,
  SETTINGS_ID,
  WEEKDAY_NAMES,
  defaultCatalog,
  defaultSettings
} = require('./pricing-defaults');
const { CHANNELS, normalizeChannel } = require('./pricing-engine');
const { previewPricingImport } = require('./pricing-import');

const CATALOG_TTL_MS = 15000;

let catalogCache = null;
let catalogCacheAt = 0;

function pricingError(code, message, status = 422, fields) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (fields) error.fields = fields;
  return error;
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function asNumber(value) {
  if (value == null || value === '') return NaN;
  return Number(value);
}

function parseWeekendDays(value) {
  if (value == null) return [];
  let list = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    list = trimmed.replace(/^{|}$/g, '').split(',').map((part) => part.trim()).filter(Boolean);
  }
  if (!Array.isArray(list)) return [];
  const days = [];
  const seen = new Set();
  for (const item of list) {
    if (item === '' || item == null) continue;
    const asName = WEEKDAY_NAMES.findIndex((name) => name.toLowerCase() === String(item).toLowerCase());
    const day = asName >= 0 ? asName : Number(item);
    if (!Number.isInteger(day) || day < 0 || day > 6 || seen.has(day)) continue;
    seen.add(day);
    days.push(day);
  }
  return days.sort((a, b) => a - b);
}

function normalizeRateInput(value, { allowPercent = false } = {}) {
  const amount = asNumber(value);
  if (!Number.isFinite(amount)) return NaN;
  if (allowPercent && amount > 1 && amount <= 100) return amount / 100;
  return amount;
}

function serializeSeason(row) {
  return {
    id: row.id == null ? undefined : Number(row.id),
    name: String(row.name || ''),
    start: String(row.start || row.start_date || ''),
    end: String(row.end || row.end_date || ''),
    weekday: asNumber(row.weekday ?? row.weekday_rate),
    weekend: asNumber(row.weekend ?? row.weekend_rate),
    minNights: Number(row.minNights ?? row.min_nights),
    sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0)
  };
}

function serializeOverride(row) {
  return {
    id: row.id == null ? undefined : Number(row.id),
    name: String(row.name || ''),
    channel: normalizeChannel(row.channel || 'all'),
    start: String(row.start || row.start_date || ''),
    end: String(row.end || row.end_date || ''),
    nightlyRate: asNumber(row.nightlyRate ?? row.nightly_rate),
    minNights: row.minNights == null && row.min_nights == null ? null : Number(row.minNights ?? row.min_nights),
    priority: Number(row.priority || 0),
    active: row.active !== false
  };
}

function serializeDiscount(row) {
  return {
    id: row.id == null ? undefined : Number(row.id),
    name: String(row.name || ''),
    channel: normalizeChannel(row.channel || 'all'),
    start: row.start || row.start_date ? String(row.start || row.start_date) : null,
    end: row.end || row.end_date ? String(row.end || row.end_date) : null,
    discountType: String(row.discountType || row.discount_type || 'percent'),
    value: asNumber(row.value ?? row.discount_value),
    minimumNights: Number(row.minimumNights ?? row.minimum_nights ?? 1),
    maximumNights: row.maximumNights == null && row.maximum_nights == null ? null : Number(row.maximumNights ?? row.maximum_nights),
    eligibleWeekdays: parseWeekendDays(row.eligibleWeekdays ?? row.eligible_weekdays),
    priority: Number(row.priority || 0),
    active: row.active !== false
  };
}

function serializeCostPolicy(row) {
  return {
    channel: normalizeChannel(row.channel),
    monthlyOperatingCost: asNumber(row.monthlyOperatingCost ?? row.monthly_operating_cost ?? 0),
    cleaningCost: asNumber(row.cleaningCost ?? row.cleaning_cost ?? 0),
    channelFeeRate: asNumber(row.channelFeeRate ?? row.channel_fee_rate ?? 0),
    minimumContribution: asNumber(row.minimumContribution ?? row.minimum_contribution ?? 0),
    mode: String(row.mode || 'monitor')
  };
}

function catalogFromRows(settingsRow, seasonRows, source = 'database', extras = {}) {
  const fallback = defaultSettings();
  const settings = settingsRow || {};
  return {
    id: settings.id || SETTINGS_ID,
    property: settings.property || DEFAULT_PROPERTY,
    cleaningFee: asNumber(settings.cleaning_fee ?? settings.cleaningFee ?? fallback.cleaningFee),
    taxRate: asNumber(settings.tax_rate ?? settings.taxRate ?? fallback.taxRate),
    maxGuests: Number(settings.max_guests ?? settings.maxGuests ?? fallback.maxGuests),
    pricingThrough: String(settings.pricing_through ?? settings.pricingThrough ?? fallback.pricingThrough),
    weekendDays: parseWeekendDays(settings.weekend_days ?? settings.weekendDays ?? fallback.weekendDays),
    advancePaymentPct: asNumber(settings.advance_payment_pct ?? settings.advancePaymentPct ?? fallback.advancePaymentPct),
    splitPaymentThresholdDays: Number(settings.split_payment_threshold_days ?? settings.splitPaymentThresholdDays ?? fallback.splitPaymentThresholdDays),
    seasons: (seasonRows || []).map(serializeSeason).sort((a, b) => {
      if (a.start !== b.start) return a.start.localeCompare(b.start);
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    }),
    overrides: (extras.overrideRows || []).map(serializeOverride),
    discounts: (extras.discountRows || []).map(serializeDiscount),
    costPolicies: (extras.costPolicyRows || []).map(serializeCostPolicy),
    source
  };
}

function publicPricingPayload(catalog) {
  return {
    seasons: catalog.seasons,
    cleaningFee: catalog.cleaningFee,
    taxRate: catalog.taxRate,
    pricingThrough: catalog.pricingThrough,
    maxGuests: catalog.maxGuests,
    weekendDays: (catalog.weekendDays || []).map((day) => WEEKDAY_NAMES[day]).filter(Boolean),
    weekendDayNumbers: catalog.weekendDays || [],
    splitPaymentThresholdDays: catalog.splitPaymentThresholdDays,
    advancePaymentPct: catalog.advancePaymentPct,
    overrides: catalog.overrides || [],
    discounts: catalog.discounts || [],
    costPolicies: catalog.costPolicies || [],
    source: catalog.source || 'database'
  };
}

function rememberCatalog(catalog) {
  catalogCache = catalog;
  catalogCacheAt = Date.now();
  return catalog;
}

function invalidatePricingCatalog() {
  catalogCache = null;
  catalogCacheAt = 0;
}

function validateSettingsInput(body = {}, baseline) {
  const fields = {};
  const current = baseline || defaultSettings();
  const cleaningFee = body.cleaningFee == null ? current.cleaningFee : asNumber(body.cleaningFee);
  const taxRate = body.taxRate == null ? current.taxRate : normalizeRateInput(body.taxRate, { allowPercent: true });
  const maxGuests = body.maxGuests == null ? current.maxGuests : Number(body.maxGuests);
  const pricingThrough = body.pricingThrough == null ? current.pricingThrough : String(body.pricingThrough || '').trim();
  const weekendDays = body.weekendDays == null && body.weekendDayNumbers == null
    ? current.weekendDays
    : parseWeekendDays(body.weekendDayNumbers || body.weekendDays);
  const advancePaymentPct = body.advancePaymentPct == null
    ? current.advancePaymentPct
    : normalizeRateInput(body.advancePaymentPct, { allowPercent: true });
  const splitPaymentThresholdDays = body.splitPaymentThresholdDays == null
    ? current.splitPaymentThresholdDays
    : Number(body.splitPaymentThresholdDays);

  if (!Number.isFinite(cleaningFee) || cleaningFee < 0 || cleaningFee > 10000) {
    fields.cleaningFee = 'Cleaning fee must be between $0 and $10,000.';
  }
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) {
    fields.taxRate = 'Tax rate must be between 0% and 100%.';
  }
  if (!Number.isInteger(maxGuests) || maxGuests < 1 || maxGuests > 14) {
    fields.maxGuests = 'Max guests must be a whole number from 1 to 14.';
  }
  if (!validDate(pricingThrough)) {
    fields.pricingThrough = 'Pricing through must be a valid date.';
  }
  if (!Array.isArray(weekendDays) || weekendDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    fields.weekendDays = 'Choose valid weekend days.';
  }
  if (!Number.isFinite(advancePaymentPct) || advancePaymentPct <= 0 || advancePaymentPct > 1) {
    fields.advancePaymentPct = 'Deposit must be greater than 0% and at most 100%.';
  }
  if (!Number.isInteger(splitPaymentThresholdDays) || splitPaymentThresholdDays < 0 || splitPaymentThresholdDays > 365) {
    fields.splitPaymentThresholdDays = 'Split-payment threshold must be 0–365 days.';
  }
  if (Object.keys(fields).length) {
    throw pricingError('validation_error', Object.values(fields)[0], 400, fields);
  }
  return {
    cleaningFee: Math.round(cleaningFee * 100) / 100,
    taxRate,
    maxGuests,
    pricingThrough,
    weekendDays,
    advancePaymentPct,
    splitPaymentThresholdDays
  };
}

function validateSeasonInput(body = {}, { partial = false } = {}) {
  const fields = {};
  const name = body.name == null ? undefined : String(body.name || '').trim().slice(0, 120);
  const start = body.start == null ? undefined : String(body.start || '').trim();
  const end = body.end == null ? undefined : String(body.end || '').trim();
  const weekday = body.weekday == null ? undefined : asNumber(body.weekday);
  const weekend = body.weekend == null ? undefined : asNumber(body.weekend);
  const minNights = body.minNights == null ? undefined : Number(body.minNights);
  const sortOrder = body.sortOrder == null ? undefined : Number(body.sortOrder);

  if (!partial || body.name != null) {
    if (!name) fields.name = 'Season name is required.';
  }
  if (!partial || body.start != null) {
    if (!validDate(start)) fields.start = 'Start date must be a valid date.';
  }
  if (!partial || body.end != null) {
    if (!validDate(end)) fields.end = 'End date must be a valid date.';
  }
  if (validDate(start) && validDate(end) && end < start) {
    fields.end = 'End date must be on or after the start date.';
  }
  if (!partial || body.weekday != null) {
    if (!Number.isFinite(weekday) || weekday <= 0 || weekday > 20000) {
      fields.weekday = 'Weekday rate must be greater than $0.';
    }
  }
  if (!partial || body.weekend != null) {
    if (!Number.isFinite(weekend) || weekend <= 0 || weekend > 20000) {
      fields.weekend = 'Weekend rate must be greater than $0.';
    }
  }
  if (!partial || body.minNights != null) {
    if (!Number.isInteger(minNights) || minNights < 1 || minNights > 30) {
      fields.minNights = 'Minimum stay must be 1–30 nights.';
    }
  }
  if (sortOrder != null && !Number.isInteger(sortOrder)) {
    fields.sortOrder = 'Sort order must be a whole number.';
  }
  if (Object.keys(fields).length) {
    throw pricingError('validation_error', Object.values(fields)[0], 400, fields);
  }
  const resolvedStart = start;
  return {
    name,
    start,
    end,
    weekday: weekday == null ? undefined : Math.round(weekday * 100) / 100,
    weekend: weekend == null ? undefined : Math.round(weekend * 100) / 100,
    minNights,
    sortOrder: Number.isInteger(sortOrder)
      ? sortOrder
      : (validDate(resolvedStart) ? Number(resolvedStart.replace(/-/g, '')) : undefined)
  };
}

function validateChannel(value, { allowAll = true } = {}) {
  const channel = String(value || (allowAll ? 'all' : 'direct')).trim().toLowerCase();
  if (!CHANNELS.has(channel) || (!allowAll && channel === 'all')) {
    throw pricingError('validation_error', `Choose a valid${allowAll ? '' : ' host-site'} channel.`, 400, { channel: 'Choose a valid channel.' });
  }
  return channel;
}

function validateOverrideInput(body = {}) {
  const fields = {};
  const name = String(body.name || '').trim().slice(0, 120);
  const channel = validateChannel(body.channel);
  const start = String(body.start || '').trim();
  const end = String(body.end || '').trim();
  const nightlyRate = asNumber(body.nightlyRate);
  const minNights = body.minNights == null || body.minNights === '' ? null : Number(body.minNights);
  const active = body.active !== false;
  if (!name) fields.name = 'Override name is required.';
  if (!validDate(start)) fields.start = 'Start date must be valid.';
  if (!validDate(end) || (validDate(start) && end < start)) fields.end = 'End date must be on or after start.';
  if (!Number.isFinite(nightlyRate) || nightlyRate <= 0 || nightlyRate > 20000) fields.nightlyRate = 'Nightly rate must be between $0.01 and $20,000.';
  if (minNights != null && (!Number.isInteger(minNights) || minNights < 1 || minNights > 30)) fields.minNights = 'Minimum nights must be 1–30.';
  if (Object.keys(fields).length) throw pricingError('validation_error', Object.values(fields)[0], 400, fields);
  return { name, channel, start, end, nightlyRate: Math.round(nightlyRate * 100) / 100, minNights, active };
}

function validateDiscountInput(body = {}) {
  const fields = {};
  const name = String(body.name || '').trim().slice(0, 120);
  const channel = validateChannel(body.channel);
  const start = body.start ? String(body.start).trim() : null;
  const end = body.end ? String(body.end).trim() : null;
  const discountType = String(body.discountType || 'percent').trim().toLowerCase();
  const value = asNumber(body.value);
  const minimumNights = Number(body.minimumNights || 1);
  const maximumNights = body.maximumNights == null || body.maximumNights === '' ? null : Number(body.maximumNights);
  const eligibleWeekdays = parseWeekendDays(body.eligibleWeekdays || []);
  const active = body.active !== false;
  if (!name) fields.name = 'Discount name is required.';
  if (start && !validDate(start)) fields.start = 'Start date must be valid.';
  if (end && !validDate(end)) fields.end = 'End date must be valid.';
  if (start && end && end < start) fields.end = 'End date must be on or after start.';
  if (!['percent', 'fixed'].includes(discountType)) fields.discountType = 'Choose percent or fixed.';
  if (!Number.isFinite(value) || value <= 0 || (discountType === 'percent' && value > 100) || (discountType === 'fixed' && value > 20000)) fields.value = 'Enter a valid discount value.';
  if (!Number.isInteger(minimumNights) || minimumNights < 1 || minimumNights > 90) fields.minimumNights = 'Minimum nights must be 1–90.';
  if (maximumNights != null && (!Number.isInteger(maximumNights) || maximumNights < minimumNights || maximumNights > 90)) fields.maximumNights = 'Maximum nights must be at least the minimum and no more than 90.';
  if (Object.keys(fields).length) throw pricingError('validation_error', Object.values(fields)[0], 400, fields);
  return { name, channel, start, end, discountType, value, minimumNights, maximumNights, eligibleWeekdays, active };
}

function validateCostPolicyInput(body = {}) {
  const fields = {};
  const channel = validateChannel(body.channel, { allowAll: false });
  const monthlyOperatingCost = asNumber(body.monthlyOperatingCost);
  const cleaningCost = asNumber(body.cleaningCost);
  const channelFeePercent = asNumber(body.channelFeeRate);
  const channelFeeRate = channelFeePercent / 100;
  const minimumContribution = asNumber(body.minimumContribution == null ? 0 : body.minimumContribution);
  const mode = String(body.mode || 'monitor').trim().toLowerCase();
  if (!Number.isFinite(monthlyOperatingCost) || monthlyOperatingCost < 0 || monthlyOperatingCost > 1000000) fields.monthlyOperatingCost = 'Monthly operating cost must be $0–$1,000,000.';
  if (!Number.isFinite(cleaningCost) || cleaningCost < 0 || cleaningCost > 10000) fields.cleaningCost = 'Cleaning cost must be $0–$10,000.';
  if (!Number.isFinite(channelFeePercent) || channelFeePercent < 0 || channelFeePercent >= 95) fields.channelFeeRate = 'Channel fee must be 0%–94.99%.';
  if (!Number.isFinite(minimumContribution) || minimumContribution < 0 || minimumContribution > 100000) fields.minimumContribution = 'Minimum contribution must be $0–$100,000.';
  if (!['off', 'monitor', 'enforce'].includes(mode)) fields.mode = 'Choose off, monitor, or enforce.';
  if (Object.keys(fields).length) throw pricingError('validation_error', Object.values(fields)[0], 400, fields);
  return { channel, monthlyOperatingCost, cleaningCost, channelFeeRate, minimumContribution, mode };
}

async function seedPricingIfEmpty(sql) {
  const settings = defaultSettings();
  await sql`
    INSERT INTO pricing_settings (
      id, property, cleaning_fee, tax_rate, max_guests, pricing_through,
      weekend_days, advance_payment_pct, split_payment_threshold_days
    ) VALUES (
      ${SETTINGS_ID},
      ${settings.property},
      ${settings.cleaningFee},
      ${settings.taxRate},
      ${settings.maxGuests},
      ${settings.pricingThrough}::date,
      ${settings.weekendDays}::int[],
      ${settings.advancePaymentPct},
      ${settings.splitPaymentThresholdDays}
    )
    ON CONFLICT (id) DO NOTHING
  `;

  const existing = await sql`SELECT id FROM pricing_seasons LIMIT 1`;
  if (existing.length) return { seededSettings: true, seededSeasons: false };

  for (const season of SEASONS) {
    await sql`
      INSERT INTO pricing_seasons (
        property, name, start_date, end_date, weekday_rate, weekend_rate, min_nights, sort_order
      ) VALUES (
        ${DEFAULT_PROPERTY},
        ${season.name},
        ${season.start}::date,
        ${season.end}::date,
        ${season.weekday},
        ${season.weekend},
        ${season.minNights},
        ${season.sortOrder}
      )
      ON CONFLICT (property, start_date, end_date) DO NOTHING
    `;
  }
  return { seededSettings: true, seededSeasons: true };
}

async function readCatalogFromDb(sql) {
  const [settingsRows, seasonRows, overrideRows, discountRows, costPolicyRows] = await Promise.all([
    sql`
      SELECT id, property, cleaning_fee, tax_rate, max_guests, pricing_through::text,
             weekend_days, advance_payment_pct, split_payment_threshold_days, updated_at
      FROM pricing_settings
      WHERE id = ${SETTINGS_ID}
      LIMIT 1
    `,
    sql`
      SELECT id, name, start_date::text AS start, end_date::text AS end,
             weekday_rate, weekend_rate, min_nights, sort_order
      FROM pricing_seasons
      WHERE property = ${DEFAULT_PROPERTY}
      ORDER BY start_date ASC, sort_order ASC, id ASC
    `,
    sql`
      SELECT id, name, channel, start_date::text AS start, end_date::text AS end,
             nightly_rate, min_nights, priority, active
      FROM pricing_overrides
      WHERE property = ${DEFAULT_PROPERTY}
      ORDER BY start_date ASC, priority DESC, id ASC
    `,
    sql`
      SELECT id, name, channel, start_date::text AS start, end_date::text AS end,
             discount_type, discount_value, minimum_nights, maximum_nights,
             eligible_weekdays, priority, active
      FROM pricing_discounts
      WHERE property = ${DEFAULT_PROPERTY}
      ORDER BY priority DESC, id ASC
    `,
    sql`
      SELECT channel, monthly_operating_cost, cleaning_cost, channel_fee_rate,
             minimum_contribution, mode
      FROM pricing_cost_policies
      WHERE property = ${DEFAULT_PROPERTY}
      ORDER BY channel ASC
    `
  ]);
  if (!settingsRows.length && !seasonRows.length) return null;
  return catalogFromRows(settingsRows[0] || null, seasonRows, 'database', { overrideRows, discountRows, costPolicyRows });
}

async function loadPricingCatalog({ allowFallback = true, fresh = false } = {}) {
  if (!fresh && catalogCache && (Date.now() - catalogCacheAt) < CATALOG_TTL_MS) {
    return catalogCache;
  }
  const { ensureSchema, db } = require('./db');
  try {
    await ensureSchema();
    const catalog = await readCatalogFromDb(db());
    if (catalog && catalog.seasons.length) return rememberCatalog(catalog);
    if (catalog) return rememberCatalog(catalog);
  } catch (error) {
    if (!allowFallback) throw error;
    if (catalogCache) return catalogCache;
  }
  if (!allowFallback) throw pricingError('pricing_unavailable', 'Published pricing could not be loaded.', 503);
  return rememberCatalog(defaultCatalog());
}

async function findOverlappingSeason(sql, start, end, excludeId) {
  if (excludeId) {
    return sql`
      SELECT id, name, start_date::text AS start, end_date::text AS end
      FROM pricing_seasons
      WHERE property = ${DEFAULT_PROPERTY}
        AND id <> ${excludeId}
        AND daterange(start_date, end_date, '[]') && daterange(${start}::date, ${end}::date, '[]')
      ORDER BY start_date ASC
      LIMIT 1
    `;
  }
  return sql`
    SELECT id, name, start_date::text AS start, end_date::text AS end
    FROM pricing_seasons
    WHERE property = ${DEFAULT_PROPERTY}
      AND daterange(start_date, end_date, '[]') && daterange(${start}::date, ${end}::date, '[]')
    ORDER BY start_date ASC
    LIMIT 1
  `;
}

function overlapError(row) {
  return pricingError(
    'season_overlap',
    `This season overlaps “${row.name}” (${row.start} – ${row.end}). Seasons cannot share dates.`,
    409,
    { start: 'Overlaps another season.', end: 'Overlaps another season.' }
  );
}

function constraintError(error) {
  const detail = String(error?.message || '').toLowerCase();
  if (detail.includes('pricing_seasons_no_overlap') || detail.includes('exclusion')) {
    return pricingError('season_overlap', 'This season overlaps another published season. Seasons cannot share dates.', 409);
  }
  if (detail.includes('pricing_seasons_property_dates') || detail.includes('duplicate key')) {
    return pricingError('season_duplicate', 'A season with these exact start and end dates already exists.', 409);
  }
  return error;
}

async function updatePricingSettings(body) {
  const { ensureSchema, db } = require('./db');
  await ensureSchema();
  const current = await loadPricingCatalog({ allowFallback: true, fresh: true });
  const settings = validateSettingsInput(body, current);
  const sql = db();
  const rows = await sql`
    INSERT INTO pricing_settings (
      id, property, cleaning_fee, tax_rate, max_guests, pricing_through,
      weekend_days, advance_payment_pct, split_payment_threshold_days, updated_at
    ) VALUES (
      ${SETTINGS_ID},
      ${DEFAULT_PROPERTY},
      ${settings.cleaningFee},
      ${settings.taxRate},
      ${settings.maxGuests},
      ${settings.pricingThrough}::date,
      ${settings.weekendDays}::int[],
      ${settings.advancePaymentPct},
      ${settings.splitPaymentThresholdDays},
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      cleaning_fee = EXCLUDED.cleaning_fee,
      tax_rate = EXCLUDED.tax_rate,
      max_guests = EXCLUDED.max_guests,
      pricing_through = EXCLUDED.pricing_through,
      weekend_days = EXCLUDED.weekend_days,
      advance_payment_pct = EXCLUDED.advance_payment_pct,
      split_payment_threshold_days = EXCLUDED.split_payment_threshold_days,
      updated_at = now()
    RETURNING id
  `;
  if (!rows.length) throw pricingError('pricing_unavailable', 'Pricing settings could not be saved.', 500);
  invalidatePricingCatalog();
  return loadPricingCatalog({ allowFallback: false, fresh: true });
}

async function createPricingSeason(body) {
  const { ensureSchema, db } = require('./db');
  await ensureSchema();
  const season = validateSeasonInput(body);
  const sql = db();
  const overlap = await findOverlappingSeason(sql, season.start, season.end);
  if (overlap[0]) throw overlapError(overlap[0]);
  try {
    const rows = await sql`
      INSERT INTO pricing_seasons (
        property, name, start_date, end_date, weekday_rate, weekend_rate, min_nights, sort_order
      ) VALUES (
        ${DEFAULT_PROPERTY},
        ${season.name},
        ${season.start}::date,
        ${season.end}::date,
        ${season.weekday},
        ${season.weekend},
        ${season.minNights},
        ${season.sortOrder}
      )
      RETURNING id
    `;
    if (!rows.length) throw pricingError('pricing_unavailable', 'The season could not be created.', 500);
    invalidatePricingCatalog();
    const catalog = await loadPricingCatalog({ allowFallback: false, fresh: true });
    return { catalog, id: Number(rows[0].id) };
  } catch (error) {
    throw constraintError(error);
  }
}

async function updatePricingSeason(id, body) {
  const seasonId = Number(id);
  if (!Number.isInteger(seasonId) || seasonId < 1) {
    throw pricingError('validation_error', 'A valid season is required.', 400);
  }
  const { ensureSchema, db } = require('./db');
  await ensureSchema();
  const sql = db();
  const existing = await sql`
    SELECT id, name, start_date::text AS start, end_date::text AS end,
           weekday_rate, weekend_rate, min_nights, sort_order
    FROM pricing_seasons
    WHERE id = ${seasonId} AND property = ${DEFAULT_PROPERTY}
    LIMIT 1
  `;
  if (!existing.length) throw pricingError('season_not_found', 'That season was not found.', 404);
  const current = serializeSeason(existing[0]);
  const patch = validateSeasonInput(body, { partial: true });
  const next = {
    name: patch.name ?? current.name,
    start: patch.start ?? current.start,
    end: patch.end ?? current.end,
    weekday: patch.weekday ?? current.weekday,
    weekend: patch.weekend ?? current.weekend,
    minNights: patch.minNights ?? current.minNights,
    sortOrder: patch.sortOrder ?? current.sortOrder
  };
  const checked = validateSeasonInput(next);
  const overlap = await findOverlappingSeason(sql, checked.start, checked.end, seasonId);
  if (overlap[0]) throw overlapError(overlap[0]);
  try {
    const rows = await sql`
      UPDATE pricing_seasons
      SET name = ${checked.name},
          start_date = ${checked.start}::date,
          end_date = ${checked.end}::date,
          weekday_rate = ${checked.weekday},
          weekend_rate = ${checked.weekend},
          min_nights = ${checked.minNights},
          sort_order = ${checked.sortOrder},
          updated_at = now()
      WHERE id = ${seasonId} AND property = ${DEFAULT_PROPERTY}
      RETURNING id
    `;
    if (!rows.length) throw pricingError('season_not_found', 'That season was not found.', 404);
    invalidatePricingCatalog();
    return loadPricingCatalog({ allowFallback: false, fresh: true });
  } catch (error) {
    throw constraintError(error);
  }
}

async function deletePricingSeason(id) {
  const seasonId = Number(id);
  if (!Number.isInteger(seasonId) || seasonId < 1) {
    throw pricingError('validation_error', 'A valid season is required.', 400);
  }
  const { ensureSchema, db } = require('./db');
  await ensureSchema();
  const sql = db();
  const rows = await sql`
    DELETE FROM pricing_seasons
    WHERE id = ${seasonId} AND property = ${DEFAULT_PROPERTY}
    RETURNING id, name
  `;
  if (!rows.length) throw pricingError('season_not_found', 'That season was not found.', 404);
  invalidatePricingCatalog();
  const catalog = await loadPricingCatalog({ allowFallback: false, fresh: true });
  return { catalog, deleted: { id: Number(rows[0].id), name: rows[0].name } };
}

async function findOverlappingOverride(sql, rule, excludeId) {
  if (excludeId) {
    return sql`
      SELECT id, name, start_date::text AS start, end_date::text AS end
      FROM pricing_overrides
      WHERE property = ${DEFAULT_PROPERTY} AND channel = ${rule.channel} AND active
        AND id <> ${excludeId}
        AND daterange(start_date, end_date, '[]') && daterange(${rule.start}::date, ${rule.end}::date, '[]')
      LIMIT 1
    `;
  }
  return sql`
    SELECT id, name, start_date::text AS start, end_date::text AS end
    FROM pricing_overrides
    WHERE property = ${DEFAULT_PROPERTY} AND channel = ${rule.channel} AND active
      AND daterange(start_date, end_date, '[]') && daterange(${rule.start}::date, ${rule.end}::date, '[]')
    LIMIT 1
  `;
}

async function savePricingOverride(body) {
  const rule = validateOverrideInput(body);
  const id = body.id == null || body.id === '' ? null : Number(body.id);
  if (id != null && (!Number.isInteger(id) || id < 1)) throw pricingError('validation_error', 'A valid override is required.', 400);
  const { ensureSchema, db } = require('./db');
  await ensureSchema();
  const sql = db();
  const overlap = await findOverlappingOverride(sql, rule, id);
  if (overlap[0]) throw pricingError('override_overlap', `This override overlaps “${overlap[0].name}” for ${rule.channel}.`, 409);
  const rows = id == null
    ? await sql`
      INSERT INTO pricing_overrides (property, name, channel, start_date, end_date, nightly_rate, min_nights, active)
      VALUES (${DEFAULT_PROPERTY}, ${rule.name}, ${rule.channel}, ${rule.start}::date, ${rule.end}::date, ${rule.nightlyRate}, ${rule.minNights}, ${rule.active})
      RETURNING id
    `
    : await sql`
      UPDATE pricing_overrides
      SET name=${rule.name}, channel=${rule.channel}, start_date=${rule.start}::date, end_date=${rule.end}::date,
          nightly_rate=${rule.nightlyRate}, min_nights=${rule.minNights}, active=${rule.active}, updated_at=now()
      WHERE id=${id} AND property=${DEFAULT_PROPERTY}
      RETURNING id
    `;
  if (!rows.length) throw pricingError('override_not_found', 'That pricing override was not found.', 404);
  invalidatePricingCatalog();
  return { catalog: await loadPricingCatalog({ allowFallback: false, fresh: true }), id: Number(rows[0].id) };
}

async function deletePricingOverride(id) {
  const ruleId = Number(id);
  if (!Number.isInteger(ruleId) || ruleId < 1) throw pricingError('validation_error', 'A valid override is required.', 400);
  const { ensureSchema, db } = require('./db');
  await ensureSchema();
  const rows = await db()`DELETE FROM pricing_overrides WHERE id=${ruleId} AND property=${DEFAULT_PROPERTY} RETURNING id, name`;
  if (!rows.length) throw pricingError('override_not_found', 'That pricing override was not found.', 404);
  invalidatePricingCatalog();
  return { catalog: await loadPricingCatalog({ allowFallback: false, fresh: true }), deleted: serializeOverride(rows[0]) };
}

async function savePricingDiscount(body) {
  const rule = validateDiscountInput(body);
  const id = body.id == null || body.id === '' ? null : Number(body.id);
  if (id != null && (!Number.isInteger(id) || id < 1)) throw pricingError('validation_error', 'A valid discount is required.', 400);
  const { ensureSchema, db } = require('./db');
  await ensureSchema();
  const sql = db();
  const rows = id == null
    ? await sql`
      INSERT INTO pricing_discounts (property, name, channel, start_date, end_date, discount_type, discount_value, minimum_nights, maximum_nights, eligible_weekdays, active)
      VALUES (${DEFAULT_PROPERTY}, ${rule.name}, ${rule.channel}, ${rule.start}::date, ${rule.end}::date, ${rule.discountType}, ${rule.value}, ${rule.minimumNights}, ${rule.maximumNights}, ${rule.eligibleWeekdays}::int[], ${rule.active})
      RETURNING id
    `
    : await sql`
      UPDATE pricing_discounts
      SET name=${rule.name}, channel=${rule.channel}, start_date=${rule.start}::date, end_date=${rule.end}::date,
          discount_type=${rule.discountType}, discount_value=${rule.value}, minimum_nights=${rule.minimumNights}, maximum_nights=${rule.maximumNights},
          eligible_weekdays=${rule.eligibleWeekdays}::int[], active=${rule.active}, updated_at=now()
      WHERE id=${id} AND property=${DEFAULT_PROPERTY}
      RETURNING id
    `;
  if (!rows.length) throw pricingError('discount_not_found', 'That discount was not found.', 404);
  invalidatePricingCatalog();
  return { catalog: await loadPricingCatalog({ allowFallback: false, fresh: true }), id: Number(rows[0].id) };
}

async function deletePricingDiscount(id) {
  const ruleId = Number(id);
  if (!Number.isInteger(ruleId) || ruleId < 1) throw pricingError('validation_error', 'A valid discount is required.', 400);
  const { ensureSchema, db } = require('./db');
  await ensureSchema();
  const rows = await db()`DELETE FROM pricing_discounts WHERE id=${ruleId} AND property=${DEFAULT_PROPERTY} RETURNING id, name`;
  if (!rows.length) throw pricingError('discount_not_found', 'That discount was not found.', 404);
  invalidatePricingCatalog();
  return { catalog: await loadPricingCatalog({ allowFallback: false, fresh: true }), deleted: serializeDiscount(rows[0]) };
}

async function savePricingCostPolicy(body) {
  const policy = validateCostPolicyInput(body);
  const { ensureSchema, db } = require('./db');
  await ensureSchema();
  const rows = await db()`
    INSERT INTO pricing_cost_policies (property, channel, monthly_operating_cost, cleaning_cost, channel_fee_rate, minimum_contribution, mode, updated_at)
    VALUES (${DEFAULT_PROPERTY}, ${policy.channel}, ${policy.monthlyOperatingCost}, ${policy.cleaningCost}, ${policy.channelFeeRate}, ${policy.minimumContribution}, ${policy.mode}, now())
    ON CONFLICT (property, channel) DO UPDATE SET
      monthly_operating_cost=EXCLUDED.monthly_operating_cost, cleaning_cost=EXCLUDED.cleaning_cost,
      channel_fee_rate=EXCLUDED.channel_fee_rate, minimum_contribution=EXCLUDED.minimum_contribution,
      mode=EXCLUDED.mode, updated_at=now()
    RETURNING channel
  `;
  if (!rows.length) throw pricingError('pricing_unavailable', 'The cost policy could not be saved.', 500);
  invalidatePricingCatalog();
  return loadPricingCatalog({ allowFallback: false, fresh: true });
}

async function commitPricingImport(csv, fileName) {
  const preview = previewPricingImport(csv, fileName);
  if (!preview.ok) throw pricingError('import_invalid', 'Fix the CSV errors before importing.', 400, { import: preview.errors });
  const { ensureSchema, db } = require('./db');
  await ensureSchema();
  const sql = db();
  const existing = await sql`SELECT id FROM pricing_imports WHERE property=${DEFAULT_PROPERTY} AND content_hash=${preview.hash} LIMIT 1`;
  if (existing.length) return { catalog: await loadPricingCatalog({ allowFallback: false, fresh: true }), replayed: true, importId: Number(existing[0].id), preview };
  for (const row of preview.rows.filter((item) => item.recordType === 'override')) {
    const overlap = await findOverlappingOverride(sql, row.data);
    if (overlap[0]) throw pricingError('override_overlap', `Import row ${row.rowNumber} overlaps “${overlap[0].name}” for ${row.data.channel}.`, 409, { import: [{ rowNumber: row.rowNumber, errors: ['overlaps an existing override'] }] });
  }
  const queries = [sql`
    INSERT INTO pricing_imports (property, file_name, content_hash, row_count)
    VALUES (${DEFAULT_PROPERTY}, ${preview.fileName}, ${preview.hash}, ${preview.rowCount})
    RETURNING id
  `];
  for (const row of preview.rows) {
    const rule = row.data;
    if (row.recordType === 'override') {
      queries.push(sql`
        INSERT INTO pricing_overrides (property, name, channel, start_date, end_date, nightly_rate, min_nights, active)
        VALUES (${DEFAULT_PROPERTY}, ${rule.name}, ${rule.channel}, ${rule.start}::date, ${rule.end}::date, ${rule.nightlyRate}, ${rule.minNights}, ${rule.active})
      `);
    } else {
      queries.push(sql`
        INSERT INTO pricing_discounts (property, name, channel, start_date, end_date, discount_type, discount_value, minimum_nights, maximum_nights, eligible_weekdays, active)
        VALUES (${DEFAULT_PROPERTY}, ${rule.name}, ${rule.channel}, ${rule.start}::date, ${rule.end}::date, ${rule.discountType}, ${rule.value}, ${rule.minimumNights}, ${rule.maximumNights}, ${rule.eligibleWeekdays}::int[], ${rule.active})
      `);
    }
  }
  const results = typeof sql.transaction === 'function' ? await sql.transaction(queries) : await Promise.all(queries);
  const importId = Number(results[0]?.[0]?.id || 0);
  invalidatePricingCatalog();
  return { catalog: await loadPricingCatalog({ allowFallback: false, fresh: true }), replayed: false, importId, preview };
}

module.exports = {
  CATALOG_TTL_MS,
  pricingError,
  validDate,
  parseWeekendDays,
  validateSettingsInput,
  validateSeasonInput,
  validateOverrideInput,
  validateDiscountInput,
  validateCostPolicyInput,
  seedPricingIfEmpty,
  loadPricingCatalog,
  invalidatePricingCatalog,
  publicPricingPayload,
  catalogFromRows,
  updatePricingSettings,
  createPricingSeason,
  updatePricingSeason,
  deletePricingSeason,
  savePricingOverride,
  deletePricingOverride,
  savePricingDiscount,
  deletePricingDiscount,
  savePricingCostPolicy,
  commitPricingImport
};
