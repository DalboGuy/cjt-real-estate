# Booking release reconciliation — 2026-09-06

Candidate combines production main `f8a1204` with customer-v3-ops `94bb95a`, then the pricing work from PR #6 (`65e578e`) and PR #9 (`dfc7d80`). The discarded Houfy pricing widget is excluded; reviews remain.

Preserved: communications hub/API/table/indexes, its owner navigation link, and the existing Tawk installation. Added the explicit /communications rewrite and placed Tawk on the routed customer page. Removed the superseded placeholder chat button to avoid overlapping launchers.

Resolved schema conflict using the booking branch's serialized schema initialization with communications statements inside that transaction. Communications now requires an active named owner session, consistent with the combined portal.

Resolved pricing integration conflicts by retaining the current customer form nodes, avoiding duplicate trip-type fields, intercepting the old submit handler, rejecting changed date/guest selections before submission, and preserving guest status links.

## Validation

- Availability validation: PASS (unreadable feeds block inquiry creation).
- Inquiry UI: PASS.
- Pricing controls: PASS (save/readback, failure cases, CSV preview/import, zero-value preservation).
- Pricing API: PASS (changed quote guard, no-write test guards, signed-out denial).
- Pricing UI: PASS, extended to assert existing calendar input references survive, one trip-type field remains, legacy submission does not run, and programmatic date changes invalidate submission.
- All JavaScript and inline scripts: syntax PASS.

These are local regression checks, not deployed database acceptance. Earlier isolated database results are recorded separately in inquiry-acceptance-2026-09-05.md and must not be represented as tests of this combined candidate.

## Before production promotion

Confirm the preview uses an isolated database; do not assume integration-generated branch names override CJT_DATABASE_URL. Verify combined schema initialization, named-owner sign-in, communications access, calendar-to-inquiry path, hold extension/release, CSV import and customer quote on that preview. Ensure current production owner accounts and financial records are preserved. No production database mutation or promotion was performed while preparing this candidate.

The next widget is the Seasonal Pricing playground. Only a screenshot has been provided so far; the ZIP source is needed before integration. Motion tuning controls should be evaluated as editor controls rather than assumed customer-facing controls.
