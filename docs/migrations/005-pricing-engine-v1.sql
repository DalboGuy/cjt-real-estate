-- CJT Pricing Engine v1 additive migration
-- Target first: Neon preview/reorg/platform-v1 only.
-- Do not run against production without a separate owner-approved cutover.

BEGIN;

CREATE TABLE IF NOT EXISTS pricing_overrides (
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
);
CREATE INDEX IF NOT EXISTS pricing_overrides_range_idx
  ON pricing_overrides (property, channel, start_date, end_date);

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
);
CREATE INDEX IF NOT EXISTS pricing_discounts_lookup_idx
  ON pricing_discounts (property, channel, active, start_date, end_date);

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
);

CREATE TABLE IF NOT EXISTS pricing_imports (
  id bigserial PRIMARY KEY,
  property text NOT NULL DEFAULT 'Sand & Sea Manor',
  file_name text NOT NULL,
  content_hash text NOT NULL,
  row_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property, content_hash)
);

COMMIT;

-- Safe code rollback: revert the application code and leave these additive,
-- unused tables in place. Destructive table removal is intentionally omitted.
-- Export pricing data and receive separate owner approval before dropping data.
