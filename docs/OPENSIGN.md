# OpenSign booking agreements

Status: **Partial / in progress.** This slice wires free OpenSign (sandbox/self-host API) to the existing owner `contract_sent` action. It does not enable Stripe, does not auto-send after owner accept, and does not invent a confirmation gate.

## Assumed trigger (Joel still owns the product decision)

The exact auto-send trigger is still unresolved. **This PR does not invent one.** Send is attached to the existing owner action `contract_sent` (the Owner Portal **Contract Sent** button). Owner accept (`hold_verified`) does not send a document.

`contract_signed` is set only when a verified OpenSign completion webhook matches a stored `opensignDocumentId`. The owner **Contract Signed** button remains as break-glass (`booking_events.metadata.source=owner_manual`).

Approval, contract, payment, and availability stay separate facts. Signature completion does not mark the stay paid or `confirmed`.

## Flow

1. Owner clicks **Contract Sent**.
2. Server runs the #68 owner transition matrix (`planOwnerTransition`) first. Illegal `from` statuses return `invalid_transition` and do **not** send a document.
3. Server fails closed unless `OPENSIGN_API_TOKEN` and `OPENSIGN_TEMPLATE_ID` are set. Missing config returns `opensign_not_configured` / `opensign_template_missing` and does **not** flip the reservation to `contract_sent`.
4. Server loads the reservation plus the latest quote snapshot from `booking_events` and calls OpenSign `POST /createdocument/:template_id` with `x-api-token`, guest name/email, dates, guests, and quoted totals when stored.
5. OpenSign emails the guest (`send_email: true`). The returned document id is stored on the `contract_sent` `booking_events` row (`metadata.opensignDocumentId`). No new reservations column.
6. OpenSign POSTs lifecycle events to `POST /api/opensign`. Only `event=completed` with a valid `x-webhook-signature` and a linked document id sets `contract_signed` + `contract_signed_at`.

## Environment variables (names only)

Set on Vercel **Preview** for sandbox testing. Do not put values in Git. Production values only after Joel accepts the slice.

| Name | Required? | Purpose |
| --- | --- | --- |
| `OPENSIGN_API_TOKEN` | Required to send | Official `x-api-token`. Free-plan **Sandbox** tokens work; live cloud tokens need a paid OpenSign plan. |
| `OPENSIGN_TEMPLATE_ID` | Required to send | Booking-agreement template id in the same OpenSign environment as the token. |
| `OPENSIGN_WEBHOOK_SECRET` | Required to accept completions | Webhook security key from OpenSign Settings → Webhooks (HMAC-SHA256 of the body). |
| `OPENSIGN_API_BASE_URL` | Optional | Defaults to `https://sandbox.opensignlabs.com/api/v1.2`. Set to `https://app.opensignlabs.com/api/v1.2` for live cloud or `{self-host}/api/v1.2` for a self-host that issues API tokens. |
| `OPENSIGN_SIGNER_ROLE` | Optional | Template signer role name. Defaults to `Guest`. Must match the template role. |
| `OPENSIGN_SENDER_NAME` | Optional | Defaults to `CJT Realty`. |

Joel must create these secrets in OpenSign (Settings → API Token, Settings → Webhooks, and a booking-agreement template). This repo does not invent token values.

Webhook URL to paste in OpenSign (Sandbox webhook on the free plan):

`https://<preview-host>/api/opensign`

## Template widgets (optional fill)

If the template widgets use these names, they are prefilled as readonly defaults. Unknown names should be ignored by OpenSign; if a send fails on widgets, rename the template fields to match or drop extras on the template.

`name`, `guest_name`, `email`, `guest_email`, `phone`, `guest_phone`, `checkin`, `check_in`, `checkout`, `check_out`, `guests`, `reservation_id`, `quote_total`, `total`, `lodging_subtotal`, `cleaning_fee`, `taxes`, `nights`, `due_at_booking`

The owner UI still has a public-sign link (`templateid=JGD2FwG4MP`) as a manual fallback. Live and sandbox template ids are not interchangeable.

## What Joel must still decide

- Whether contract send should later auto-trigger after owner accept instead of the manual `contract_sent` action.
- Live vs sandbox vs paid self-host (official FAQ: free self-host does not generate API tokens).
- Exact template widget names / signer role on the real booking-agreement PDF.
- Whether break-glass owner `contract_signed` should be removed after webhook proof is trusted.

Stripe remains on hold. Do not collect live charges from this slice.
