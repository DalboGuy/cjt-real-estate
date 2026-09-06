# Grok First Assignment — Public Booking Image Pipeline

Primary Issue: use the GitHub Issue titled `Build stable public booking image pipeline`.

## Why this is first

The current guest page has visible blank/stale-photo failures because public rendering depends on mutable Google Drive thumbnail behavior, duplicate/copy IDs, and fallback mappings. This task is self-contained enough for Grok to implement without touching pricing, reservation, payment, authentication, or database logic.

## Goal

Replace the brittle public image delivery path with a stable, read-only website asset system while preserving the owner-approved opening gallery and bedroom groupings.

## Do not change

- pricing logic;
- quote/inquiry behavior;
- reservations or booking_events;
- Stripe/payment work;
- authentication;
- review content;
- amenities;
- map interaction;
- production branch/database.

## Required reading

- `AGENTS.md`
- `docs/AI-COLLABORATION.md`
- `docs/PLATFORM-V1-ARCHITECTURE.md`
- `docs/PLATFORM-MAPS.md`
- `docs/REPAIR-BACKLOG-2026-09-06.md`
- assigned GitHub Issue

## Acceptance summary

- exact owner-approved six opening photos render anonymously;
- bedroom photos render anonymously;
- no public writer permission is required;
- no Drive thumbnail fallback chain in guest runtime;
- one canonical asset manifest;
- rollback path preserved;
- Vercel preview supplied;
- no unrelated page changes.
