# OTA Calendar Feed Configuration

Owners manage calendar sync in the Owner Portal:

- `/owner-v1/calendar`

## Owner calendar view

The same page is the property calendar (month/week grid) and the iCal connection manager.

Nights are assembled from:

1. Direct Neon holds and confirmed bookings
2. Merged OTA / owner iCal blocks (env feeds + up to 10 owner connections)
3. Owner personal stays
4. Manual blocks (maintenance / blackout)
5. Optional 1-day prep/turnover after a guest checkout (default **off**)

Identical env + owner iCal URLs are fetched once so the same channel does not paint twice. Overlaps between *different* channels (for example Direct + Airbnb on one night) show as conflicts.

Manual blocks and owner stays are stored in Neon (`owner_calendar_entries`) and included in guest availability so `/api/calendar`, `/api/quote`, and `/api/inquiries` cannot book those nights. Owner stays are excluded from occupancy percentages.

The exported CJT `.ics` includes direct bookings, owner stays, manual blocks, and (when enabled) prep nights after *direct* checkouts. Live Airbnb/VRBO outbound API push stays paused.

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
