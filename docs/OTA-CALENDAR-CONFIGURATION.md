# OTA Calendar Feed Configuration

Status: **Needs review** — Joel must set the protected Vercel environment variables before availability can be accepted.

The server-side availability service reads private iCal feed URLs from Vercel environment configuration. Feed values must not be committed, documented, logged, or exposed to browser code.

## Required variables

Set these in every Vercel environment that serves the booking calendar (Preview and Production):

- `AIRBNB_ICAL_URL`
- `VRBO_ICAL_URL`

## Optional variable

- `BOOKING_COM_ICAL_URL` — enables the existing optional Booking.com iCal source when configured.

If either required variable is missing, `/api/calendar` returns HTTP 503 with a configuration error and does not invent a fallback feed. When the variables are configured, the existing iCal date aggregation behavior is preserved. No database or schema change is required.
