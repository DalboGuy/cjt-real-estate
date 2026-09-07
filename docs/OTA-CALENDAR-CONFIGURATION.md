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

## Sync Calendars vs connection tests

**Sync Calendars** is the primary owner action (always visible near the calendar title, not inside Connections). It:

1. Re-fetches every configured inbound OTA/iCal source (Airbnb, Vrbo, Booking.com, owner connections)
2. Reloads Direct/CJT reservation and hold state from the database
3. Rebuilds the merged availability snapshot
4. Refreshes the current Month/Week/Year/Day view
5. Updates the compact sync status and this-run timestamps

It does **not** change saved URLs, write to Airbnb/Vrbo APIs, or modify reservations. The button disables while a sync is in flight (`Sync Calendars` → `Syncing…` → `Synced`, or `Sync issue` if any inbound source fails).

**Test all connections** (inside Connections) only probes saved/env iCal URLs for connection health. It does not reload the calendar grid and is not the primary sync.

Last-checked times are the time of that fetch. A last-successful time is recorded only when that fetch succeeded. Failed iCal sources do not invent a prior success time — there is no persisted last-success column. Direct / CJT is always **Live / database**.

## Direct booking fail-closed

`/api/calendar`, `/api/quote`, and `/api/inquiries` require Airbnb and Vrbo feeds (when those sources are configured) to be verified on the server immediately before returning availability or creating a Direct hold. If a required feed cannot be fetched, those APIs return HTTP 503 and do not create a hold. Booking.com is optional. The owner calendar still loads and shows failed sources so the owner can sync or repair them.

Occupancy % counts guest holds, confirmed stays, and OTA/iCal blocks only.

## Locked owner-calendar defaults

These are product defaults unless an owner changes a persisted toggle:

| Setting | Default | Persisted? |
| --- | --- | --- |
| Guest names in the night detail drawer | On | Yes (`show_guest_names`) |
| Guest phone / email | Off | Yes (`show_guest_contact`) |
| 1-day prep / turnover after checkout | Off (opt in) | Yes (`prep_buffer_enabled`) |
| Channel and status filters | All | No (session only) |
| Grid view | Month | Yes (`localStorage` key `cjt.owner.calendar.view`) |

Occupancy strip for the viewed period: Guest occupancy, Guest nights, Arrivals, Departures. Next 30 / Next 90 stay on a compact secondary line. Owner personal stays and manual blocks close nights for guests but do not count as booked. Month view is the default grid; week and day views show that period’s guest occupancy; year view shows the viewed year’s occupancy plus a per-month heat. Availability rules (min/max nights, advance notice, restricted check-in/out) are not applied in this grid — they stay with Pricing.

The owner calendar is not the final booking authority. Direct hold creation always re-checks availability on the server.

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

If a required configured Airbnb or Vrbo feed cannot be verified, `/api/calendar` returns HTTP 503 with empty `blockedDates` (fail closed — it does not fall back to Direct-only dates). If no feeds are configured at all, `/api/calendar` also returns HTTP 503.
