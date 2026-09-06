# CJT Platform Maps

Status: **Living architecture documentation**

Authoritative preview route: `/admin-v1/maps`

Current version: **0.5 — 2026-09-05**

## Purpose

Platform Maps explain not only what modules exist, but how information moves through CJT: where it starts, how it enters, how it is normalized, where it is stored or indexed, where the user sees it, and where the final action occurs.

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

Build status is shown separately with labels such as Built, Build / Under construction, and Planned.

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
7. Build State

The common CJT flow is:

`Source → Intake → Normalize → Store / Index → Portal → Action`

## Source-of-truth principle

CJT is the organizing and operating layer, but it does not pretend to own every authoritative record. For example, an OTA message can be indexed and surfaced in CJT while the official OTA thread remains the final reply location. Cloud storage is intended to remain authoritative for document files while CJT stores metadata, tags, permissions, relationships and cloud pointers.

## Navigation rule

Every visible navigation item must open a real route. A module that is not yet ready must open an **Under construction** portal page instead of behaving like a dead or non-working button.

The shared left navigation must also remain usable at every viewport height. The brand/property context and footer remain visible while the module list scrolls independently. Desktop, touch and mobile users must be able to reach every navigation item, and the active module should be kept in view automatically.

Reserved Under construction routes currently cover:

- Owner: Calendar, Pricing, Financials, Property, Maintenance, Analytics, Settings
- Admin: Properties, Roles & Permissions, Integrations, Notifications, Audit Log, Sessions, System & Data
- Account: Notifications, Property Access

These routes are stable placeholders; the working module will replace the placeholder without changing the navigation path.

## Development rule

A meaningful development is not fully documented until the applicable maps are updated. For new modules, integrations or workflows, update:

1. structure — where the feature lives;
2. flow — what comes in, what it touches and what goes out;
3. authority — which system is the source of truth and where final actions occur;
4. build state — Built, Under construction or Planned.

## Current identity baseline

- Named-account authentication API exists.
- The first Administrator can be bootstrapped with the existing Owner Portal passcode.
- Returning users can sign in with email and password.
- Password policy: minimum 5 characters, no required character composition.
- `owner_users` and `owner_sessions` provide named identity and user-aware sessions.
- Property-scoped authorization tables exist on the reorganization database branch and are the next authorization layer.

## Current cloud-document principle

Documents should normally arrive through hands-off methods such as email attachments, signed-agreement output, generated reports or watched cloud folders. The authoritative file should live in cloud storage. CJT should classify it, index it and relate it to property, reservation, financial, maintenance or vendor context.
