# OTA Calendar Feed Configuration

Owners manage calendar sync in the Owner Portal:

- `/owner-v1/calendar`

## Owner connections

- Up to **10** labeled https iCal URLs can be saved.
- Stored in Neon (`calendar_connections`).
- Full URLs are never returned to the browser (host hint only).

## Vercel env fallback (optional extra sources)

Still supported and merged into availability:

- `AIRBNB_ICAL_URL`
- `VRBO_ICAL_URL`
- `BOOKING_COM_ICAL_URL`

## Resolution

`/api/calendar` blocks dates from **all** configured sources:

1. Any set Vercel env feed URLs
2. All owner-saved connections (max 10)

Owner connections named `owner:1`, `owner:2`, … count toward Airbnb / VRBO / Booking.com health when the saved **label** or **feed URL host** clearly maps to that channel. The calendar API returns `channel`, `label`, and `hostHint` on each source (never the raw feed URL).

If none are configured, `/api/calendar` returns HTTP 503.

## Guest calendar health

The guest date picker does **not** disable every day when a feed is missing or failing. Only past dates and dates in `blockedDates` are disabled. A status message appears when feeds are degraded or unavailable. A hold request still rechecks live availability on submit. Calendar responses stay `Cache-Control: no-store`.
