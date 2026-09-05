# Inquiry acceptance checkpoint — 2026-09-05

Status: Built; full booking-cycle acceptance pending. One availability defect reproduced and corrected in this branch; not yet deployed.

## Follow-up verification

Preview deployment `dpl_D4kmaGsVHi4QKdscY8sivgmj4cYs` is READY at commit `91cb752194b98fb93ed4fd9a27864f6ab8d6725c`.

The direct local database connection still could not be used. A test-only SQL transport relayed the application's SQL to the Neon connector, pinned to isolated branch `br-restless-lake-ave8snh6`. Queries and route logic were real; HTTP/Neon-driver transport and live OTA responses were not tested by this method. No production records were changed.

- Main schema initialization: PASS against the isolated database.
- Workflow assertions through Processing, Accept, contract sent, contract signed, deposit recorded, Release Dates, prohibited transitions, and stale-version rejection: PASS. Connector execution serialized the competing updates, so this demonstrates stale-write protection, not simultaneous request timing.
- Original workflow suite stopped at the expired-hold fixture: a previous test already occupied its fixed 2090 dates. This was a fixture collision, not a failed workflow assertion. The suite as a whole must not be reported as passing.
- `tests/inquiry-cycle-isolated.cjs`: PASS on unused 2097 dates. Real inquiry handler created guest schema, guest record, reservation hold, audit event, and status URL. Guest status returned the hold and then released status. Active reservations included the hold before rejection and excluded it afterward. An expired hold rejected acceptance and became expired through expiration processing.
- Browser check: the preview opens the Vercel login page. Signed-in browser acceptance remains pending; preview database isolation must be confirmed before any browser submission.

Next gate: authenticated preview inspection and environment isolation, followed by owner-button/browser refresh checks. Keep PR #10 in draft until those checks are complete.

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
