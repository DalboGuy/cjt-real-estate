-- CJT Platform v1 identity / authorization foundation
-- Target first: Neon reorganization branch only.

CREATE TABLE IF NOT EXISTS properties (
  id text PRIMARY KEY,
  name text NOT NULL,
  address_line1 text,
  city text,
  state text,
  postal_code text,
  timezone text NOT NULL DEFAULT 'America/Chicago',
  max_guests integer,
  default_currency text NOT NULL DEFAULT 'USD',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO properties(id,name,address_line1,city,state,postal_code,timezone,max_guests,default_currency,active)
VALUES ('sand-sea-manor','Sand & Sea Manor','1720 Avenue M','Galveston','TX','77550','America/Chicago',12,'USD',true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_property_access (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES owner_users(id) ON DELETE CASCADE,
  property_id text NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  access_role text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_property_access_role_valid CHECK (access_role IN ('admin','owner','manager','cohost','accounting','read_only')),
  CONSTRAINT user_property_access_unique UNIQUE(user_id,property_id)
);

CREATE INDEX IF NOT EXISTS user_property_access_property_idx ON user_property_access(property_id,active);
CREATE INDEX IF NOT EXISTS user_property_access_user_idx ON user_property_access(user_id,active);

CREATE TABLE IF NOT EXISTS account_invitations (
  token_hash text PRIMARY KEY,
  email text NOT NULL,
  name text,
  invited_role text NOT NULL,
  property_id text REFERENCES properties(id) ON DELETE CASCADE,
  created_by bigint REFERENCES owner_users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_invitation_role_valid CHECK (invited_role IN ('admin','owner','manager','cohost','accounting','read_only'))
);

CREATE INDEX IF NOT EXISTS account_invitations_email_idx ON account_invitations(lower(email),expires_at DESC);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash text PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES owner_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens(user_id,expires_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  actor_user_id bigint REFERENCES owner_users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  target_type text,
  target_id text,
  property_id text REFERENCES properties(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log(actor_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_property_idx ON audit_log(property_id,created_at DESC);
