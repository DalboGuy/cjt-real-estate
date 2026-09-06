# Repair backlog — 2026-09-06

This backlog converts the current audit into reviewable work. Items remain separate so an agent cannot broaden a feature accidentally.

## P0 — release blockers

### P0.1 Public booking image pipeline

Replace brittle Google Drive thumbnail and fallback behavior with one stable, read-only public image delivery path and one canonical asset manifest. Preserve the owner-approved six opening photos and the five owner-defined bedroom folder groupings. Do not change booking, pricing, reservations, payments, reviews, amenities, map behavior, or authentication.

Acceptance: `docs/PROJECT-ACCEPTANCE-GATE.md` and `docs/GROK-FIRST-ASSIGNMENT.md`.

## P1 — next controlled repairs

- Confirm and document anonymous access behavior for every owner-approved public image.
- Remove stale or misleading image fallback paths only after the new manifest is verified in preview.
- Reconcile any remaining private-copy references without changing room identity or photo membership.
- Resolve the 13–14 guest production schema migration as a separately approved database task.

## P2 — later platform work

- Continue owner operations modules and identity work according to `docs/PLATFORM-V1-ARCHITECTURE.md`.
- Improve asset administration and source metadata after the public pipeline is stable.

No backlog item authorizes production changes by itself. Each item requires its own issue, branch, acceptance evidence, and human review.
