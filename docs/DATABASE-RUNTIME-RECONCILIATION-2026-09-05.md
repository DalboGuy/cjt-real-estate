# CJT Database / Runtime Reconciliation — 2026-09-05

This document resolves the database discrepancy identified during the pre-reorganization checkpoint. It contains no passwords, connection strings, tokens, or other secret values.

## Result

The live Vercel application is backed by a **Vercel-managed Neon organization/project**, not the separately created CJT Neon project that was initially inspected.

### Live production database

- Neon organization: `Vercel: jibbailey82-7655's projects`
- Organization ID: `org-solitary-silence-17428766`
- Neon project: `neon-almond-ocean`
- Project ID: `holy-block-00778872`
- Default branch: `main`
- Branch ID: `br-billowing-smoke-avawnhdx`
- Database: `neondb`
- Region: `aws-us-east-1`

This project contains the schema expected by the current Vercel runtime and the existing owner/financial application state.

### Production backup created

- Snapshot name: `pre-reorg-production-2026-09-05`
- Snapshot ID: `snap-rapid-mode-av50d8hm`
- Source branch: `br-billowing-smoke-avawnhdx`
- Created: `2026-09-05T22:54:04Z`

### Safe reorganization database branch created

- Branch name: `reorg-platform-v1`
- Branch ID: `br-falling-cherry-avxasm60`
- Parent: live production `main`
- Compute: intentionally not provisioned at creation

All Platform v1 database design/migration work should target this branch or disposable child branches until an explicit production migration is approved.

## Current live application tables

The live `public` schema contains:

| Table | Current rows at reconciliation | Purpose |
| --- | ---: | --- |
| `reservations` | 1 | Direct-booking reservation lifecycle |
| `booking_events` | 1 | Reservation audit/event history |
| `communications_messages` | 0 | Unified communications store |
| `owner_sessions` | 1 | Current owner web sessions |
| `owner_users` | 0 | Future/multi-user owner accounts |
| `booking_financials` | 44 | Imported booking financial performance records |
| `booking_payouts` | 0 | Payout matching / reconciliation |
| `pricing_overrides` | 0 | Date-level rate/minimum-stay overrides |
| `site_config` | 4 | Portal/site configuration records |
| `tasks` | 0 | Owner/property operational tasks |

Current `site_config` keys include:

- `financial_report_latest`
- `long_stay_offer`
- `midweek_offer`
- `pricing_rules`

## Current live schema summary

### `reservations`

Core fields include reservation ID, property, guest identity/contact fields, guest count, notes, check-in/out dates, lifecycle status, hold expiration, contract/deposit milestone timestamps, release timestamp, and audit timestamps.

### `booking_events`

Tracks reservation ID, event type, actor, JSON metadata, and creation timestamp.

### `communications_messages`

Tracks message/thread ID, platform, message type, guest name, subject/body/snippet, stay dates, reservation reference, OTA/Gmail links, source/reply email metadata, received time, read state, status, and audit timestamps.

### `booking_financials`

Tracks booking key, channel, stay dates, status, gross revenue, taxes, cleaning fee, expected payout, collected amount, currency, source, external reference, notes, updater, and audit timestamps.

### `booking_payouts`

Tracks payout key, channel, reservation reference, stay/payout dates, amount, currency, source/descriptor, matched booking, and audit timestamps.

### `owner_sessions` / `owner_users`

The production schema already anticipates a fuller owner identity model. `owner_sessions` includes an optional user ID, while `owner_users` includes name, email, password hash/salt, role, active state, forced-password-change state, and audit timestamps.

### `pricing_overrides`

Tracks stay date, nightly rate, minimum nights, label, updater, and update timestamp.

### `tasks`

Tracks operational task title/description, status, priority, category, recurrence, due/completion timestamps, assignee, optional reservation link, creator, recurrence parent, and audit timestamps.

## Secondary Neon project discovered

A separate Neon organization/project also exists:

- Organization: `CJT`
- Organization ID: `org-ancient-silence-21349151`
- Project: `cjt-booking-db`
- Project ID: `lucky-frost-76254444`
- Branch: `production`
- Branch ID: `br-frosty-sun-aeff11ss`
- Database: `neondb`

This is **not the live production database used by the Vercel application**.

It currently contains:

- `communications_messages`
- 3 manually seeded communications records: 2 Airbnb and 1 Vrbo
- Neon Auth schema objects

A separate snapshot already exists there:

- `pre-reorg-2026-09-05`
- Snapshot ID: `snap-twilight-firefly-aer3w836`

Do not delete this secondary project or snapshot during reorganization. It contains the manually seeded communications examples and may be useful as a migration/reference source.

## Communications correction

The Communications Hub UI and API are deployed in the live application, but the **live production communications table currently has 0 rows**.

The 3 messages previously described as seeded in the hub were inserted into the secondary `cjt-booking-db` project, not the Vercel-managed live production database.

Therefore the user's description was correct: the Communications Hub is built, but production is not populated yet.

Before migration, decide whether to:

1. copy those 3 example messages into the live/reorganization database as development fixtures, or
2. leave production clean and populate it only through the planned Gmail ingestion pipeline.

Recommendation: use development fixtures only on the `reorg-platform-v1` database branch and let production communications populate from verified ingestion rather than manual seeding.

## Runtime confirmation basis

The Vercel production deployment is `dpl_DYcXqxGTaBgKkuEc5snrmmcBu8uC` from Git commit `f8a120462db36b27df898a9f400a8cefda6c5239`. The live Vercel API executes the schema initializer defined in `lib/db.js`. The Vercel-managed Neon project contains that runtime schema plus additional owner/financial tables and active data, while the separately created CJT project does not.

This resolves the Phase 0 database discrepancy.

## Guardrails from this point forward

- Treat `holy-block-00778872 / br-billowing-smoke-avawnhdx / neondb` as the canonical current production database.
- Treat snapshot `snap-rapid-mode-av50d8hm` as the production pre-reorganization database recovery point.
- Perform Platform v1 schema work on `br-falling-cherry-avxasm60` or disposable child branches.
- Do not point production Vercel environment variables at a reorganization database branch until cutover is explicitly approved.
- Do not delete the secondary CJT Neon project or its snapshot until the Platform v1 migration is complete and verified.
- Do not copy database credentials or Vercel secrets into GitHub documentation.
