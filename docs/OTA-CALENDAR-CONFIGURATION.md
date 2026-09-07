# OTA Calendar Feed Configuration

Owners can manage Airbnb / VRBO / Booking.com iCal connections in the Owner Portal:

- `/owner-v1/calendar`

Saved connections are stored in Neon (`calendar_feeds`) and never returned to the browser as full URLs. Vercel environment variables remain a valid fallback:

- `AIRBNB_ICAL_URL` (required unless saved in Owner Calendar)
- `VRBO_ICAL_URL` (required unless saved in Owner Calendar)
- `BOOKING_COM_ICAL_URL` (optional)

Resolution order per source: **Vercel env first**, then **Owner Calendar** saved URL.

If a required feed is missing from both places, `/api/calendar` returns HTTP 503 with a configuration error.
