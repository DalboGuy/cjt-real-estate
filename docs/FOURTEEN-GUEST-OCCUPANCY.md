# Fourteen-guest occupancy cutover

Status: **Needs review / Partial — not Built.** This PR prepares the code and additive SQL for Issue #22; it does not migrate production.

## Behavior

- Pricing and request validation support 1–14 guests.
- A new database initialized from this branch uses `guests BETWEEN 1 AND 14`.
- An existing database with the old reservation check remains safe: a 13–14 guest inquiry returns HTTP 503 with `occupancy_migration_pending` and asks the guest to contact CJT Realty. It does not silently fail or write a partial reservation.
- After the additive migration is applied to an isolated reorganization/preview database, reservation requests for 1–14 guests use the normal hold flow.

## Joel: apply to the Neon reorganization/preview branch now

1. In the Neon console, select the approved `reorg-platform-v1` branch (or an approved disposable child), not the production `main` branch.
2. Review `docs/migrations/002-fourteen-guest-occupancy.sql` and run its forward section in that branch's SQL editor.
3. Verify the result before testing:

   ```sql
   SELECT conname, pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conrelid = 'reservations'::regclass
     AND conname = 'reservation_guest_count_valid';
   ```

   The definition must allow guests between 1 and 14.
4. Point the Vercel Preview `DATABASE_URL` at that reorganization/child branch with `CJT_DB_TARGET=preview` and without `CJT_ALLOW_PROD_DB`. Keep secrets in Vercel/Neon only.
5. Test one normal request and one 14-guest request in Preview, then verify the hold and booking event exist only on the reorganization/child branch.

Do not use this SQL to change the production branch as part of this PR. No production database was migrated here.

## Separate production approval and cutover later

Before production can accept 13–14 guest reservations, Joel must explicitly approve the production target and cutover timing, confirm a current recovery snapshot/backup, and verify the Vercel production environment points at the canonical production Neon branch. After that separate approval, run the same forward SQL against production, verify the constraint and a controlled end-to-end request, and record the result. Until then, production keeps the clear migration-pending response for 13–14 guests.

The rollback is documented in the migration file. It first blocks rollback when any reservation has more than 12 guests, then restores the 1–12 check. Rollback also requires Joel's decision about any affected holds or reservations.
