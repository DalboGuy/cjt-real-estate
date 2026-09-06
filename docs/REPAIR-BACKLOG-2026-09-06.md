# CJT Platform Repair Backlog — 2026-09-06

Status: Active reconciliation backlog following the booking-page audit.

This document records what must be reconciled before the current booking redesign can be called accepted. It distinguishes true defects from intentionally deferred work.

## Priority definitions

- **P0** — release blocker, security/configuration risk, or source-of-truth failure.
- **P1** — functional/architectural gap that should be fixed before final booking acceptance.
- **P2** — quality or migration debt that can follow P0/P1 stabilization.

## P0 — must stabilize first

### 1. Reconcile Platform Maps into one authoritative version

Current state: `admin-v1/maps.html`, `assets/js/owner-shell.js`, and `docs/PLATFORM-MAPS.md` describe different versions/states.

Acceptance:
- one canonical version number;
- one canonical status for every module;
- `Built`, `Partial`, `Deferred`, and `Planned` accurately reflect tested reality;
- map changes happen after feature acceptance, not before.

### 2. Restore acceptance checkpoints

Acceptance:
- every active feature has a GitHub Issue;
- every Issue has testable acceptance criteria;
- Vercel READY is not treated as feature acceptance;
- visual changes are reviewed on desktop/mobile and anonymous/public rendering when applicable.

### 3. Establish one canonical booking-page implementation

Current state: stale HTML plus runtime JavaScript replacement/patching creates duplicate sources of truth.

Acceptance:
- one canonical markup/data definition for gallery, rooms, amenities, reviews, and policies;
- remove stale placeholders after replacement is accepted;
- no guest-facing facts depend on JS deleting/replacing contradictory HTML.

### 4. Replace brittle public image delivery

Current state: the booking page depends on Google Drive thumbnail URLs, fallback IDs, copies, replaced file bytes, and cached thumbnails.

Acceptance:
- stable public read-only image delivery;
- canonical asset manifest;
- no public writer permissions;
- opening gallery and room galleries render anonymously without fallback chains;
- Drive can remain the editorial/source library if desired.

### 5. Isolate preview from production data

Acceptance:
- Vercel preview uses a development/reorganization database branch;
- preview booking submissions cannot create real production holds/reservations;
- production remains unchanged until explicit cutover approval.

### 6. Move OTA calendar feed secrets/config out of source

Acceptance:
- no private/signed feed URL is hardcoded in repository source;
- feed configuration is supplied through protected environment configuration;
- availability behavior remains unchanged after migration.

### 7. Finish true 14-guest end-to-end support

Current state: UI/API allow 14; production reservation constraint still reflects the earlier limit.

Acceptance:
- additive production migration separately approved by Joel;
- 1–14 guest reservation request works end-to-end after approved migration;
- rollback path retained.

### 8. Complete the transaction loop

Current state: quote → hold → owner lifecycle works; Stripe checkout/payment verification/final confirmation are incomplete.

Acceptance:
- server-derived Stripe amount from stored quote;
- payment verification before confirmation;
- balance/deposit status recorded;
- final guest confirmation;
- no client-trusted amount.

## P1 — booking acceptance gaps

### 9. Bedroom folders: define real publishing model

Current state: folder names/image membership were read once and hardcoded; this is a snapshot, not a live folder sync.

Decision required:
- controlled manifest, or
- deliberate publishing/sync workflow.

Acceptance: behavior is explicit and documented; adding/removing a source photo has a predictable publishing step.

### 10. Rebuild amenities from verified property facts

Acceptance:
- Booking.com-style grouping retained as presentation pattern;
- every amenity verified for Sand & Sea Manor;
- one amenity dataset drives page and modal;
- duplicate or unsupported items removed;
- consistent icon family.

### 11. Complete review-source model

Current state: Airbnb/Booking.com summary cards and selected comments exist; all-source normalized aggregation does not.

Acceptance:
- source list explicitly defined;
- Airbnb, Booking.com, Houfy, and Vrbo handled according to available verified data;
- distinguish live/imported/manual review data;
- no claim of `all reviews` until all intended sources are represented;
- stale scores have an update mechanism.

### 12. Reconcile location/map implementation

Current state: SVG leaders target an HTML overlay on top of an embedded map rather than a controlled map marker object.

Acceptance:
- classify current implementation accurately as visual/partial, or replace with a real controlled map implementation;
- owner-selected aerial photos only;
- hover/click behavior matches approved prompt;
- mobile behavior accepted separately.

### 13. Complete contract workflow

Acceptance:
- reservation data → agreement generation;
- agreement delivery;
- signature collection;
- signed file indexed/linked to reservation;
- owner milestone status reflects actual workflow.

### 14. Complete cancellation/refund workflow

Acceptance:
- policy calculation;
- date release;
- refund path when payment exists;
- booking-event audit;
- guest notification.

### 15. Make pricing maintainable

Acceptance:
- Owner Pricing module or controlled update workflow;
- extend rates past 2027-08-15 without code edits;
- preserve server-side quote source of truth.

## P2 — follow-up debt

### 16. Complete canonical route migration

Move from compatibility `*-v1` routes toward the architecture routes only after module acceptance.

### 17. Complete normalized availability model

Add owner blocks and maintenance blocks to the shared server-side availability model.

### 18. Resume Owner Portal deferred modules

Calendar, Pricing, Financials, Property, Maintenance, Documents, Analytics, and Settings after the direct-booking loop is accepted.

## Intentionally deferred — not defects

- Communications Gmail/OTA ingestion beyond the current hub foundation.
- Cloud document automation beyond the current design/foundation.
- Property-scoped users/permissions.
- Permission enforcement expansion.
- Invitations.

These remain deferred unless Joel changes priority.

## Recommended implementation order

1. Platform Maps reconciliation.
2. Acceptance ledger / GitHub Issue discipline.
3. Public image pipeline.
4. Canonical booking-page cleanup.
5. Preview/database isolation.
6. Booking-page section acceptance: gallery → booking controls → rooms → amenities → reviews → map → policies.
7. 14-guest approved migration.
8. Stripe/payment/confirmation.
9. Contract/cancellation operational workflows.
10. Resume deferred platform modules.
