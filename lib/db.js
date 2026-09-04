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
      CREATE TABLE IF NOT EXISTS owner_sessions (
        token_hash text PRIMARY KEY,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS reservations_dates_idx ON reservations(checkin, checkout)`;
    await sql`CREATE INDEX IF NOT EXISTS reservations_status_idx ON reservations(status)`;
    await sql`CREATE INDEX IF NOT EXISTS booking_events_reservation_idx ON booking_events(reservation_id, created_at DESC)`;
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
