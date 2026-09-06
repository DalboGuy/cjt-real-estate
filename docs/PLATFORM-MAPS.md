# CJT Platform Maps

Status: **Living architecture documentation**

Authoritative preview route: `/admin-v1/maps`

## Purpose

Platform Maps provide a visual record of how the CJT Realty system is organized and how its parts connect. They are intended to remain current throughout development rather than becoming a one-time architecture diagram.

## Required maps

The Platform Maps portal currently maintains these views:

1. Platform Overview
2. Owner Portal Map
3. Admin Portal Map
4. Identity & Session Flow
5. Integration Map
6. Cloud Document Flow
7. Data Relationship Map
8. Build State / Roadmap

## Development rule

For every meaningful development change, update the affected Platform Map before the work is considered fully documented.

Meaningful changes include:

- adding, removing or renaming a portal or module;
- adding or changing a route;
- adding or changing an external integration;
- adding or changing a document automation path;
- adding or changing a database entity or important relationship;
- changing authentication, roles, permissions or user access;
- changing a core business workflow;
- moving a roadmap item between Planned, In Progress and Built.

## Definition of done

A meaningful development cycle should include:

1. implementation;
2. visual map update;
3. build-state / roadmap update;
4. relevant architecture-note update;
5. preview deployment and validation.

## Status vocabulary

- **Built** — working foundation or accepted working implementation exists.
- **Built shell** — functional module shell exists, but major automation/data work remains.
- **In progress / Planning shell** — route/UI exists primarily to preserve the design and development direction.
- **Planned** — defined but not yet implemented.

## Current map baseline — 2026-09-05, version 0.3

### Built / working foundations

- production rollback checkpoint and Neon snapshot
- public CJT property website
- current booking availability services
- tawk.to direct website chat
- Owner Dashboard v1 preview
- integrated Communications shell
- integrated Reservations shell
- existing booking financial dataset
- existing reservation lifecycle controls
- named-account authentication API
- one-time first-Administrator bootstrap using the existing Owner passcode
- individual email/password sign-in
- salted password hashing
- user-aware owner sessions
- functional Account Center profile/session view
- self-service password change
- Administrator-only Users & Access directory
- simplified password policy: minimum 5 characters with no required character composition
- Platform Maps living documentation

### In progress / planning shells

- Documents cloud-first planning module
- Admin Portal
- role/property authorization model
- Gmail communications/document intake architecture
- normalized multi-property-ready data model

### Planned deeper modules

- user invitations
- password recovery
- expanded roles: Co-host, Accounting and Read Only
- property-scoped permissions
- per-session management/revocation
- Audit Log
- Calendar
- Pricing
- Financials
- Property
- Maintenance
- Analytics
- Integration management
- System & Data administration

## Identity foundation reflected in maps

The current named-account foundation deliberately reuses the existing `owner_users` and `owner_sessions` model instead of creating a second authentication store.

Current flow:

1. If no named users exist, the existing Owner Portal passcode may be used once to bootstrap the first Administrator account.
2. The first Administrator chooses their own name, email and password.
3. Returning named users authenticate with email and password.
4. Passwords are stored only as salted derived hashes.
5. The CJT password policy is intentionally simple: a password may be any 5 or more characters, with no uppercase, lowercase, number or symbol requirement.
6. Named sessions use the same HttpOnly `cjt_owner_session` cookie consumed by current Owner APIs, so existing Owner modules continue working during the migration.
7. The Account Center can show the signed-in user's identity, role and session expiration and supports password changes.
8. The Users & Access page requires a named Administrator session.

The shared passcode remains a temporary compatibility bridge and has not yet been removed from the legacy Owner routes.

## Cloud document principle reflected in maps

Documents should normally remain in a connected cloud provider. CJT stores/indexes metadata, relationships, tags, permissions and the cloud object pointer. Email attachments, generated reports, signed agreements and watched cloud folders should become preferred hands-off intake paths. Manual upload remains the exception path.

## Next identity milestone

The next authentication/authorization development should add property-scoped permission records and an invitation/recovery workflow. Expanded roles should be introduced through an additive migration and tested on the reorganization Neon branch before production cutover.
