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
        CONSTRAINT reservation_status_valid CHECK (status IN ('inquiry_hold','hold_verified','contract_sent','contract_signed','confirmed','released','expired','cancelled'))
      )
    `;
    await sql`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname='reservation_guest_count_valid'
            AND pg_get_constraintdef(oid) NOT LIKE '%14%'
        ) THEN
          ALTER TABLE reservations DROP CONSTRAINT reservation_guest_count_valid;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reservation_guest_count_valid') THEN
          BEGIN
            ALTER TABLE reservations ADD CONSTRAINT reservation_guest_count_valid CHECK (guests BETWEEN 1 AND 14);
          EXCEPTION WHEN duplicate_object THEN NULL;
          END;
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
    await sql`ALTER TABLE owner_users ADD COLUMN IF NOT EXISTS must_change_password boolean`;
    await sql`UPDATE owner_users SET must_change_password=CASE WHEN role='admin' THEN false ELSE true END WHERE must_change_password IS NULL`;
    await sql`ALTER TABLE owner_users ALTER COLUMN must_change_password SET DEFAULT true`;
    await sql`ALTER TABLE owner_users ALTER COLUMN must_change_password SET NOT NULL`;

    await sql`
      CREATE TABLE IF NOT EXISTS owner_sessions (
        token_hash text PRIMARY KEY,
        user_id bigint REFERENCES owner_users(id) ON DELETE CASCADE,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`ALTER TABLE owner_sessions ADD COLUMN IF NOT EXISTS user_id bigint REFERENCES owner_users(id) ON DELETE CASCADE`;

    await sql`
      CREATE TABLE IF NOT EXISTS tasks (
        id bigserial PRIMARY KEY,
        title text NOT NULL,
        description text,
        status text NOT NULL DEFAULT 'open',
        priority text NOT NULL DEFAULT 'normal',
        due_at timestamptz,
        assigned_user_id bigint REFERENCES owner_users(id) ON DELETE SET NULL,
        reservation_id text REFERENCES reservations(id) ON DELETE SET NULL,
        created_by_user_id bigint REFERENCES owner_users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT task_status_valid CHECK (status IN ('open','in_progress','done','cancelled')),
        CONSTRAINT task_priority_valid CHECK (priority IN ('low','normal','high','urgent'))
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS site_config (
        key text PRIMARY KEY,
        value jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_by_user_id bigint REFERENCES owner_users(id) ON DELETE SET NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    await sql`
      INSERT INTO site_config(key,value)
      VALUES
        ('midweek_offer', '{"enabled":false,"discount_pct":0,"min_nights":2}'::jsonb),
        ('long_stay_offer', '{"enabled":false,"seven_night_pct":0,"fourteen_night_pct":0,"twentyeight_night_pct":0}'::jsonb)
      ON CONFLICT (key) DO NOTHING
    `;

    await sql`CREATE INDEX IF NOT EXISTS reservations_dates_idx ON reservations(checkin, checkout)`;
    await sql`CREATE INDEX IF NOT EXISTS reservations_status_idx ON reservations(status)`;
    await sql`CREATE INDEX IF NOT EXISTS booking_events_reservation_idx ON booking_events(reservation_id, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS owner_sessions_user_idx ON owner_sessions(user_id, expires_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS tasks_status_due_idx ON tasks(status, due_at)`;
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_no_overlap') THEN
          BEGIN
            ALTER TABLE reservations
            ADD CONSTRAINT reservations_no_overlap
            EXCLUDE USING gist (daterange(checkin, checkout, '[)') WITH &&)
            WHERE (status IN ('inquiry_hold','hold_verified','contract_sent','contract_signed','confirmed'));
          EXCEPTION WHEN duplicate_object THEN NULL;
          END;
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
