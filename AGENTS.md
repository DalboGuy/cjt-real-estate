# CJT Realty Agent Operating Rules

This repository is shared work for the CJT Realty platform. These rules apply to ChatGPT, Grok, Claude, Gemini, Codex, and any other coding agent.

## Read before changing code

1. Read `docs/PLATFORM-V1-ARCHITECTURE.md`.
2. Read `docs/PLATFORM-MAPS.md`.
3. Read the GitHub Issue for the feature you are assigned.
4. Read `docs/AI-COLLABORATION.md`.
5. If the issue touches the current repair effort, read `docs/REPAIR-BACKLOG-2026-09-06.md`.

## Branching and ownership

- Never work directly on `main`.
- Do not work directly on `reorg/platform-v1` unless Joel explicitly requests it.
- One feature or repair per branch.
- Branch names identify the agent and task, for example `chatgpt/platform-map-reconciliation` or `grok/public-image-pipeline`.
- Do not edit another agent's branch unless the Issue or PR explicitly requests cross-agent repair.

## Production guardrails

- Production Git checkpoint and production database must remain unchanged unless Joel explicitly approves a production cutover or migration.
- Do not point preview deployments at production data when a safe development branch is available.
- Database experiments belong on the Neon reorganization branch or disposable child branches.
- Never hardcode secrets, credentials, signed URLs, API tokens, iCal secrets, or connection strings in source or documentation.
- Public website assets must be read-only to anonymous users. Do not grant public write access.

## Source of truth

- After reconciliation, `docs/PLATFORM-MAPS.md` is the architecture/release ledger.
- GitHub Issues define feature scope and acceptance criteria.
- Code implements the accepted Issue scope.
- Vercel preview is a test surface, not proof of acceptance.
- A feature is not `Built` until its acceptance criteria have been tested.

## Change discipline

- Do not mix unrelated feature work in one branch or PR.
- Do not silently rewrite adjacent modules.
- Prefer one canonical implementation over runtime patches, duplicate markup, or duplicated data definitions.
- Reuse existing working business logic unless the Issue explicitly calls for a rewrite.
- Preserve rollback paths until the replacement is accepted.
- Do not infer property facts, room configurations, policies, fees, review data, or external-provider behavior. Use owner-approved facts or verified sources.

## Required PR handoff

Every PR must state:

1. What changed.
2. Files changed.
3. What was deliberately not changed.
4. Acceptance criteria and test results.
5. Data/schema impact.
6. Production impact.
7. Known limitations.
8. Vercel preview URL when available.
9. Configuration handoff: exact environment-variable names only, required versus optional status, target Vercel environments, and whether Joel has set them; never include values.

If any acceptance criterion is unverified, mark the feature `Partial` or `Needs review`, not `Built`.


## Issue handoff — Request / owner / complete-booking flow

- **Branch/PR status:** Partial / Needs review. Preview-ready for request, owner approval, completion link, and agreement acceptance. Do not mark Built until Joel walks the preview path.
- **What changed:** Guest CTAs are **Check availability** until dates + quote, then **Request 24-hour hold (no payment)**. Submit is **Send hold request — not a confirmed booking** (no Book Now). The hold immediately blocks those nights on the public calendar and OTA-facing `.ics` export (`no-store`, no CDN stale window), and opens a **TAKE ACTION** inbox on the owner dashboard and Direct Bookings queue. One owner review screen can process, approve, adjust the quote, decline, extend the hold, or release dates. Approval issues one `Complete your booking` link. Guests accept the rental agreement with an unchecked checkbox plus typed full name. Acceptance is labeled **Agreement accepted**, not signature/identity verified. Stripe charges and auto-confirm stay deferred. Guest calendar health does not fail-close every day.
- **Files changed:** `lib/agreement.js`, `lib/booking-lifecycle.js`, `lib/db.js`, `api/inquiries.js`, `api/owner.js`, `api/complete-booking.js`, `complete-booking.html`, `assets/js/complete-booking.js`, `assets/css/complete-booking.css`, `assets/js/booking-listing.js`, `assets/js/reservations-v1.js`, `booking-v2.html`, `owner-v1/reservations.html`, `vercel.json`, `scripts/verify-booking-completion.js`, `docs/REQUEST-OWNER-COMPLETE-FLOW.md`.
- **Environment names:** existing Preview database guards only (`DATABASE_URL` / `CJT_DATABASE_URL`, `CJT_DB_TARGET`, `CJT_ALLOW_PROD_DB`). Optional `PUBLIC_SITE_URL` for stable completion-link origin. `OWNER_PORTAL_PASSCODE` remains required for owner writes. Stripe names are unused by this slice.
- **Data/schema impact:** Additive Preview tables `booking_completion_tokens` and `owner_notifications`. Append-only `booking_events` types added. No production migration.
- **Known limitations:** No guest email is sent from Preview. Payment collection, payment-verified events that confirm a stay, and auto-confirm remain deferred. Paid e-sign is intentionally not used.
- **Production impact:** No production database or `main` branch changes.

## Issue #21 handoff — Stripe payment and confirmation loop

- **Branch/PR status:** Partial / Needs review; do not mark Built until Joel runs Stripe test-mode checkout and webhook acceptance on a preview database.
- **What changed:** Added server-derived Checkout Session creation, Stripe webhook and session verification, append-only payment status events, owner confirmation gating, and a guest return/confirmation page.
- **Files changed:** `api/payments.js`, `lib/payments.js`, `api/owner.js`, `assets/js/reservations-v1.js`, `payment-confirmation.html`, `assets/js/payment-confirmation.js`, `docs/STRIPE-PAYMENTS.md`.
- **Environment names:** `STRIPE_SECRET_KEY` (required server secret), `STRIPE_WEBHOOK_SECRET` (required webhook secret), `STRIPE_PUBLISHABLE_KEY` (documented optional/future), `PUBLIC_SITE_URL` (optional stable return URL). Values are not stored in Git.
- **Data/schema impact:** No migration; payment state is recorded in existing `booking_events.metadata`. Preview database isolation and pricing formulas are unchanged.
- **Known limitations:** Joel must configure a preview Stripe test account/webhook and perform a real test. Email delivery, refunds, cancellation/refund handling, receipts, payout reconciliation, and contract/signature integration remain outside this slice.
- **Production impact:** No production database or `main` branch changes. Do not set production Stripe/database configuration until preview acceptance is complete.
