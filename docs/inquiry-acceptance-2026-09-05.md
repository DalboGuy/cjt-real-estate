# Inquiry acceptance checkpoint — 2026-09-05

Status: Built; full booking-cycle acceptance pending. One availability defect reproduced and corrected in this branch; not yet deployed.

Production inspected: `3bdeb187463b0e9b97f41fcfe39227484ccb7fe6`, deployment `dpl_3xxKv9JpM7SpKsKuDVG8aJUDLU7r`.

## Confirmed defect and correction

An HTTP 200 HTML error page was accepted as an empty OTA calendar. Airbnb and Vrbo were both reported healthy with zero blocked days. This defeats the inquiry handler's existing feed-health check.

The parser now rejects missing calendar boundaries, incomplete event boundaries, invalid dates, and reversed event ranges. Valid empty calendars remain supported, and checkout is still exclusive. No real OTA feed, reservation, guest message, contract, or payment was changed.

## Evidence

- `node tests/availability-validation.cjs`: PASS. Six malformed-feed cases return 503 at the inquiry handler before guest/reservation writes. A valid occupied range returns 409. A valid empty calendar remains healthy.
- `node tests/inquiry-ui.cjs`: PASS. Rendering, escaping, authenticated action payload, closed history, and calendar-to-inquiry paths (JSDOM, not a full browser).
- `node --check lib/availability.js`: PASS.
- Database workflow test: BLOCKED by local network timeout connecting to Neon, including a retry with the configured network proxy. This is an execution-environment limitation, not evidence of an application database failure.
- Read-only Neon connector inspection of isolated branch `br-restless-lake-ave8snh6` succeeded: reservations and guest_access_tokens exist; guests does not. The application has guest schema initialization, but it has not been verified in this run.

## Remaining acceptance gates

1. Guest inquiry creates a 24-hour hold, guest record, audit event, quote snapshot, and working status URL.
2. Processing, Accept, Maintain Hold, contract sent/signed, and deposit recorded persist after reload; invalid transitions fail.
3. Reject, Release Dates, and expiration remove the direct hold from availability; external OTA blocks remain independently blocked.
4. Concurrent/stale owner edits cannot silently overwrite each other, and duplicate inquiries cannot claim overlapping dates.
5. Verify the signed-in browser experience, status page, and calendar refresh/cache behavior against a dedicated preview and isolated database.

Do not mark the full workflow accepted or interpret milestone buttons as sending contracts, collecting money, or notifying guests. This branch makes no such integrations.

## Follow-up findings

- Feed requests have no explicit timeout; investigate bounded fetches within deployment execution limits.
- Configured Houfy feed failures are not included in the required-source lists; confirm whether that feed is authoritative and align both inquiry and calendar policies.
- Guest schema initialization runs separately from the main schema lock; verify concurrent first requests before production backfill.
- Keep the isolated test database branch until the remaining acceptance tests are run. It uses 0.25 CU with five-minute autosuspend; remove it when no longer needed.
