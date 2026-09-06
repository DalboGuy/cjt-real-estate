# CJT Platform Maps

Status: **Living architecture documentation**

Authoritative preview route: `/admin-v1/maps`

Current version: **1.1 — 2026-09-05**

## Purpose

Platform Maps explain not only what modules exist, but how information moves through CJT: where it starts, how it enters, how it is normalized, where it is stored or indexed, where the user sees it, and where the final action occurs.

## Primary product priority

The primary function of this project is the **working direct-booking system** for Sand & Sea Manor. Communications, Documents, expanded identity/access, and other operations modules are secondary until the core booking loop is complete.

Current core loop:

`Guest chooses dates → live availability check → seasonal price quote → booking request / 24-hour hold → Direct Booking Dashboard → owner accepts / adjusts / releases → contract / deposit milestones → confirmed reservation`

Online payment/checkout is the next missing step in that loop.

## Visual language

Color identifies the type of system or surface, not build status:

- Public / Guest — guest-facing website and entry points.
- Owner Portal — daily property operating screens.
- Admin — platform configuration and governance.
- Account — login, identity and personal access.
- External — Airbnb, Vrbo, Booking.com, Houfy, Gmail, tawk.to and other outside systems.
- CJT data — Neon records, metadata and relationships.
- Cloud — authoritative document files stored in the selected cloud provider.
- Core application — Vercel APIs and shared business logic.

Build status is shown separately with labels such as Built, Build / Under construction, Deferred, and Planned.

Arrow language:

- `→` system or data flow
- `↔` synchronization
- `⇢` human handoff or opening an external system for the final action
- `···→` planned flow

## Required flow maps

The portal maintains these views:

1. Overall Intake Path
2. Guest Communications Flow
3. Reservation Flow
4. Cloud Document Intake
5. Source of Truth
6. Identity & Access Flow
7. Portal Navigation Flow
8. Security Scope Decision
9. Temporary Preview Access
10. Direct Booking Engine
11. Build State

The common CJT flow is:

`Source → Intake → Normalize → Store / Index → Portal → Action`

## Direct Booking Engine — current build

The guest and owner sides now share one booking lifecycle:

- `/` — guest booking page with clickable synced calendar.
- `/api/calendar` — consolidated availability from OTA calendars and active CJT holds/reservations.
- `/api/quote` — read-only quote service using the current seasonal schedule, Friday/Saturday weekend pricing, minimum-stay rules, $240 cleaning fee, and 15% tax.
- `/api/inquiries` — rechecks availability and pricing, creates the 24-hour inquiry hold, and stores the exact quote with the booking event.
- `/owner-v1/reservations` — Direct Booking Dashboard showing requests, stored quotes, status, hold expiry, contract/deposit milestones, and owner actions.
- `/api/owner` — owner actions can accept a new request, adjust the lodging subtotal while recalculating tax/total, extend a hold, track contract/signature/deposit, or reject/release the dates.
- `reservations` remains the canonical booking record; `booking_events` stores quote snapshots and lifecycle events without requiring a new production schema migration.

The published online pricing horizon in booking-engine v1 runs through **2027-08-15**. Dates beyond that require a future pricing extension rather than silently inventing rates.

Next booking-engine step: connect payment/checkout and produce the final guest confirmation flow after successful payment.

## Source-of-truth principle

CJT is the organizing and operating layer, but it does not pretend to own every authoritative record. For direct bookings, the CJT reservation record and booking-event history are authoritative for the direct-booking lifecycle. For OTA messages, the official OTA thread can remain authoritative while CJT indexes and surfaces the conversation. Cloud storage is intended to remain authoritative for document files while CJT stores metadata, tags, permissions, relationships and cloud pointers.

## Navigation rule

Every visible navigation item must open a real route. A module that is not yet ready must open an **Under construction** portal page instead of behaving like a dead or non-working button.

The shared left navigation must also remain usable at every viewport height. The brand/property context and footer remain visible while the module list scrolls independently. Desktop, touch and mobile users must be able to reach every navigation item, and the active module should be kept in view automatically.

The left navigation is collapsible. A chevron control inside the pane hides it, and a persistent flyout control remains on the left edge so the user can reopen portal navigation from any module without using the browser Back button. On mobile the return control is a compact arrow-only edge handle positioned around the middle of the screen so it stays clear of filter buttons and mobile browser controls.

## Mobile layout rule

Portal pages must fit the device viewport without forcing the entire page to scroll sideways. On narrow screens:

- the application shell, top bar, content area and cards are clamped to the viewport width;
- card headers and action areas wrap instead of forcing fixed horizontal space;
- dashboard metric grids collapse to single-column layouts when needed;
- communications and reservation modules stack vertically;
- long message content, labels and URLs wrap inside their containers;
- visual maps stack vertically instead of extending the page width;
- genuinely wide tables may scroll horizontally **inside their own card**, not by widening the portal page.

The public booking page follows the same rule and includes a mobile sticky booking action.

## Security scope decision — 2026-09-05

The owner explicitly narrowed identity/security work to items **4 and 5 only**. Items **1–3 stay recorded for later** and are not current build work.

1. **Property-scoped users & permissions — Deferred.** Assign users to properties and roles.
2. **Permission enforcement — Deferred.** Role-aware navigation and API authorization.
3. **Invitations — Deferred.** Email invitation and account activation flow.
4. **Password recovery — Built foundation.** One-time 30-minute reset tokens, password replacement, and invalidation of the user's existing sessions after a successful reset. Automated email delivery uses a protected runtime delivery hook and remains inactive until that connection is configured.
5. **Sessions & audit — Built.** Named users can review/revoke their own active sessions; Administrators can review/revoke named-account sessions. Authentication and session actions write to the shared audit trail when `audit_log` is present.

The `password_reset_tokens` and `audit_log` tables are present on the Neon reorganization branch. Preview code does **not** create these tables on the production database.

## Temporary preview access — 2026-09-05

At the owner's request, application-password gates are temporarily bypassed for **preview GET/read access from 8:25 PM to 9:25 PM Central on Sep 5, 2026**. The bypass is coded with a fixed expiration timestamp and only activates when `VERCEL_ENV=preview`; production authentication is unchanged.

Data-changing POST/write actions remain session-protected during this temporary window because the current preview database connection may still point at production.

Reserved Under construction routes currently cover:

- Owner: Calendar, Pricing, Financials, Property, Maintenance, Analytics, Settings
- Admin: Properties, Roles & Permissions, Integrations, Notifications, System & Data
- Account: Notifications, Property Access

Audit and Sessions are no longer placeholder routes. Direct Bookings is a working owner module.

## Development rule

A meaningful development is not fully documented until the applicable maps are updated. For new modules, integrations or workflows, update:

1. structure — where the feature lives;
2. flow — what comes in, what it touches and what goes out;
3. authority — which system is the source of truth and where final actions occur;
4. build state — Built, Under construction, Deferred or Planned.

## Current identity baseline

- Named-account authentication API exists.
- The first Administrator can be bootstrapped with the existing Owner Portal passcode.
- Returning users can sign in with email and password.
- Password policy: minimum 5 characters, no required character composition.
- `owner_users` and `owner_sessions` provide named identity and user-aware sessions.
- Password recovery request/reset routes and token handling are built.
- Account and Admin session-management pages are built.
- Admin Audit Log page and shared event writer are built.
- Property-scoped authorization remains documented but deferred.

## Current cloud-document principle

Documents should normally arrive through hands-off methods such as email attachments, signed-agreement output, generated reports or watched cloud folders. The authoritative file should live in cloud storage. CJT should classify it, index it and relate it to property, reservation, financial, maintenance or vendor context. This work is deferred behind the booking engine.
