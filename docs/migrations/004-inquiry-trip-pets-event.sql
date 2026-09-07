-- CJT Platform v1 additive guest inquiry trip / pets / event columns
-- Target first: Neon reorganization/preview branch only.
-- This file is preparatory SQL. Do not run it against production without Joel's
-- separate, explicit approval and the production cutover checklist in the docs.

BEGIN;

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS trip_type text,
  ADD COLUMN IF NOT EXISTS bringing_pet boolean,
  ADD COLUMN IF NOT EXISTS pet_details text,
  ADD COLUMN IF NOT EXISTS planning_event boolean,
  ADD COLUMN IF NOT EXISTS event_details text;

ALTER TABLE reservations
  DROP CONSTRAINT IF EXISTS reservation_trip_type_valid;

ALTER TABLE reservations
  ADD CONSTRAINT reservation_trip_type_valid
  CHECK (trip_type IS NULL OR trip_type IN ('Leisure','Family','Business','Other'));

COMMIT;

-- Rollback:
-- BEGIN;
-- ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservation_trip_type_valid;
-- ALTER TABLE reservations
--   DROP COLUMN IF EXISTS trip_type,
--   DROP COLUMN IF EXISTS bringing_pet,
--   DROP COLUMN IF EXISTS pet_details,
--   DROP COLUMN IF EXISTS planning_event,
--   DROP COLUMN IF EXISTS event_details;
-- COMMIT;
