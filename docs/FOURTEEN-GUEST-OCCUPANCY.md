# Fourteen-guest occupancy cutover

Status: **Schema is already 1–14 on both official Neon branches.** Remaining work is Preview end-to-end acceptance, not re-applying the CHECK.

## Behavior

- Pricing and request validation support 1–14 guests.
- New databases initialized from this branch use `guests BETWEEN 1 AND 14`.
- **Verified 2026-09-07** on Neon project `holy-block-00778872`:
  - Official Preview `preview/reorg/platform-v1` (`br-damp-wildflower-avtyiin5`): `reservation_guest_count_valid` is `CHECK (guests >= 1 AND guests <= 14)`.
  - Production `main` (`br-billowing-smoke-avawnhdx`): the same 1–14 CHECK.
  - Legacy sibling `reorg-platform-v1` also already has 1–14; it is **not** the Vercel Preview target.
- Production is **not** still limited to 1–12. Do not treat 13–14 Preview or Production requests as “migration pending” unless a leftover database actually still has the old check.
- If an old 1–12 CHECK is somehow still in place, a 13–14 guest inquiry returns HTTP 503 with `occupancy_migration_pending` and asks the guest to contact CJT Realty. That path is a safety net, not the current official Preview/Production state.

Forward SQL remains in `docs/migrations/002-fourteen-guest-occupancy.sql` for recovery/history. Do not re-run it as a required Preview or Production step.

## Joel: Preview wiring (do not point at the sibling branch)

1. Official Preview Neon branch is `preview/reorg/platform-v1` (`br-damp-wildflower-avtyiin5` / `ep-rapid-bird`), not sibling `reorg-platform-v1` (`ep-long-hall`). See [PREVIEW-DATABASE-SETUP.md](./PREVIEW-DATABASE-SETUP.md).
2. Vercel Preview already uses `CJT_DATABASE_URL` + `CJT_DB_TARGET=preview`. Leave `CJT_ALLOW_PROD_DB` unset on Preview. Neon-managed `DATABASE_URL` still exists; do not rely on it alone.
3. Optional sanity check (SQL editor on `preview/reorg/platform-v1` only):

   ```sql
   SELECT conname, pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conrelid = 'reservations'::regclass
     AND conname = 'reservation_guest_count_valid';
   ```

   Expect guests between 1 and 14.
4. Test one normal request and one 14-guest request on Preview. Confirm the hold exists only on `preview/reorg/platform-v1`, not production `main`.

This docs change does not set Production `CJT_DB_TARGET` / `CJT_ALLOW_PROD_DB`. Those must be set in Vercel before promoting the guarded SHA; not in this PR.

## Production

The occupancy CHECK is already 1–14 on production `main`. Separate Joel approval is still required before promoting application SHAs or changing Production env guards. Do not use this document as a reason to copy Preview connection strings into Production.

Rollback SQL in the migration file still first blocks rollback when any reservation has more than 12 guests, then restores the 1–12 check. Rollback also requires Joel's decision about any affected holds or reservations.
