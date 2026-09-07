const {
  SEASONS,
  DEFAULT_PROPERTY,
  SETTINGS_ID,
  WEEKDAY_NAMES,
  defaultCatalog,
  defaultSettings
} = require('./pricing-defaults');

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

function catalogFromRows(settingsRow, seasonRows, source = 'database') {
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
    fields.advancePaymentPct = 'Advance payment must be greater than 0% and at most 100%.';
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
  const [settingsRows, seasonRows] = await Promise.all([
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
    `
  ]);
  if (!settingsRows.length && !seasonRows.length) return null;
  return catalogFromRows(settingsRows[0] || null, seasonRows, 'database');
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

module.exports = {
  CATALOG_TTL_MS,
  pricingError,
  validDate,
  parseWeekendDays,
  validateSettingsInput,
  validateSeasonInput,
  seedPricingIfEmpty,
  loadPricingCatalog,
  invalidatePricingCatalog,
  publicPricingPayload,
  catalogFromRows,
  updatePricingSettings,
  createPricingSeason,
  updatePricingSeason,
  deletePricingSeason
};
