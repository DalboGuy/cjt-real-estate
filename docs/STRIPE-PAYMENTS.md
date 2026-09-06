# Stripe payment loop

Status: **Partial / Needs review** for Issue #21. This branch adds a fail-closed Checkout Session, webhook/verification path, stored payment events, and a final guest confirmation gate. It does not represent live Stripe acceptance until Joel configures a preview Stripe account and tests a real payment in the preview database.

## Flow

1. The server loads the latest quote stored in `booking_events`, including the existing payment schedule. The browser never supplies an amount.
2. `POST /api/payments` with `action=create_checkout`, `reservationId`, `email`, and optional `paymentType` (`deposit` or `balance`) creates a Stripe Checkout Session. The amount is derived server-side from `dueAtBooking`, `remainingBalance`, or `total` in the stored quote.
3. Stripe sends `checkout.session.completed` to the same endpoint. The webhook signature is checked with `STRIPE_WEBHOOK_SECRET`.
4. The guest return page calls `action=verify`; the server retrieves the Checkout Session from Stripe and checks paid status, currency, reservation metadata, and the exact stored checkout amount before recording `payment_verified`.
5. The guest explicitly selects **Confirm my reservation**. `action=confirm` is fail-closed unless a matching verified payment event exists. The reservation status becomes `confirmed` and the deposit timestamp is recorded.

Payment state is recorded as append-only `booking_events` metadata so the preview schema remains additive and existing quote/pricing formulas are unchanged. Owner `Deposit Received` is also blocked unless a verified payment event exists.

## Environment configuration

Joel must set these in the Vercel **Preview** environment for a preview Stripe test account (and separately in Production only after acceptance):

- `STRIPE_SECRET_KEY` — **required server secret**; never put in Git or browser code.
- `STRIPE_WEBHOOK_SECRET` — **required for webhook verification**; never put in Git.
- `STRIPE_PUBLISHABLE_KEY` — **optional for this server-hosted Checkout slice**; reserved for a future Elements flow and not read by the current implementation.
- `PUBLIC_SITE_URL` — optional; when absent, the server derives the request host for Checkout return URLs. Set this to the preview URL when using a stable Stripe configuration.

Stripe webhook endpoint: `https://<preview-host>/api/payments`, subscribed to `checkout.session.completed`. Use Stripe test mode for preview. Do not point preview at production `DATABASE_URL`; retain the existing `CJT_DB_TARGET=preview` guard.

## Known limitations / remaining Partial work

- No live Stripe transaction has been run by this branch; webhook delivery, return URL, refunds, and balance collection remain Joel's preview acceptance work.
- Checkout link distribution is not yet a guest email workflow; an owner or an existing guest-facing integration must send the returned `checkout.url`.
- The existing contract/signature flow remains external and is not made a prerequisite for the final payment confirmation.
- Refunds, cancellations, receipts, and payout reconciliation are not implemented.
- Payment events are append-only audit records; a future migration may normalize booking financials/payment intents.
- `STRIPE_PUBLISHABLE_KEY` is documented but unused until a browser-based Stripe Elements flow is intentionally added.
