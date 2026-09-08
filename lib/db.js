const { neon } = require('@neondatabase/serverless');
const { listReservations } = require('./reservation-queries');

let client;
let schemaReady;

function resolveDatabaseUrl() {
  // Prefer CJT_DATABASE_URL so Preview can override Neon-managed DATABASE_URL.
  const override = String(process.env.CJT_DATABASE_URL || '').trim();
  if (override) return override;
  return String(process.env.DATABASE_URL || '').trim();
}

function databaseHost(databaseUrl) {
  try {
    return new URL(databaseUrl).hostname || '';
  } catch {
    return '';
  }
}

function databaseConfigurationError() {
  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) return new Error('DATABASE_URL is not configured');

  const vercelEnv = String(process.env.VERCEL_ENV || '').trim().toLowerCase();
  const dbTarget = String(process.env.CJT_DB_TARGET || '').trim().toLowerCase();
  const allowProduction = process.env.CJT_ALLOW_PROD_DB === '1';

  // Vercel Production must opt in explicitly. This prevents a production
  // connection from being used by a deployment with an unexpected scope.
  if (vercelEnv === 'production') {
    if (!allowProduction) return new Error('Production database access requires CJT_ALLOW_PROD_DB=1');
    if (dbTarget !== 'production') return new Error('Production database access requires CJT_DB_TARGET=production');
    return null;
  }

  // Preview is deliberately fail-closed. The URL must be supplied from the
  // Preview environment and explicitly labelled as a non-production target.
  if (vercelEnv === 'preview') {
    if (allowProduction) return new Error('CJT_ALLOW_PROD_DB=1 is only valid for Vercel Production');
    if (dbTarget !== 'preview') return new Error('Preview database access requires CJT_DB_TARGET=preview');
    // Fail closed if Preview still points at the known production Neon host.
    const host = databaseHost(databaseUrl);
    if (host.includes('ep-calm-field')) {
      return new Error('Preview must not use production Neon host; set CJT_DATABASE_URL to the Preview branch');
    }
    return null;
  }

  // Never allow the production opt-in to leak into local, development, or
  // another Vercel environment. Local development remains compatible with
  // the existing DATABASE_URL-only workflow.
  if (allowProduction) return new Error('CJT_ALLOW_PROD_DB=1 is only valid for Vercel Production');
  return null;
}

function assertDatabaseConfiguration() {
  const error = databaseConfigurationError();
  if (error) throw error;
}

function db() {
  assertDatabaseConfiguration();
  if (!client) client = neon(resolveDatabaseUrl());
  return client;
}

async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    try {
    const sql = db();
    await sql`CREATE EXTENSION IF NOT EXISTS btree_gist`;
    await sql`
      CREATE TABLE IF NOT EXISTS reservations (
        id text PRIMARY KEY,
        property text NOT NULL DEFAULT 'Sand & Sea Manor',
        guest_name text NOT NULL,
        guest_email text NOT NULL,
        guest_phone text,
        guests integer NOT NULL,
        notes text,
        checkin date NOT NULL,
        checkout date NOT NULL,
        status text NOT NULL DEFAULT 'inquiry_hold',
        hold_expires_at timestamptz,
        contract_sent_at timestamptz,
        contract_signed_at timestamptz,
        deposit_received_at timestamptz,
        released_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT reservation_dates_valid CHECK (checkout > checkin),
        CONSTRAINT reservation_guest_count_valid CHECK (guests BETWEEN 1 AND 14),
        CONSTRAINT reservation_status_valid CHECK (status IN ('inquiry_hold','hold_verified','contract_sent','contract_signed','confirmed','released','expired','cancelled'))
      )
    `;
    await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS trip_type text`;
    await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS bringing_pet boolean`;
    await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS pet_details text`;
    await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS planning_event boolean`;
    await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS event_details text`;
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservation_trip_type_valid') THEN
          ALTER TABLE reservations
          ADD CONSTRAINT reservation_trip_type_valid
          CHECK (trip_type IS NULL OR trip_type IN ('Leisure','Family','Business','Other'));
        END IF;
      END $$
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS booking_events (
        id bigserial PRIMARY KEY,
        reservation_id text NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        event_type text NOT NULL,
        actor text NOT NULL DEFAULT 'system',
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS owner_users (
        id bigserial PRIMARY KEY,
        name text NOT NULL,
        email text NOT NULL UNIQUE,
        password_salt text NOT NULL,
        password_hash text NOT NULL,
        role text NOT NULL DEFAULT 'owner',
        active boolean NOT NULL DEFAULT true,
        must_change_password boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT owner_user_role_valid CHECK (role IN ('admin','owner','manager'))
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS owner_sessions (
        token_hash text PRIMARY KEY,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        user_id bigint REFERENCES owner_users(id) ON DELETE CASCADE
      )
    `;
    await sql`ALTER TABLE owner_sessions ADD COLUMN IF NOT EXISTS user_id bigint REFERENCES owner_users(id) ON DELETE CASCADE`;
    await sql`
      CREATE TABLE IF NOT EXISTS communications_messages (
        id text PRIMARY KEY,
        thread_id text,
        platform text NOT NULL,
        message_type text NOT NULL DEFAULT 'message',
        guest_name text,
        subject text NOT NULL,
        body text,
        snippet text,
        stay_checkin date,
        stay_checkout date,
        reservation_ref text,
        platform_url text,
        gmail_url text,
        source_email text,
        reply_to text,
        received_at timestamptz NOT NULL,
        is_read boolean NOT NULL DEFAULT false,
        status text NOT NULL DEFAULT 'open',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS reservations_dates_idx ON reservations(checkin, checkout)`;
    await sql`CREATE INDEX IF NOT EXISTS reservations_status_idx ON reservations(status)`;
    await sql`CREATE INDEX IF NOT EXISTS booking_events_reservation_idx ON booking_events(reservation_id, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS owner_sessions_user_idx ON owner_sessions(user_id,expires_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS communications_received_idx ON communications_messages(received_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS communications_platform_idx ON communications_messages(platform, received_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS communications_status_idx ON communications_messages(status, is_read, received_at DESC)`;
    await sql`
      CREATE TABLE IF NOT EXISTS booking_financials (
        booking_key text PRIMARY KEY,
        channel text NOT NULL,
        checkin date NOT NULL,
        checkout date NOT NULL,
        status text NOT NULL DEFAULT 'confirmed',
        gross_revenue numeric,
        taxes numeric,
        cleaning_fee numeric,
        expected_payout numeric,
        collected_amount numeric,
        currency text NOT NULL DEFAULT 'USD',
        source text NOT NULL DEFAULT 'owner_entry',
        external_reference text,
        notes text,
        updated_by_user_id bigint REFERENCES owner_users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT booking_financial_dates_valid CHECK (checkout > checkin),
        CONSTRAINT booking_financial_channel_valid CHECK (channel = ANY (ARRAY['airbnb','vrbo','booking.com','houfy','direct','other'])),
        CONSTRAINT booking_financial_status_valid CHECK (status = ANY (ARRAY['confirmed','pending','completed','cancelled'])),
        CONSTRAINT booking_financial_amounts_valid CHECK (
          (gross_revenue IS NULL OR (gross_revenue >= 0 AND gross_revenue <= 1000000))
          AND (taxes IS NULL OR (taxes >= 0 AND taxes <= 1000000))
          AND (cleaning_fee IS NULL OR (cleaning_fee >= 0 AND cleaning_fee <= 1000000))
          AND (expected_payout IS NULL OR (expected_payout >= 0 AND expected_payout <= 1000000))
          AND (collected_amount IS NULL OR (collected_amount >= 0 AND collected_amount <= 1000000))
        )
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS booking_financials_dates_idx ON booking_financials(checkin, checkout)`;
    await sql`CREATE INDEX IF NOT EXISTS booking_financials_channel_status_idx ON booking_financials(channel, status)`;
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_no_overlap') THEN
          ALTER TABLE reservations
          ADD CONSTRAINT reservations_no_overlap
          EXCLUDE USING gist (daterange(checkin, checkout, '[)') WITH &&)
          WHERE (status IN ('inquiry_hold','hold_verified','contract_sent','contract_signed','confirmed'));
        END IF;
      END $$
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS calendar_connections (
        id bigserial PRIMARY KEY,
        label text NOT NULL,
        feed_url text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by text NOT NULL DEFAULT 'owner',
        CONSTRAINT calendar_connection_label_nonempty CHECK (length(trim(label)) > 0)
      )
    `;
    // One-time migrate from the older 3-slot table if it still exists.
    await sql`
      DO $$
      BEGIN
        IF to_regclass('public.calendar_feeds') IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM calendar_connections LIMIT 1) THEN
          INSERT INTO calendar_connections(label, feed_url, updated_at, updated_by)
          SELECT initcap(source), feed_url, updated_at, COALESCE(updated_by, 'owner')
          FROM calendar_feeds
          ORDER BY source
          LIMIT 10;
        END IF;
      END $$
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS owner_calendar_entries (
        id bigserial PRIMARY KEY,
        property_id text NOT NULL DEFAULT 'sand-sea-manor',
        kind text NOT NULL,
        start_date date NOT NULL,
        end_date date NOT NULL,
        notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by text NOT NULL DEFAULT 'owner',
        CONSTRAINT owner_calendar_entry_kind_valid CHECK (kind IN ('manual_block','owner_stay')),
        CONSTRAINT owner_calendar_entry_dates_valid CHECK (end_date > start_date)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS owner_calendar_entries_dates_idx ON owner_calendar_entries(property_id, start_date, end_date)`;
    await sql`CREATE INDEX IF NOT EXISTS owner_calendar_entries_kind_idx ON owner_calendar_entries(property_id, kind, start_date)`;

    await sql`
      CREATE TABLE IF NOT EXISTS owner_calendar_settings (
        property_id text PRIMARY KEY DEFAULT 'sand-sea-manor',
        prep_buffer_enabled boolean NOT NULL DEFAULT false,
        show_guest_names boolean NOT NULL DEFAULT true,
        show_guest_contact boolean NOT NULL DEFAULT false,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`
      INSERT INTO owner_calendar_settings(property_id)
      VALUES ('sand-sea-manor')
      ON CONFLICT (property_id) DO NOTHING
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS pricing_settings (
        id text PRIMARY KEY DEFAULT 'default',
        property text NOT NULL DEFAULT 'Sand & Sea Manor',
        cleaning_fee numeric(10,2) NOT NULL,
        tax_rate numeric(6,4) NOT NULL,
        max_guests integer NOT NULL,
        pricing_through date NOT NULL,
        weekend_days integer[] NOT NULL DEFAULT ARRAY[5,6],
        advance_payment_pct numeric(6,4) NOT NULL,
        split_payment_threshold_days integer NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pricing_settings_cleaning_fee_valid CHECK (cleaning_fee >= 0 AND cleaning_fee <= 10000),
        CONSTRAINT pricing_settings_tax_rate_valid CHECK (tax_rate >= 0 AND tax_rate <= 1),
        CONSTRAINT pricing_settings_max_guests_valid CHECK (max_guests BETWEEN 1 AND 14),
        CONSTRAINT pricing_settings_advance_pct_valid CHECK (advance_payment_pct > 0 AND advance_payment_pct <= 1),
        CONSTRAINT pricing_settings_split_days_valid CHECK (split_payment_threshold_days BETWEEN 0 AND 365),
        CONSTRAINT pricing_settings_weekend_days_valid CHECK (weekend_days <@ ARRAY[0,1,2,3,4,5,6])
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS pricing_seasons (
        id bigserial PRIMARY KEY,
        property text NOT NULL DEFAULT 'Sand & Sea Manor',
        name text NOT NULL,
        start_date date NOT NULL,
        end_date date NOT NULL,
        weekday_rate numeric(10,2) NOT NULL,
        weekend_rate numeric(10,2) NOT NULL,
        min_nights integer NOT NULL,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pricing_season_name_nonempty CHECK (length(trim(name)) > 0),
        CONSTRAINT pricing_season_dates_valid CHECK (end_date >= start_date),
        CONSTRAINT pricing_season_weekday_rate_valid CHECK (weekday_rate > 0),
        CONSTRAINT pricing_season_weekend_rate_valid CHECK (weekend_rate > 0),
        CONSTRAINT pricing_season_min_nights_valid CHECK (min_nights BETWEEN 1 AND 30)
      )
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS pricing_seasons_property_dates_idx ON pricing_seasons (property, start_date, end_date)`;
    await sql`CREATE INDEX IF NOT EXISTS pricing_seasons_range_idx ON pricing_seasons (property, start_date, end_date)`;
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pricing_seasons_no_overlap') THEN
          ALTER TABLE pricing_seasons
          ADD CONSTRAINT pricing_seasons_no_overlap
          EXCLUDE USING gist (
            property WITH =,
            daterange(start_date, end_date, '[]') WITH &&
          );
        END IF;
      END $$
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS pricing_override_rules (
        id bigserial PRIMARY KEY,
        property text NOT NULL DEFAULT 'Sand & Sea Manor',
        name text NOT NULL,
        channel text NOT NULL DEFAULT 'all',
        start_date date NOT NULL,
        end_date date NOT NULL,
        nightly_rate numeric(10,2) NOT NULL,
        min_nights integer,
        priority integer NOT NULL DEFAULT 0,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pricing_override_name_nonempty CHECK (length(trim(name)) > 0),
        CONSTRAINT pricing_override_channel_valid CHECK (channel IN ('all','direct','airbnb','vrbo','booking.com','houfy')),
        CONSTRAINT pricing_override_dates_valid CHECK (end_date >= start_date),
        CONSTRAINT pricing_override_rate_valid CHECK (nightly_rate > 0 AND nightly_rate <= 20000),
        CONSTRAINT pricing_override_min_nights_valid CHECK (min_nights IS NULL OR min_nights BETWEEN 1 AND 30)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS pricing_override_rules_range_idx ON pricing_override_rules (property, channel, start_date, end_date)`;
    await sql`
      CREATE TABLE IF NOT EXISTS pricing_discounts (
        id bigserial PRIMARY KEY,
        property text NOT NULL DEFAULT 'Sand & Sea Manor',
        name text NOT NULL,
        channel text NOT NULL DEFAULT 'all',
        start_date date,
        end_date date,
        discount_type text NOT NULL,
        discount_value numeric(10,4) NOT NULL,
        minimum_nights integer NOT NULL DEFAULT 1,
        maximum_nights integer,
        eligible_weekdays integer[] NOT NULL DEFAULT ARRAY[]::integer[],
        priority integer NOT NULL DEFAULT 0,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pricing_discount_name_nonempty CHECK (length(trim(name)) > 0),
        CONSTRAINT pricing_discount_channel_valid CHECK (channel IN ('all','direct','airbnb','vrbo','booking.com','houfy')),
        CONSTRAINT pricing_discount_dates_valid CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date),
        CONSTRAINT pricing_discount_type_valid CHECK (discount_type IN ('percent','fixed')),
        CONSTRAINT pricing_discount_value_valid CHECK (discount_value > 0),
        CONSTRAINT pricing_discount_nights_valid CHECK (minimum_nights BETWEEN 1 AND 90 AND (maximum_nights IS NULL OR maximum_nights BETWEEN minimum_nights AND 90)),
        CONSTRAINT pricing_discount_weekdays_valid CHECK (eligible_weekdays <@ ARRAY[0,1,2,3,4,5,6])
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS pricing_discounts_lookup_idx ON pricing_discounts (property, channel, active, start_date, end_date)`;
    await sql`
      CREATE TABLE IF NOT EXISTS pricing_cost_policies (
        property text NOT NULL DEFAULT 'Sand & Sea Manor',
        channel text NOT NULL,
        monthly_operating_cost numeric(12,2) NOT NULL DEFAULT 0,
        cleaning_cost numeric(10,2) NOT NULL DEFAULT 0,
        channel_fee_rate numeric(7,5) NOT NULL DEFAULT 0,
        minimum_contribution numeric(10,2) NOT NULL DEFAULT 0,
        mode text NOT NULL DEFAULT 'monitor',
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (property, channel),
        CONSTRAINT pricing_cost_channel_valid CHECK (channel IN ('direct','airbnb','vrbo','booking.com','houfy')),
        CONSTRAINT pricing_cost_values_valid CHECK (monthly_operating_cost >= 0 AND cleaning_cost >= 0 AND channel_fee_rate >= 0 AND channel_fee_rate < 0.95 AND minimum_contribution >= 0),
        CONSTRAINT pricing_cost_mode_valid CHECK (mode IN ('off','monitor','enforce'))
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS pricing_imports (
        id bigserial PRIMARY KEY,
        property text NOT NULL DEFAULT 'Sand & Sea Manor',
        file_name text NOT NULL,
        content_hash text NOT NULL,
        row_count integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (property, content_hash)
      )
    `;
    // Inclusive ranges; single-night seasons (end = start) are valid.
    // Overlap policy: reject on write. Adjacent seasons (end + 1 day = next start) are allowed.
    const { seedPricingIfEmpty } = require('./pricing-store');
    await seedPricingIfEmpty(sql);
    } catch (error) {
      schemaReady = undefined;
      throw error;
    }
  })();
  return schemaReady;
}

async function expireHolds() {
  // Compatibility no-op. Submitted requests lock dates until an owner
  // explicitly releases them. Read paths must never reopen inventory.
  return 0;
}

async function getActiveReservations(includeClosed = false, options = {}) {
  await ensureSchema();
  const sql = db();
  const opts = includeClosed && typeof includeClosed === 'object'
    ? includeClosed
    : { includeClosed: Boolean(includeClosed), ...options };
  return listReservations(sql, opts);
}

const DEFAULT_PROPERTY_ID = 'sand-sea-manor';

async function listOwnerCalendarEntries(propertyId = DEFAULT_PROPERTY_ID) {
  try {
    await ensureSchema();
    const sql = db();
    return await sql`
      SELECT id, property_id, kind, start_date::text, end_date::text, notes, created_at, updated_at
      FROM owner_calendar_entries
      WHERE property_id=${propertyId}
      ORDER BY start_date ASC, id ASC
      LIMIT 500
    `;
  } catch {
    return [];
  }
}

async function getCalendarSettings(propertyId = DEFAULT_PROPERTY_ID) {
  try {
    await ensureSchema();
    const sql = db();
    const rows = await sql`
      SELECT property_id, prep_buffer_enabled, show_guest_names, show_guest_contact, updated_at
      FROM owner_calendar_settings
      WHERE property_id=${propertyId}
      LIMIT 1
    `;
    return rows[0] || {
      property_id: propertyId,
      prep_buffer_enabled: false,
      show_guest_names: true,
      show_guest_contact: false
    };
  } catch {
    return {
      property_id: propertyId,
      prep_buffer_enabled: false,
      show_guest_names: true,
      show_guest_contact: false
    };
  }
}

module.exports = {
  db,
  ensureSchema,
  expireHolds,
  getActiveReservations,
  listOwnerCalendarEntries,
  getCalendarSettings,
  DEFAULT_PROPERTY_ID
};
