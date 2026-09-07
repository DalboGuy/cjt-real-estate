# Sand & Sea Manor booking site

Direct-booking page for **Sand & Sea Manor** (1720 Avenue M, Galveston) at [cjtbookingpage.vercel.app](https://cjtbookingpage.vercel.app).

Stack: static HTML + Vercel serverless functions + Neon Postgres. Airbnb, VRBO, and Booking.com iCal feeds stay in sync with the public calendar.

## How booking works

1. The guest picks dates on the calendar and enters **name, email, phone, guests, optional notes**.
2. The page shows a total (nightly rate × nights + cleaning fee + tax).
3. The guest pays **in full** through Stripe Checkout.
4. Payment **secures the dates** (`payment_received`). The calendar blocks them. This is **not** a completed booking and **not** Airbnb Instant Book.
5. Owners send the rental contract (`contract_sent`), the guest signs (`contract_signed`), then owners mark **Confirm booking** (`confirmed`). The guest is emailed that the stay is confirmed.

Checkout-pending rows expire after 30 minutes if Stripe is not completed. Paid stays do not expire.

## APIs

| Path | Purpose |
| --- | --- |
| `GET /api/calendar` | Combined blocked dates (OTA iCal + Neon paid/held stays). Not CDN-cached. |
| `GET /api/quote` | Nightly + cleaning + tax quote for selected dates. |
| `POST /api/checkout` | Create a pending reservation and Stripe Checkout Session. |
| `GET /api/checkout?session_id=` | Payment status after Stripe redirect (server-side Stripe lookup). |
| `POST /api/stripe-webhook` | Stripe webhook. Source of truth for marking `payment_received`. |
| `GET /direct-bookings.ics` | iCal feed of direct bookings for OTA export. |
| `/api/owner` | Owner portal: contract sent → signed → confirmed. |

## Environment variables

Set these in the Vercel project (Production **and** Preview):

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Neon pooled connection string. |
| `STRIPE_SECRET_KEY` | Yes, to take payment | Stripe secret key. If missing, checkout returns **503** with a clear message. |
| `STRIPE_WEBHOOK_SECRET` | Yes, for webhooks | Signing secret for `POST /api/stripe-webhook`. Endpoint URL: `https://<host>/api/stripe-webhook`. Events: `checkout.session.completed`, `checkout.session.expired`. |
| `PUBLIC_SITE_URL` | Recommended | Public origin for Stripe success/cancel URLs, e.g. `https://cjtbookingpage.vercel.app`. Falls back to the request host. |
| `BOOKING_NIGHTLY_RATE` | Optional | Nightly rate in **USD dollars**. Default **450**. |
| `BOOKING_CLEANING_FEE` | Optional | Cleaning fee in **USD dollars**. Default **200**. |
| `BOOKING_TAX_PERCENT` | Optional | Tax percent on lodging + cleaning. Default **15**. |
| `OWNER_PORTAL_PASSCODE` | Owner portal | Shared passcode for `/owner`. |
| `BOOKING_COM_ICAL_URL` | Recommended | Booking.com iCal URL. Airbnb and VRBO URLs are already in code. |
| `RESEND_API_KEY` | For guest email | [Resend](https://resend.com) API key. Payment still succeeds if email is unset or fails. |
| `FROM_EMAIL` | For guest email | Verified Resend from-address. `RESEND_FROM_EMAIL` is also accepted. |

A publishable / `NEXT_PUBLIC_STRIPE_*` key is **not** required. Checkout redirects to the Stripe-hosted session URL.

### Stripe webhook

In the Stripe Dashboard, add an endpoint to `/api/stripe-webhook` and paste `STRIPE_WEBHOOK_SECRET` into Vercel. The webhook marks the reservation `payment_received`. The success page also retrieves the session from Stripe server-side so a delayed webhook still confirms payment. The browser is never trusted alone.

## Local notes

This is a static site; `npm run build` is not required. APIs run as Vercel serverless functions.

The corporate landing page HTML is kept in `cjt_real_estate_site.html`.
