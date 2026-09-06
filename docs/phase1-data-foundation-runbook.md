# Phase 1 Data Foundation Runbook

## Scope

This runbook governs database and identity changes for the CJT direct booking platform before Phase 2 begins.

## Authoritative systems

- Neon/Postgres is the authoritative application database for guests, reservations, booking events, owner operations, pricing, and application state.
- QuickBooks remains the accounting/payment authority.
- OpenSign remains the agreement/signature authority.
- Large files and images should live outside Postgres; Postgres should store metadata and references.
- Airtable is retired and must not be reintroduced without an explicit architecture decision.

## Guest identity policy

- Normalized email is the only automatic guest identity key.
- A phone number may be used to suggest possible duplicates, but must never automatically merge two guests.
- Reservation contact fields remain as a historical snapshot even when the reservation links to a permanent guest record.
- Duplicate merges, when later implemented, must be explicit owner/admin actions with an audit trail.

## Migration rules

1. Make schema changes on `customer-v3-ops` first.
2. Prefer additive, backwards-compatible changes before destructive changes.
3. Use `CREATE ... IF NOT EXISTS`, `ALTER ... ADD COLUMN IF NOT EXISTS`, and idempotent backfills where practical.
4. Do not create test reservations or holds merely to validate a migration.
5. Verify the preview build before any production promotion.
6. Verify database readiness and integrity after the migration.
7. Do not promote to production while a Phase 1 integrity check is false or unverified.
8. For destructive or irreversible migrations, create/verify a restore point or branch before execution and document the rollback procedure.

## Phase 1 integrity checks

The readiness endpoint must report only privacy-safe status values. Phase 1 expects:

- `databaseConfigured: true`
- `guestIdentityMode: email_only`
- `guestDatabaseReady: true`
- `guestBackfillComplete: true`
- `guestLinkIntegrity: true`

No guest counts, emails, phone numbers, reservation IDs, or raw database errors should be returned by the public readiness response.

## Guest backfill expectations

- Every reservation with a non-empty guest email should link to a guest record.
- Multiple reservations with the same normalized email should resolve to the same guest.
- Reservations with different emails should remain separate even if they share a phone number.
- Backfill must not alter reservation dates, occupancy, lifecycle status, hold expiration, pricing, or calendar availability.

## Verification sequence

1. Run JavaScript syntax checks for modified server files.
2. Confirm the Git branch contains no active Airtable helper or inquiry sync path.
3. Confirm the Vercel preview deployment reaches `READY`.
4. Review build errors.
5. Invoke the integration readiness endpoint against the preview environment.
6. Confirm all Phase 1 integrity booleans are true.
7. Run the no-hold booking test route to verify customer booking validation without creating inventory blocks or persistent guest/reservation records.
8. Perform owner user acceptance testing.
9. Record Phase 1 sign-off before starting Phase 2.

## Rollback guidance

### Code rollback

If a preview change fails, move the development branch back to the prior known-good commit or revert the failing commit. Do not promote the failed preview.

### Database rollback

- Additive schema changes can usually remain in place while application code is reverted.
- Do not drop new columns/tables merely to roll back application code unless there is a documented reason.
- For destructive data changes, restore from the pre-migration restore point/branch rather than attempting ad-hoc reverse SQL.
- Verify reservation dates, active statuses, and guest links after restoration.

## Phase 1 exit gate

Phase 1 is complete only when:

- Guest identity matching is email-only.
- Guest schema/backfill/link integrity is verified against the connected database.
- Airtable application dependencies are removed.
- Preview deployment and runtime checks are clean.
- Database restore/branch capability is verified.
- The owner completes the Phase 1 user test and signs off.
