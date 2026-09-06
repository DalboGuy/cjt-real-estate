-- CJT Platform v1 additive occupancy migration
-- Target first: Neon reorganization/preview branch only.
-- This file is preparatory SQL. Do not run it against production without Joel's
-- separate, explicit approval and the production cutover checklist in the docs.

BEGIN;

ALTER TABLE reservations
  DROP CONSTRAINT IF EXISTS reservation_guest_count_valid;

ALTER TABLE reservations
  ADD CONSTRAINT reservation_guest_count_valid
  CHECK (guests BETWEEN 1 AND 14);

COMMIT;

-- Rollback (only when no reservation has guests > 12):
-- BEGIN;
-- DO $$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM reservations WHERE guests > 12) THEN
--     RAISE EXCEPTION 'Rollback blocked: reservations exist for more than 12 guests';
--   END IF;
-- END $$;
-- ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservation_guest_count_valid;
-- ALTER TABLE reservations ADD CONSTRAINT reservation_guest_count_valid
--   CHECK (guests BETWEEN 1 AND 12);
-- COMMIT;
