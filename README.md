# Sand & Sea Manor booking site

Direct-booking page for **Sand & Sea Manor** (1720 Avenue M, Galveston) at [cjtbookingpage.vercel.app](https://cjtbookingpage.vercel.app).

Stack: static HTML + Vercel serverless functions + Neon Postgres. Airbnb, VRBO, and Booking.com iCal feeds stay in sync with the public calendar.

## How a hold works

1. A guest picks dates and submits `/api/inquiries`.
2. If the nights are free on OTA calendars **and** in Neon, the API inserts an `inquiry_hold` for **24 hours**.
3. That hold is **not** a confirmed reservation. No payment is collected on the site.
4. Active holds (`inquiry_hold`, `hold_verified`, `contract_sent`, `contract_signed`, `confirmed`) appear immediately as blocked dates on `GET /api/calendar`.
5. CJT uses the owner portal to maintain the hold, send the agreement, and mark the deposit. Only then is the stay confirmed.

## APIs

| Path | Purpose |
| --- | --- |
| `GET /api/calendar` | Combined blocked dates (OTA iCal + Neon holds). Not CDN-cached. |
| `POST /api/inquiries` | Place a 24-hour inquiry hold. |
| `GET /direct-bookings.ics` | iCal feed of direct holds for OTA export. |
| `/api/owner` | Owner portal session and reservation workflow. |

## Environment variables

Set these in the Vercel project (Production **and** Preview):

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Neon pooled connection string. Used by inquiries, calendar, owner portal, and the direct iCal feed. |
| `OWNER_PORTAL_PASSCODE` | Owner portal | Shared passcode for `/owner`. |
| `BOOKING_COM_ICAL_URL` | Recommended | Booking.com iCal URL. Airbnb and VRBO URLs are already in code. |
| `RESEND_API_KEY` | For guest email | [Resend](https://resend.com) API key. If missing, holds still succeed; email is skipped and logged. |
| `FROM_EMAIL` | For guest email | Verified Resend from-address, e.g. `Sand & Sea Manor <bookings@yourdomain.com>`. `RESEND_FROM_EMAIL` is also accepted. |

### Guest confirmation email

After a successful hold, `POST /api/inquiries` attempts a plain-text confirmation via Resend. The hold still returns **201** if send fails or if email is not configured.

```
RESEND_API_KEY=re_...
FROM_EMAIL=Sand & Sea Manor <bookings@yourdomain.com>
```

## Local notes

This is a static site; `npm run build` is not required. APIs run as Vercel serverless functions.

The corporate landing page HTML is kept in `cjt_real_estate_site.html`.
