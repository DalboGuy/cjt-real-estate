# Public Image Pipeline — Acceptance Record

Issue: [#12 Build stable public booking image pipeline](https://github.com/DalboGuy/cjt-real-estate/issues/12)  
Branch: `grok/public-image-pipeline`  
Status: **Needs review** (not Built)

## What changed

- Added canonical manifest: `assets/data/public-image-manifest.json`
- Published static read-only JPEGs under `assets/images/public/{opening,gallery,rooms}/`
- Guest booking runtime (`booking-v2.html`, `assets/js/booking-listing.js`, `assets/js/booking-v2.js`) loads images from the manifest `publicPath` values only
- Removed Google Drive thumbnail URL construction and the guest-runtime Drive fallback chain from active scripts
- Preserved Drive-era scripts as rollback: `booking-listing.drive-legacy.js`, `booking-v2.drive-legacy.js`

## Deliberately not changed

- Pricing / quote / inquiry APIs and UI logic
- Reservations / booking_events
- Payments / Stripe
- Authentication
- Review content
- Amenities content
- Map interaction behavior (only aerial `<img src>` delivery path)
- `main` and production data

## Opening photos preserved (owner-approved order from Sep 5, 2026)

1. Private hot tub — `19qVu5W92D3HZ98fmkJtYWkon10RoQb9A`
2. Historic front exterior at sunset — `1fQ5o4coCkKLHd-T7TVT7IVuJ6s3gWYCu`
3. Oversized family room — `1S_cxUhVmopWmuDoEZViX4QDXg94JKb_f`
4. Fire-pit seating — `1YCvLJWjz6csiaFDEnlpoi7zGQdEOtuAq`
5. Second living room — `1mou-dVzjGrc41Ws9WnSB2k5dvriLoYhV`
6. Breakfast table and kitchen island — `1z3V_SUJMrVu_Ciw-m2HOUk4nTWkouVMO`

## Bedroom groupings preserved

- Master Bedroom (5)
- Boho Room (2)
- Glam Room (2)
- Flex Room (2)
- Bunk Room (1)

## Acceptance checklist

| Criterion | Result |
| --- | --- |
| Exact owner-approved six opening photos render anonymously | Pending Vercel preview visual check |
| Bedroom photos render anonymously | Pending Vercel preview visual check |
| No public writer permission required | Pass — static repo assets, read-only HTTP |
| No Drive thumbnail fallback chain in guest runtime | Pass — grepped active booking JS/HTML for `drive.google.com/thumbnail` / `thumb(` |
| One canonical asset manifest | Pass — `assets/data/public-image-manifest.json` |
| Rollback path preserved | Pass — `*.drive-legacy.js` retained, documented |
| Vercel preview supplied | Pending — URL after deploy |
| No unrelated page changes | Pass — scoped to image delivery + docs |

## Test plan (to run on preview)

1. Open preview logged out / private window (desktop).
2. Confirm six-photo mosaic matches the owner-approved set and loads without Drive requests (Network panel).
3. Open full gallery filters; confirm images load from `/assets/images/public/...`.
4. Open each room card; confirm folder names and photo counts.
5. Confirm aerial cards still draw map lines; only image bytes changed.
6. Repeat mosaic + rooms on mobile width.
7. Confirm booking quote / calendar / Book Now still function (smoke).

## Data / schema impact

None.

## Production impact

None while unmerged. Do not merge to `main` as part of this PR. Integration target is `reorg/platform-v1` only.

## Known limitations

- Two bathroom gallery Drive files were not found at publish time (`1X3hp-PjGqeo8QYBluU4-FDOxXmfAw4k8`, `1l-gDbm4blFAKAq6zwcVmXqD6RABJWD0K`); they are omitted from the live gallery until the owner re-supplies them.

- Visual anonymous acceptance is incomplete until a Vercel preview is exercised.
- Gallery entries that previously relied on private Drive copies are published from their verified public-original bytes (same mapping formerly used as runtime fallback); provenance IDs remain in the manifest.
- Image optimization is for web delivery (resized JPEG); originals remain in Drive as editorial source.
- Platform Maps status must not be upgraded until Joel accepts this feature.

## Rollback

Point `booking-v2.html` scripts back to:

- `/assets/js/booking-listing.drive-legacy.js`
- `/assets/js/booking-v2.drive-legacy.js`

Or revert the PR on `grok/public-image-pipeline`.
