# OTA Calendar Feed Configuration

Owners manage calendar sync in the Owner Portal:

- `/owner-v1/calendar`

## Owner calendar view

The same page is the property calendar (month / week / year / day) and the iCal connection manager. Year is a compact occupancy heat of all twelve months. Day is an agenda list for the focused date. Prev/next step by the active mode; month and year dropdowns jump without leaving the page.

Nights are assembled from:

1. Direct Neon holds and confirmed bookings
2. Merged OTA / owner iCal blocks (env feeds + up to 10 owner connections)
3. Owner personal stays
4. Manual blocks (maintenance / blackout)
5. Optional 1-day prep/turnover after a guest checkout (default **off**)

Identical env + owner iCal URLs are fetched once so the same channel does not paint twice. Overlaps between *different* channels (for example Direct + Airbnb on one night) show as conflicts.

Manual blocks and owner stays are stored in Neon (`owner_calendar_entries`) and included in guest availability so `/api/calendar`, `/api/quote`, and `/api/inquiries` cannot book those nights. Occupancy % counts guest holds, confirmed stays, and OTA/iCal blocks only.

The exported CJT `.ics` includes direct bookings, owner stays, manual blocks, and (when enabled) prep nights after *direct* checkouts. Live Airbnb/VRBO outbound API push stays paused.

## Locked owner-calendar defaults

These are product defaults unless an owner changes a persisted toggle:

| Setting | Default | Persisted? |
| --- | --- | --- |
| Guest names in the night detail drawer | On | Yes (`show_guest_names`) |
| Guest phone / email | Off | Yes (`show_guest_contact`) |
| 1-day prep / turnover after checkout | Off (opt in) | Yes (`prep_buffer_enabled`) |
| Channel and status filters | All | No (session only) |
| Grid view | Month | Yes (`localStorage` key `cjt.owner.calendar.view`) |

Occupancy strip: guest holds + confirmed direct + OTA blocks. Owner personal stays and manual blocks close nights for guests but do not count as booked. Month view is the default grid; week and day views show that week’s guest-night occupancy; year view shows the viewed year’s occupancy plus a per-month heat. Availability rules (min/max nights, advance notice, restricted check-in/out) are not applied in this grid — they stay with Pricing.

Guest phone and email are omitted from the owner calendar API unless `show_guest_contact` is on. Guest names are included only when `show_guest_names` is on, and the UI shows them in the night detail drawer (not on the grid or upcoming list).

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
