const { neon } = require('@neondatabase/serverless');

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
    // Inclusive ranges; single-night seasons (end = start) are valid.
    // Overlap policy: reject on write. Adjacent seasons (end + 1 day = next start) are allowed.
    const { seedPricingIfEmpty } = require('./pricing-store');
    await seedPricingIfEmpty(sql);
  })();
  return schemaReady;
}

async function expireHolds() {
  await ensureSchema();
  const sql = db();
  const expired = await sql`
    UPDATE reservations
    SET status='expired', updated_at=now()
    WHERE status IN ('inquiry_hold','hold_verified')
      AND hold_expires_at IS NOT NULL
      AND hold_expires_at <= now()
    RETURNING id
  `;
  if (expired.length) {
    for (const row of expired) {
      await sql`INSERT INTO booking_events (reservation_id,event_type,actor) VALUES (${row.id},'hold_expired','system')`;
    }
  }
  return expired.length;
}

async function getActiveReservations() {
  await expireHolds();
  const sql = db();
  return sql`
    SELECT id, checkin::text, checkout::text, status, hold_expires_at
    FROM reservations
    WHERE status IN ('inquiry_hold','hold_verified','contract_sent','contract_signed','confirmed')
    ORDER BY checkin ASC
  `;
}

module.exports = { db, ensureSchema, expireHolds, getActiveReservations };
