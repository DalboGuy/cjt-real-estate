# Request → owner decision → Complete your booking

Status: **Partial / Needs review** on `grok/request-owner-complete-flow`.

Preview: https://cjtbookingpage-git-grok-request-owner-c-48e57d-jibbailey82-7655.vercel.app

Draft PR: https://github.com/DalboGuy/cjt-real-estate/pull/47

This slice implements JB/Joel’s locked booking workflow through agreement acceptance. Stripe charges and automatic confirmation remain deferred.

## Locked path

`Guest Request to Book → 24-hour hold + owner queue → one owner decision → one Complete your booking link → agreement acceptance`

Owner approval alone does **not** confirm the reservation.

## What this slice does

1. **Check availability → Request 24-hour hold** — guest CTAs start as **Check availability** (header + sticky). After dates and an all-in quote, the same buttons become **Request 24-hour hold (no payment)**. The form submit is **Send hold request — not a confirmed booking**. The guest calendar only disables past dates and nights in `blockedDates`; a degraded Airbnb/VRBO/Booking.com feed shows a status message instead of locking the whole grid. Owner calendar connections satisfy those channels when the label or feed URL maps to them. The server rechecks availability, stores the quote, creates a 24-hour hold, **blocks those nights immediately** on `/api/calendar` and the OTA-facing `.ics` export (`Cache-Control: no-store`, no CDN stale window), and writes a **TAKE ACTION** inbox item on the owner dashboard and Direct Bookings queue. No payment is collected. Copy states the request is not confirmed.
2. **Owner review** — one Direct Booking screen can process, approve, adjust the quote, decline, extend the hold, or release dates. Approval issues one completion link. Preview does not send guest email.
3. **Agreement acceptance** — the completion page shows the final price, documented payment schedule, and rental agreement. Acceptance requires an unchecked “I agree” checkbox and a typed full name. The server records reservation ID, agreement version/content, typed name, and a server timestamp. The label is **Agreement accepted**, not signature/identity verified.
4. **Revised terms** — a material quote or agreement change revokes unused completion tokens and requires acceptance of the new version.

## Deliberately deferred

- Paid e-signature services
- Stripe charges, checkout creation from this flow, simulated successful payments
- Auto-confirm of unpaid bookings
- Guest email delivery
- Production database / `main` changes
- Platform Maps status upgrade (maps update after acceptance)

Documented payment schedule, shown in UI/copy only:

- More than 30 days before arrival: 50% initially; remaining 50% due 30 days before arrival
- Within 30 days: full payment required

Later auto-confirm should occur only when owner approved + agreement accepted + required initial payment verified + valid hold + no availability conflict. No extra “Confirm my reservation” click.

## Distinct booking events

Append-only `booking_events` (do not collapse):

- `request_received`, `request_processing`
- `owner_approved`, `owner_declined`
- `agreement_sent`, `agreement_accepted` (+ version/hash), `agreement_reacceptance_required`
- `payment_pending` (deferred marker)
- `hold_extended`, `hold_expired`, `dates_released`
- Existing quote/payment events remain available for later Stripe work

## Schema

Additive on the Preview/reorganization database via `ensureSchema()`:

- `booking_completion_tokens` — hashed token bound to reservation + agreement hash + quote hash
- `owner_notifications` — in-app owner queue

No production migration is included.

## Configuration handoff (names only)

| Name | Required? | Target | Set by Joel? |
| --- | --- | --- | --- |
| `DATABASE_URL` | Required server secret | Preview | Existing |
| `CJT_DATABASE_URL` | Optional Preview override | Preview | Existing if Preview overrides Neon-managed URL |
| `CJT_DB_TARGET` | Required for Preview (`preview`) | Preview | Existing |
| `CJT_ALLOW_PROD_DB` | Production only; must not be set on Preview | Production | Existing |
| `OWNER_PORTAL_PASSCODE` | Required for owner writes | Preview | Existing |
| `PUBLIC_SITE_URL` | Optional stable completion-link origin | Preview | Optional |
| `STRIPE_SECRET_KEY` | Unused by this slice | — | Do not enable for this path |
| `STRIPE_WEBHOOK_SECRET` | Unused by this slice | — | Do not enable for this path |
| `STRIPE_PUBLISHABLE_KEY` | Unused by this slice | — | Do not enable for this path |

Never store values in Git.

## Local verification

```bash
node scripts/verify-booking-completion.js
node scripts/verify-pricing-catalog.js
```
