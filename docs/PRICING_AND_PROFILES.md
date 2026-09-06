# Direct pricing and owner profiles — 2026-09-05

## Direction approved by Joel
Build our own owner pricing controls and direct-booking pricing engine. No third-party channel-management subscription. Future direct platform integrations depend on authorized API access; do not imply iCal publishes prices.

## This release
- Admin-only fixed, dollar and percentage nightly adjustments; inclusive date ranges up to 180 days; weekday filters; Direct Booking destination only.
- Preview before publication; database snapshot conflict detection; atomic rate changes and audit entry; last 30 publications and previewable restore.
- Preserve per-date minimum nights and labels. Discounts/fees remain separate, using the existing quote engine. New rates are $1–$5,000. No demand-based autopilot yet.
- Restore reinstates previous overrides or removes overrides introduced by the publication. Removing an override uses CURRENT base pricing. Restore previews current-versus-result rates; it is a new audited publication.
- Public / customer v3 form now displays availability and all-in quote before inquiry submission. Submitted quote is checked against current pricing; changed pricing requires review again.
- Booking-test page is restricted to its designated preview; unsupported test requests fail before schema or booking work.
- Existing reservation status reads its saved inquiry-created quote. Pricing publications do not mutate reservations or booking events.
- Legacy base-rate/override controls still exist; their older edits are not included in the new publication history. They do invalidate overlapping previews.

## Profiles — recorded requirement, implementation pending
Applies to every owner-side role, currently admin, owner, manager; include future staff/vendor roles when introduced.
- Existing fields: name, email, role, active flag. Add phone and profile photo.
- Suggested optional fields: display name, company/job title, alternate phone, preferred contact method. Confirm need before collecting additional personal details.
- My Profile: edit own contact details and photo. Admin Team: manage authorized users. Role/access changes remain admin-only.
- Email is currently the login identifier: changing it requires uniqueness validation and a verified change flow, not just an editable contact field.
- Photos: authenticated upload, size/type limits, strip metadata, safe storage and initials fallback; never accept arbitrary executable uploads.
- Display contact actions and avatar in Team, task assignment and owner identity. Keep contact details/photos private to authorized users.
- Test all roles, unauthorized edits, photo replacement/removal, mobile layout and login after verified email changes.

## Release gates / remaining work
- Verify Production database target separately from Preview before deployment. Never test rate publication on a potentially live recovery branch.
- Existing guest-schema/backfill issue remains a prerequisite to full guest inquiry UAT; this release does not migrate guest data.
- Existing failed-OTA-feed availability risk remains open; a successful quote does not certify calendar-feed reliability.
- Verify approved tax/fee/discount policy and configured base rates. Existing legacy fee fallback is unchanged.
- Phone UAT: login, pricing preview, publish, quote, restore, refresh, role denial, concurrent editor conflict.
- Future: channel-specific rate storage, connector capability registry, authenticated direct APIs, delivery queue, retries and per-channel verification. External channels stay disabled until implemented and proven.
- Future automatic pricing: explicit rule precedence, floors/ceilings, owner approval and single pricing authority. Current adjustments are owner-directed.

## Validation for this change
- PASS: real PostgreSQL on isolated Neon branch `test-direct-pricing` (`br-round-fog-avfke1th`). Generated SQL executed through the Neon connector after the local HTTP runner stalled. Verified direct quote propagation, concurrent publication (one success / one stale rejection), restoration, audit rollback, minimum-stay preservation and history.
- PASS: jsdom owner and customer controls, disabled external destinations, quote review and invalidation.
- PASS: API quote-change rejection before guest writes, unsupported booking-test rejection, no-write test flow and unauthenticated owner denial.
- Signed-in physical phone UAT and Production deployment remain pending. The test branch is retained for review; no Production pricing or reservations were modified.
- Tests: `node tests/pricing-api.cjs`, `node tests/pricing-ui.cjs` (jsdom required), and `CJT_PRICING_TEST_ISOLATED=1 CJT_DATABASE_URL=<isolated URL> node tests/pricing-adjustments.cjs` (never Production).
