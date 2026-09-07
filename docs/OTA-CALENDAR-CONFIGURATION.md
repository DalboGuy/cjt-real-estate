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

If none are configured, `/api/calendar` returns HTTP 503.
