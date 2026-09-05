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
4. Integration Map
5. Cloud Document Flow
6. Data Relationship Map
7. Build State / Roadmap

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

The goal is that the map a user sees in Admin represents the system we are actually building, not an old plan.

## Status vocabulary

- **Built** — working foundation or accepted working implementation exists.
- **Built shell** — functional module shell exists, but major automation/data work remains.
- **In progress / Planning shell** — route/UI exists primarily to preserve the design and development direction.
- **Planned** — defined but not yet implemented.

## Current map baseline — 2026-09-05

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

### In progress / planning shells

- Documents cloud-first planning module
- Admin Portal
- Account Center
- Platform Maps
- Gmail communications/document intake architecture
- normalized multi-property-ready data model

### Planned deeper modules

- Calendar
- Pricing
- Financials
- Property
- Maintenance
- Analytics
- Users & Access
- Roles & Permissions
- Integration management
- Audit Log
- Session management
- System & Data administration

## Cloud document principle reflected in maps

Documents should normally remain in a connected cloud provider. CJT stores/indexes metadata, relationships, tags, permissions and the cloud object pointer. Email attachments, generated reports, signed agreements and watched cloud folders should become preferred hands-off intake paths. Manual upload remains the exception path.

## Security note

The preview maps currently use the existing Owner Portal passcode only as a temporary development bridge. Future production Admin access must require named accounts with administrator authorization. Owner-visible map access can be added separately if desired, but the Admin map remains the authoritative development view.
