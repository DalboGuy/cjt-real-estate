# CJT Platform Current State — 2026-09-05

This document records the pre-reorganization state of the CJT Real Estate platform. It is intentionally descriptive rather than prescriptive. Secrets, passwords, private tokens, database credentials, and API keys are not copied here.

## Phase 0 checkpoint

- Source repository: `DalboGuy/cjt-real-estate`
- Production/source commit at checkpoint: `f8a120462db36b27df898a9f400a8cefda6c5239`
- Commit message: `Link owner portal to communications hub`
- Default branch: `main`
- Frozen code checkpoint branch: `archive/pre-reorg-2026-09-05`
- Reorganization working branch: `reorg/platform-v1`
- Additional equivalent backup branches were also created at the same source commit during checkpointing. They should remain untouched until cleanup is intentionally approved.
- Git tag creation is not available through the currently connected GitHub action set. The immutable commit SHA plus frozen archive branch are the authoritative code checkpoint.

## Production hosting

### Vercel

- Project: `cjtbookingpage`
- Project ID: `prj_RA3FoRngijSTIB6dfRG5dTySLCfb`
- Team ID: `team_cLgJgb77IZOSv1YEXZhwVHUx`
- Current production deployment at checkpoint: `dpl_DYcXqxGTaBgKkuEc5snrmmcBu8uC`
- Deployment state: `READY`
- Deployment source commit: `f8a120462db36b27df898a9f400a8cefda6c5239`
- Main production domain: `cjtrealty.com`
- Vercel project domain: `cjtbookingpage.vercel.app`

Verified HTTP routes at checkpoint:

- `https://cjtrealty.com/` — 200 OK
- `https://cjtrealty.com/owner` — 200 OK
- `https://cjtrealty.com/communications` — 200 OK

## Current public experience

### `/`

Public Sand & Sea Manor booking page. Current capabilities:

- Property marketing content and photography
- 5-bedroom / sleeps-12 property presentation
- Hot tub and fire-pit references
- Availability calendar
- Airbnb and Vrbo calendar consolidation
- Optional Booking.com iCal support through environment configuration
- Direct inquiry / 24-hour temporary-hold workflow
- Footer link to `/owner`
- tawk.to website chat widget

The public page currently contains significant inline CSS and inline JavaScript.

## Current owner experience

### `/owner`

Current page title: `CJT Owner Portal`

Current role:

- Owner passcode login
- Direct-booking dashboard
- Reservation lifecycle controls
- Maintain hold
- Open OpenSign
- Mark contract sent
- Mark contract signed
- Mark deposit received
- Release dates
- Link to `/communications`

This page is currently a standalone HTML page with its own embedded CSS and JavaScript.

### `/communications`

Current page title: `CJT Communications`

Current role:

- Protected by the owner session
- Platform summary counts
- Filters for Airbnb, Vrbo, Booking.com, Houfy, Open, and Archived
- Search
- Read/unread state
- Archive/reopen state
- Open OTA thread link
- Open Gmail link
- Return link to `/owner`

Important limitation at checkpoint:

- The Communications Hub is built, but there is no automatic Gmail-to-Neon ingestion yet.
- The only current data is manually seeded test/current-state data.

## Current repository layout

Top-level items at checkpoint:

- `README.md`
- `api/`
- `cjt_real_estate_site.html`
- `communications.html`
- `direct-bookings.json`
- `index.html`
- `lib/`
- `owner.html`
- `package.json`
- `vercel.json`

### API files

- `api/calendar.js`
- `api/communications.js`
- `api/direct-bookings.js`
- `api/inquiries.js`
- `api/owner.js`

### Shared library files

- `lib/availability.js`
- `lib/db.js`

## Routing and deployment configuration

`vercel.json` currently includes clean URLs and rewrites for direct-booking calendar feeds.

Current serverless functions include calendar, direct-bookings, inquiries, owner, and communications-related endpoints.

## Database checkpoint

### Neon

- Project: `cjt-booking-db`
- Project ID: `lucky-frost-76254444`
- Default branch: `production`
- Branch ID: `br-frosty-sun-aeff11ss`
- Database: `neondb`
- Manual pre-reorganization snapshot: `pre-reorg-2026-09-05`
- Snapshot ID: `snap-twilight-firefly-aer3w836`
- Snapshot created: `2026-09-05T22:35:54Z`

### Verified schema at checkpoint

The inspected production database currently exposes one application table in the `public` schema:

- `communications_messages`

The table contains fields for:

- Gmail/message ID
- thread ID
- platform
- message type
- guest name
- subject/body/snippet
- stay dates
- reservation reference
- platform thread URL
- Gmail URL
- source email
- reply-to relay
- received timestamp
- read state
- open/archive status
- created/updated timestamps

Current message totals at checkpoint:

- Airbnb: 2 messages / 2 unread
- Vrbo: 1 message / 1 unread
- Total: 3 messages

### Important schema discrepancy to resolve before migration

`lib/db.js` contains code that can create additional tables such as reservations, booking events, and owner sessions lazily at runtime. Those tables were not present in the inspected `neondb` schema when this checkpoint was taken.

Before any schema redesign, confirm whether:

1. Production runtime is pointed at this exact Neon database/branch, and
2. the missing tables are intentionally lazy-created and simply have not been instantiated in this inspected branch, or
3. a different database/connection has been used by part of the live application.

Do not assume the current schema is complete until this discrepancy is resolved.

## Current environment/configuration names

Known configuration names referenced by code include:

- `DATABASE_URL`
- `OWNER_PORTAL_PASSCODE`
- `AIRBNB_ICAL_URL`
- `VRBO_ICAL_URL`
- `BOOKING_COM_ICAL_URL` (optional)

No secret values are stored in this document.

### Security/configuration note

Airbnb and Vrbo iCal feed values are protected Vercel environment configuration, not repository source. `AIRBNB_ICAL_URL` and `VRBO_ICAL_URL` are required for availability; `BOOKING_COM_ICAL_URL` remains optional. See `docs/OTA-CALENDAR-CONFIGURATION.md` for the configuration handoff. If a required feed variable is missing, `/api/calendar` fails closed with a clear configuration error rather than inventing or using a fallback feed.

## Gmail / OTA organization

Connected mailbox used for OTA operations:

- `cjtrealestateholdings@gmail.com`

Verified Gmail labels:

- `OTA`
- `OTA/Airbnb Messages`
- `OTA/Airbnb Reservations`
- `OTA/Booking.com Messages`
- `OTA/Houfy Messages`
- `OTA/Vrbo Messages`

At checkpoint, the labels exist but currently show zero messages because they were configured for new incoming traffic and were not backfilled.

Current selective filter design:

- Airbnb guest messages: `from:express@airbnb.com`
- Airbnb reservation events: selected subjects from `automated@airbnb.com`
- Vrbo guest/reservation messages: `from:sender@messages.homeaway.com`
- Booking.com: no broad guest-message filter yet
- Houfy: no broad guest-message filter yet

Global Gmail forwarding should remain disabled. Selective filters only should be used.

## OTA reply behavior discovered

### Airbnb

Airbnb guest-message emails include a platform conversation link and a per-thread `@reply.airbnb.com` relay address.

### Vrbo

Vrbo messages include a platform response URL and a thread-specific `@messages.homeaway.com` relay address.

### tawk.to limitation

Forwarding OTA notification email into tawk.to does not preserve the OTA reply target in a way that supports safe two-way OTA replies. In testing, tawk.to presented the CJT Gmail account as the reply target.

Therefore current design intent is:

- tawk.to for direct website chat and direct support
- Owner Communications module for OTA visibility/triage
- official OTA thread link for OTA replies unless a verified safe integration is added later

## tawk.to integration

Current public-site chat integration:

- Property ID: `6a9c721ed0128c3449822367`
- Website: `https://cjtrealty.com`
- Ticket forwarding address: `tickets@cjtrealty.p.tawk.email`
- Public page contains the tawk.to embed

Do not store private API keys or secrets in repository documentation.

## Current architecture problems motivating reorganization

1. Public and owner pages are mixed at repository root.
2. Owner Portal and Communications are separate standalone HTML pages rather than modules under one application shell.
3. CSS and JavaScript are duplicated inline across pages.
4. Domain concepts such as property, guest, reservation, channel, conversation, and financial transaction are not yet normalized across one shared data model.
5. Communications ingestion is not automated.
6. Some configuration is hardcoded instead of environment-driven.
7. Current database state needs reconciliation with the schema expected by application code.
8. Future modules would become difficult to maintain if added to the present structure without refactoring.

## Reorganization guardrails

The following rules apply during Platform v1 work:

- `main` remains the known production source until a deliberate cutover.
- `archive/pre-reorg-2026-09-05` remains frozen.
- Neon snapshot `snap-twilight-firefly-aer3w836` must not be deleted during reorganization.
- Reorganization work occurs on `reorg/platform-v1` or child feature branches.
- No destructive database migration is applied without explicit review and approval.
- Do not copy secrets into GitHub.
- New modules should live under the Owner Portal application shell.
- Dashboard widgets summarize; full modules manage.
- Preserve rollback capability throughout the migration.

## Planned Platform v1 module map

Owner Operations target structure:

- Dashboard
- Communications
- Reservations
- Calendar
- Pricing
- Financials
- Property
- Maintenance
- Documents
- Analytics
- Settings / Integrations

Public/guest target structure remains separate from Owner Operations.

## Next checkpoint work

Before moving files or changing routes:

1. Reconcile the live Vercel `DATABASE_URL` target with the Neon project/branch documented above.
2. Inventory reservation/booking data and confirm where it currently lives.
3. Define the canonical Platform v1 route map.
4. Define the normalized Platform v1 data model.
5. Define shared owner navigation, layout, widget, CSS, and JavaScript conventions.
6. Produce the migration/cutover plan before changing production routes.
