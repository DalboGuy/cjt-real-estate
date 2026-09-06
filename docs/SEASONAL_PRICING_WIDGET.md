# Seasonal Pricing widget (draft)

Added on `feature/seasonal-pricing-widget` from `integration/booking-release` @ `be013404ddf0`.

## What changed
- Added `widget/seasonal-pricing.css`, `widget/seasonal-pricing.js`, `widget/sample-data.js`, `widget/data-adapter.js`
- Added `demo/seasonal-pricing-demo.html` (motion knobs demo-only)
- Mounted a new section between `#availability` and `#book` on `index.html` and `v3.html`
- Customer widget uses **sample data** with a visible “Sample data — not live pricing” badge until a live list API exists

## Do not
- Merge/deploy without Preview review
- Change `/api/quote`, inquiries, taxes/fees, or owner auth as part of this widget
- Ship sample data to production without the badge (or swap to live overrides)

## Live data gap
`POST /api/quote` remains the stay-specific pricing path. There is still no public seasonal list endpoint. Optional follow-up: `GET /api/seasonal-rates` aggregating `pricing_overrides` (see `widget/data-adapter.js`).


## Screenshots
- Desktop: `docs/seasonal-pricing/desktop.png`
- Mobile: `docs/seasonal-pricing/mobile.png`

## Test results (2026-09-06)
- PASS: `node --check` on `widget/seasonal-pricing.js`, `sample-data.js`, `data-adapter.js`
- PASS: adapter smoke — contiguous matching label/rate/min_nights rows merge into seasons
- PASS: headless demo screenshots captured (sample-data badge visible)
- NOT RUN against live Neon / production quote path (by design — no API/schema changes)
- Feature status: **Needs review** (sample data; awaiting live list API or explicit sample approval)
