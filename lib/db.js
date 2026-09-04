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
        category text NOT NULL DEFAULT 'general',
        recurrence text NOT NULL DEFAULT 'none',
        due_at timestamptz,
        completed_at timestamptz,
        assigned_user_id bigint REFERENCES owner_users(id) ON DELETE SET NULL,
        reservation_id text REFERENCES reservations(id) ON DELETE SET NULL,
        created_by_user_id bigint REFERENCES owner_users(id) ON DELETE SET NULL,
        recurrence_parent_id bigint REFERENCES tasks(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT task_status_valid CHECK (status IN ('open','in_progress','waiting','done','cancelled')),
        CONSTRAINT task_priority_valid CHECK (priority IN ('low','normal','high','urgent')),
        CONSTRAINT task_category_valid CHECK (category IN ('general','turnover','maintenance','guest','admin','pricing')),
        CONSTRAINT task_recurrence_valid CHECK (recurrence IN ('none','weekly','monthly','quarterly','annual'))
      )
    `;
    await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS category text`;
    await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence text`;
    await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz`;
    await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_parent_id bigint REFERENCES tasks(id) ON DELETE SET NULL`;
    await sql`UPDATE tasks SET category='general' WHERE category IS NULL`;
    await sql`UPDATE tasks SET recurrence='none' WHERE recurrence IS NULL`;
    await sql`ALTER TABLE tasks ALTER COLUMN category SET DEFAULT 'general'`;
    await sql`ALTER TABLE tasks ALTER COLUMN category SET NOT NULL`;
    await sql`ALTER TABLE tasks ALTER COLUMN recurrence SET DEFAULT 'none'`;
    await sql`ALTER TABLE tasks ALTER COLUMN recurrence SET NOT NULL`;
    await sql`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='task_status_valid' AND pg_get_constraintdef(oid) NOT LIKE '%waiting%') THEN
          ALTER TABLE tasks DROP CONSTRAINT task_status_valid;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='task_status_valid') THEN
          ALTER TABLE tasks ADD CONSTRAINT task_status_valid CHECK (status IN ('open','in_progress','waiting','done','cancelled'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='task_category_valid') THEN
          ALTER TABLE tasks ADD CONSTRAINT task_category_valid CHECK (category IN ('general','turnover','maintenance','guest','admin','pricing'));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='task_recurrence_valid') THEN
          ALTER TABLE tasks ADD CONSTRAINT task_recurrence_valid CHECK (recurrence IN ('none','weekly','monthly','quarterly','annual'));
        END IF;
      END $$
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
      CREATE TABLE IF NOT EXISTS pricing_overrides (
        stay_date date PRIMARY KEY,
        nightly_rate numeric(10,2) NOT NULL,
        min_nights integer,
        label text,
        updated_by_user_id bigint REFERENCES owner_users(id) ON DELETE SET NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pricing_override_rate_valid CHECK (nightly_rate >= 0 AND nightly_rate <= 5000),
        CONSTRAINT pricing_override_min_nights_valid CHECK (min_nights IS NULL OR min_nights BETWEEN 1 AND 30)
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS booking_financials (
        booking_key text PRIMARY KEY,
        channel text NOT NULL,
        checkin date NOT NULL,
        checkout date NOT NULL,
        status text NOT NULL DEFAULT 'confirmed',
        gross_revenue numeric(12,2),
        taxes numeric(12,2),
        cleaning_fee numeric(12,2),
        expected_payout numeric(12,2),
        collected_amount numeric(12,2),
        currency text NOT NULL DEFAULT 'USD',
        source text NOT NULL DEFAULT 'owner_entry',
        external_reference text,
        notes text,
        updated_by_user_id bigint REFERENCES owner_users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT booking_financial_dates_valid CHECK (checkout > checkin),
        CONSTRAINT booking_financial_channel_valid CHECK (channel IN ('airbnb','vrbo','booking.com','houfy','direct','other')),
        CONSTRAINT booking_financial_status_valid CHECK (status IN ('confirmed','pending','completed','cancelled')),
        CONSTRAINT booking_financial_amounts_valid CHECK (
          (gross_revenue IS NULL OR gross_revenue BETWEEN 0 AND 1000000) AND
          (taxes IS NULL OR taxes BETWEEN 0 AND 1000000) AND
          (cleaning_fee IS NULL OR cleaning_fee BETWEEN 0 AND 1000000) AND
          (expected_payout IS NULL OR expected_payout BETWEEN 0 AND 1000000) AND
          (collected_amount IS NULL OR collected_amount BETWEEN 0 AND 1000000)
        )
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS booking_payouts (
        payout_key text PRIMARY KEY,
        channel text NOT NULL,
        reservation_reference text,
        checkin date,
        payout_date date NOT NULL,
        amount numeric(12,2) NOT NULL,
        currency text NOT NULL DEFAULT 'USD',
        source text NOT NULL,
        descriptor text,
        matched_booking_key text REFERENCES booking_financials(booking_key) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT booking_payout_channel_valid CHECK (channel IN ('airbnb','vrbo','booking.com','houfy','direct','other')),
        CONSTRAINT booking_payout_amount_valid CHECK (amount BETWEEN 0 AND 1000000)
      )
    `;

    await sql`
      INSERT INTO site_config(key,value)
      VALUES
        ('midweek_offer', '{"enabled":false,"discount_pct":0,"min_nights":2}'::jsonb),
        ('long_stay_offer', '{"enabled":false,"seven_night_pct":0,"fourteen_night_pct":0,"twentyeight_night_pct":0}'::jsonb),
        ('pricing_rules', '{"weekday_rate":0,"weekend_rate":0,"default_min_nights":2,"reference_adr":358,"weekend_days":[5,6]}'::jsonb)
      ON CONFLICT (key) DO NOTHING
    `;

    await sql`CREATE INDEX IF NOT EXISTS reservations_dates_idx ON reservations(checkin, checkout)`;
    await sql`CREATE INDEX IF NOT EXISTS reservations_status_idx ON reservations(status)`;
    await sql`CREATE INDEX IF NOT EXISTS booking_events_reservation_idx ON booking_events(reservation_id, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS owner_sessions_user_idx ON owner_sessions(user_id, expires_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS tasks_status_due_idx ON tasks(status, due_at)`;
    await sql`CREATE INDEX IF NOT EXISTS tasks_assignee_status_idx ON tasks(assigned_user_id, status)`;
    await sql`CREATE INDEX IF NOT EXISTS pricing_overrides_date_idx ON pricing_overrides(stay_date)`;
    await sql`CREATE INDEX IF NOT EXISTS booking_financials_dates_idx ON booking_financials(checkin, checkout)`;
    await sql`CREATE INDEX IF NOT EXISTS booking_financials_channel_status_idx ON booking_financials(channel, status)`;
    await sql`CREATE INDEX IF NOT EXISTS booking_payouts_channel_date_idx ON booking_payouts(channel,payout_date)`;
    await sql`CREATE INDEX IF NOT EXISTS booking_payouts_reference_idx ON booking_payouts(reservation_reference)`;
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
