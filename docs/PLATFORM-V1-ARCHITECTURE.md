# CJT Platform v1 Architecture

Status: **Design baseline — no production cutover yet**

This document defines the target organization for the CJT Realty platform after the Phase 0 backup and database/runtime reconciliation.

## 1. Product model

CJT should be treated as one platform with two user experiences:

1. **Guest Experience** — public property marketing, availability, direct booking and direct chat.
2. **Owner Operations** — authenticated operating system for communications, reservations, pricing, finances and property operations.

The Owner Portal is the application shell. Communications, Reservations, Financials and future functions are modules inside that shell, not separate portals.

## 2. Canonical route map

### Public / guest

- `/` — property marketing home
- `/availability` — future dedicated availability view; current home calendar remains supported during migration
- `/book` — future dedicated direct-booking flow; current home form remains supported during migration
- `/contact` — future guest support/contact surface

### Owner Operations

- `/owner` — dashboard / control center
- `/owner/communications` — guest communications
- `/owner/reservations` — booking lifecycle and reservation detail
- `/owner/calendar` — consolidated availability and stay calendar
- `/owner/pricing` — rates, seasons, discounts, event overrides
- `/owner/financials` — booking economics, payouts and financial reporting
- `/owner/property` — property profile, amenities and operating configuration
- `/owner/maintenance` — recurring and one-off maintenance
- `/owner/documents` — contracts, receipts and property documents
- `/owner/analytics` — occupancy, ADR, RevPAR, channel and revenue analysis
- `/owner/settings` — users, integrations, notifications and system configuration

### Compatibility routes during migration

The existing `/communications` route should continue to work temporarily and redirect to `/owner/communications` only after the new shell is verified.

The current `/owner` reservation functionality should remain available until `/owner/reservations` reaches acceptance.

## 3. Owner dashboard design

`/owner` becomes the daily operating dashboard.

Core widgets:

- Communications — unread count, channel breakdown, latest messages
- Reservations — upcoming stays, holds and action-needed counts
- Calendar — next arrival/departure and near-term availability
- Pricing — current/next pricing window and event overrides
- Financials — MTD revenue, expected payout and reconciliation exceptions
- Property Operations — open maintenance/tasks

Rule: **widgets summarize; modules manage.**

Widgets should not duplicate full module workflows.

## 4. Shared owner application shell

Every `/owner/*` page should share:

- authentication/session handling
- left navigation on desktop
- drawer navigation on mobile
- property selector architecture, even while only one property exists
- common top bar
- notification/unread badges
- common card, button, table, form and status components
- consistent error/loading/empty states

Initial navigation:

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
- Settings

## 5. Repository target structure

Recommended structure:

```text
cjt-real-estate/
  public/
    index.html

  owner/
    index.html
    communications.html
    reservations.html
    calendar.html
    pricing.html
    financials.html
    property.html
    maintenance.html
    documents.html
    analytics.html
    settings.html

  assets/
    css/
      tokens.css
      base.css
      components.css
      owner-shell.css
      public.css
    js/
      api.js
      auth.js
      owner-shell.js
      widgets.js
      format.js

  api/
    auth/
    communications/
    reservations/
    calendar/
    pricing/
    financials/
    property/
    maintenance/
    integrations/

  lib/
    db.js
    auth.js
    availability.js
    channels.js
    validation.js
    parsing.js

  docs/
    CURRENT-STATE-2026-09-05.md
    DATABASE-RUNTIME-RECONCILIATION-2026-09-05.md
    PLATFORM-V1-ARCHITECTURE.md

  vercel.json
  package.json
```

During migration, existing root files remain until their replacements are verified.

## 6. Data model principles

The data model should support more than one property without forcing a multi-property UI immediately.

Canonical relationships:

```text
property
  ├─ reservations
  │    ├─ guest
  │    ├─ channel
  │    ├─ financials / payouts
  │    └─ conversation
  │          └─ messages
  ├─ calendar events
  ├─ pricing rules
  ├─ maintenance / tasks
  └─ documents
```

### Core entities

#### `properties`

Create a canonical property record for Sand & Sea Manor and future properties.

Suggested fields:

- id
- name
- address fields
- timezone
- active
- max_guests
- default_currency
- created_at / updated_at

#### `channels`

Canonical values initially:

- direct
- airbnb
- vrbo
- booking.com
- houfy

Suggested fields:

- id
- code
- name
- active
- metadata/config reference

Do not store private integration secrets directly in normal application tables unless encrypted and explicitly designed for that purpose. Prefer environment/secret stores.

#### `guests`

Suggested fields:

- id
- display_name
- primary_email
- phone
- created_at / updated_at

Guest identity should not assume OTA relay emails are permanent contact identities.

#### `reservations`

Preserve the current reservation IDs during migration.

Add/normalize:

- property_id
- guest_id
- channel_id
- external_reference
- checkin / checkout
- guest count
- status
- hold/contract/deposit milestones
- monetary summary references
- created_at / updated_at

Do not remove current columns until compatibility code has been retired.

#### `conversations`

One conversation is the container for a guest/reservation/channel thread.

Suggested fields:

- id
- property_id
- guest_id
- reservation_id
- channel_id
- external_thread_id
- external_thread_url
- status
- last_message_at
- unread_count
- created_at / updated_at

#### `messages`

Normalize individual inbound/outbound messages.

Suggested fields:

- id
- conversation_id
- external_message_id
- direction
- subject
- body
- source_email
- reply_to
- gmail_url
- received_at / sent_at
- read_at
- metadata

The current `communications_messages` table should remain as a compatibility/ingestion table during early migration; do not delete it first.

#### Financial data

Retain the existing useful production tables:

- `booking_financials`
- `booking_payouts`

Add property/reservation/channel foreign-key relationships incrementally rather than replacing the financial model immediately.

#### Pricing

Retain `pricing_overrides` initially and add higher-level entities later:

- pricing seasons
- discount rules
- event rules
- minimum-stay rules

#### Tasks / maintenance

Use the existing `tasks` table as the general operational task engine.

Add maintenance-specific tables only if needed for equipment, recurring service history, vendors or costs. Avoid building duplicate task systems.

#### Owner users / authentication

The production database already includes `owner_users` and user-aware `owner_sessions`.

Platform v1 should migrate from one shared passcode toward named users/roles, but this is a later security phase and should not block the shell reorganization.

## 7. Existing production data to preserve

At reconciliation, production contains:

- 1 reservation
- 1 booking event
- 44 booking financial records
- 1 owner session
- 4 site configuration records
- 0 production communication messages

These records must remain intact through the reorganization.

## 8. Communications architecture

Target flow:

```text
Airbnb / Vrbo / Booking.com / Houfy
            ↓
      notification email
            ↓
          Gmail
            ↓
  verified ingestion/parsing
            ↓
          Neon
            ↓
  Owner → Communications
            ↓
  official OTA thread for reply
```

Direct website chat remains through tawk.to unless/until deliberately replaced.

### Communications stages

1. Gmail discovery of new candidate messages.
2. Channel-specific parser.
3. Idempotent ingestion keyed by provider/Gmail message ID.
4. Resolve/create guest and reservation links when confidence is sufficient.
5. Store official OTA thread URL.
6. Display in Owner Communications.
7. Reply through official OTA thread until a verified safe reply transport exists.

Do not send OTA replies from a transport that does not preserve the platform's required relay/thread context.

## 9. Calendar architecture

Current Airbnb/Vrbo iCal consolidation remains operational during migration.

Platform v1 should separate:

- external channel blocks
- direct reservations/holds
- owner blocks
- maintenance blocks

into one normalized availability service.

The public calendar and Owner Calendar should consume the same server-side availability service.

Hardcoded OTA calendar feed URLs should move out of source code and into protected configuration.

## 10. Financial architecture

The Financials module should build on the existing 44-record production dataset rather than re-importing into a new unrelated store.

Planned views:

- booking-level economics
- gross revenue
- host/platform fees
- taxes
- cleaning revenue/cost
- expected payout
- actual payout
- variance/reconciliation
- channel comparison
- monthly/annual owner performance

Later analytics can derive ADR, occupancy and RevPAR from reservation + financial data.

## 11. Security boundaries

- Guest/public APIs expose only data needed for booking and availability.
- Owner APIs require an authenticated owner session.
- No database credentials or service secrets in browser JavaScript.
- No secrets in GitHub documentation.
- Integration tokens belong in Vercel/managed secret configuration.
- Owner-user migration should support roles before external owners/users are invited.
- Audit significant owner actions through event/activity records.

## 12. Vercel / Neon environment model

### Production

- Vercel project: `cjtbookingpage`
- Live Neon project: `holy-block-00778872`
- Live Neon branch: `br-billowing-smoke-avawnhdx` (`main`)

### Reorganization development

- Git branch: `reorg/platform-v1`
- Neon development branch: `br-falling-cherry-avxasm60` (`reorg-platform-v1`)

Do not change production `DATABASE_URL` during design work.

When database development begins, provision a compute on the reorganization Neon branch only when needed and use branch-specific development/preview configuration.

## 13. Migration phases

### Phase 0 — completed

- frozen Git checkpoint
- live production deployment recorded
- live production database identified
- production Neon snapshot created
- database reorganization branch created
- current-state and reconciliation documentation created

### Phase 1 — owner shell

No business logic rewrites.

- create shared design tokens/components
- create shared owner navigation
- convert `/owner` into dashboard shell
- create module cards/widgets
- retain existing reservation workflow behind a compatibility link/page

Acceptance: owner can move between Dashboard, Communications and Reservations without losing authentication or existing functionality.

### Phase 2 — route migration

- move Communications to `/owner/communications`
- move current booking operations to `/owner/reservations`
- add compatibility redirects only after validation

Acceptance: old URLs still work or redirect predictably; no workflow loss.

### Phase 3 — shared code extraction

- shared CSS
- API wrapper
- auth/session helper
- navigation shell
- formatting
- widget framework

Acceptance: Owner modules no longer carry duplicated shell CSS/JS.

### Phase 4 — communications ingestion

- Gmail ingestion
- Airbnb parser
- Vrbo parser
- Booking.com/Houfy parsers when real message formats are confirmed
- idempotency and ingestion logs

Acceptance: a new verified OTA email appears in Communications automatically and links back to the official OTA thread.

### Phase 5 — data normalization

On the reorganization Neon branch first:

- properties
- channels
- guests
- conversations/messages
- reservation foreign-key normalization

Use additive migrations. Do not drop current columns/tables until compatibility testing is complete.

### Phase 6 — operational modules

- Calendar
- Pricing
- Financials
- Property
- Tasks/Maintenance
- Documents
- Analytics

Prioritize existing data before new features.

### Phase 7 — authentication hardening

- named owner users
- roles
- password reset/invite design or trusted OAuth
- activity/audit trail

### Phase 8 — production cutover cleanup

Only after acceptance:

- retire compatibility routes
- remove duplicate legacy files
- remove deprecated columns/tables only with explicit approval
- archive migration documentation
- retain recovery snapshots/commit references for an agreed retention period

## 14. Change-management rules

1. Production behavior is preserved unless a change is explicitly part of an accepted phase.
2. Every schema change is tested on a Neon branch first.
3. Prefer additive migrations over destructive migrations.
4. Each major phase gets an acceptance checkpoint before the next begins.
5. Keep a documented rollback target.
6. Do not mix architecture refactoring with unrelated feature changes in the same deployment.
7. Widgets summarize; modules manage.
8. One canonical data source per concept.
9. Avoid duplicate reservation, task, communications or financial systems.
10. New code should support future multiple properties even when UI initially shows only Sand & Sea Manor.

## 15. Immediate next implementation

The first code phase should be **Owner Shell / Dashboard**, not Gmail ingestion or schema normalization.

Build on the reorganization Git branch while production remains unchanged:

1. shared owner styles/components
2. owner navigation shell
3. dashboard widget framework
4. Communications summary widget
5. Reservations summary widget
6. compatibility links to existing working workflows

After visual/navigation acceptance, migrate the full Communications and Reservations modules into the shell.
