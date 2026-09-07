-- CJT Platform v1 owner calendar view
-- Target first: Neon reorganization/preview branch only.
-- Additive. Do not run against production without Joel's explicit approval.

BEGIN;

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
);

CREATE INDEX IF NOT EXISTS owner_calendar_entries_dates_idx
  ON owner_calendar_entries(property_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS owner_calendar_entries_kind_idx
  ON owner_calendar_entries(property_id, kind, start_date);

CREATE TABLE IF NOT EXISTS owner_calendar_settings (
  property_id text PRIMARY KEY DEFAULT 'sand-sea-manor',
  prep_buffer_enabled boolean NOT NULL DEFAULT false,
  show_guest_names boolean NOT NULL DEFAULT true,
  show_guest_contact boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO owner_calendar_settings(property_id)
VALUES ('sand-sea-manor')
ON CONFLICT (property_id) DO NOTHING;

COMMIT;

-- Rollback:
-- BEGIN;
-- DROP TABLE IF EXISTS owner_calendar_entries;
-- DROP TABLE IF EXISTS owner_calendar_settings;
-- COMMIT;
