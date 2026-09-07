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
      CREATE TABLE IF NOT EXISTS calendar_feeds (
        source text PRIMARY KEY,
        feed_url text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by text NOT NULL DEFAULT 'owner',
        CONSTRAINT calendar_feed_source_valid CHECK (source IN ('airbnb','vrbo','booking.com'))
      )
    `;
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
