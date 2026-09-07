const { neon } = require('@neondatabase/serverless');

let client;
let schemaReady;

function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  if (!client) client = neon(process.env.DATABASE_URL);
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
        CONSTRAINT reservation_guest_count_valid CHECK (guests BETWEEN 1 AND 12),
        CONSTRAINT reservation_status_valid CHECK (status IN ('inquiry_hold','hold_verified','checkout_pending','payment_received','contract_sent','contract_signed','confirmed','released','expired','cancelled'))
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
      CREATE TABLE IF NOT EXISTS owner_sessions (
        token_hash text PRIMARY KEY,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
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
          WHERE (status IN ('inquiry_hold','hold_verified','checkout_pending','payment_received','contract_sent','contract_signed','confirmed'));
        END IF;
      END $$
    `;
    await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text`;
    await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text`;
    await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS amount_cents integer`;
    await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'usd'`;
    await sql`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS paid_at timestamptz`;
    await sql`ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservation_status_valid`;
    await sql`
      ALTER TABLE reservations
      ADD CONSTRAINT reservation_status_valid CHECK (status IN ('inquiry_hold','hold_verified','checkout_pending','payment_received','contract_sent','contract_signed','confirmed','released','expired','cancelled'))
    `;
    await sql`ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_no_overlap`;
    await sql`
      ALTER TABLE reservations
      ADD CONSTRAINT reservations_no_overlap
      EXCLUDE USING gist (daterange(checkin, checkout, '[)') WITH &&)
      WHERE (status IN ('inquiry_hold','hold_verified','checkout_pending','payment_received','contract_sent','contract_signed','confirmed'))
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS reservations_stripe_session_idx ON reservations(stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL`;
  })();
  return schemaReady;
}

async function expireHolds() {
  await ensureSchema();
  const sql = db();
  const expired = await sql`
    UPDATE reservations
    SET status='expired', updated_at=now()
    WHERE status IN ('inquiry_hold','hold_verified','checkout_pending')
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

function ymd(v) {
  if (!v) return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const m = String(v).match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : String(v);
}

async function getActiveReservations() {
  await expireHolds();
  const sql = db();
  const rows = await sql`
    SELECT id, checkin::text AS checkin, checkout::text AS checkout, status, hold_expires_at
    FROM reservations
    WHERE status IN ('inquiry_hold','hold_verified','checkout_pending','payment_received','contract_sent','contract_signed','confirmed')
    ORDER BY checkin ASC
  `;
  return rows.map((row) => ({
    ...row,
    checkin: ymd(row.checkin),
    checkout: ymd(row.checkout)
  }));
}

module.exports = { db, ensureSchema, expireHolds, getActiveReservations };
