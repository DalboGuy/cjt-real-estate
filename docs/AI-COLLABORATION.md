# CJT Realty AI Collaboration Workflow

Status: Active collaboration rules for `reorg/platform-v1` and feature branches.

## Purpose

GitHub is the shared coordination layer for all coding agents working on CJT Realty. Vercel is the preview/test surface. Neon is the database development surface. No agent-to-agent chat is required: work is handed off through Issues, branches, commits, PRs, and review comments.

## Shared systems

- **GitHub** — source of truth for scope, code, branches, reviews, and acceptance.
- **Vercel** — preview deployments for visual and functional review.
- **Neon** — database branch work; production database changes require explicit approval.

## Working model

1. Joel chooses or approves a feature/repair.
2. A GitHub Issue defines exact scope and acceptance criteria.
3. One agent receives one feature branch.
4. The agent implements only that Issue scope.
5. The agent opens or hands off a PR with test evidence.
6. A second agent may review the diff against architecture and acceptance criteria.
7. Joel reviews the Vercel preview when visual behavior matters.
8. Only accepted work is merged into the integration branch.
9. Platform Maps are updated after acceptance, not before.

## Branch convention

- `chatgpt/<task>` — ChatGPT-owned feature or repair.
- `grok/<task>` — Grok-owned feature or repair.
- `claude/<task>`, `gemini/<task>`, etc. for other agents.

Current integration branch: `reorg/platform-v1`.
Production branch: `main`.

Agents must not work directly on `main`. Agents should normally work on a feature branch rather than directly on the integration branch.

## Review contract

A PR is ready for review only when it includes:

- Issue reference;
- concise change summary;
- exact files changed;
- acceptance checklist;
- test results;
- Vercel preview link when applicable;
- database/schema impact;
- production impact;
- known limitations;
- rollback note when the change replaces existing behavior.

`READY` from Vercel means the deployment built. It does not mean the feature is accepted.

## Architecture contract

Before starting work, every agent reads:

1. `AGENTS.md`
2. `docs/PLATFORM-V1-ARCHITECTURE.md`
3. `docs/PLATFORM-MAPS.md`
4. the assigned GitHub Issue
5. `docs/REPAIR-BACKLOG-2026-09-06.md` when relevant

The following rules are mandatory:

- one canonical source of truth per concept;
- no duplicate implementations unless explicitly transitional and documented;
- no guessing owner/property facts;
- no production database experiments;
- no secrets in Git;
- no unrelated changes in a feature PR;
- no feature marked Built before acceptance testing;
- no Platform Map status upgrade before acceptance.

## Database work

- Production Neon: protected.
- Reorganization Neon branch: development baseline.
- Feature-specific database work should use the reorganization branch or disposable child branches.
- Schema changes are additive first.
- Production migration requires Joel's explicit approval.

## Public asset work

Google Drive may be an editorial/source library, but public website rendering should not depend on mutable Drive thumbnail behavior or public-write permissions. Public-facing assets need a stable, read-only delivery path and a canonical asset manifest.

## Cross-agent handoff

When one agent finishes a feature, another agent can review by reading:

- the Issue;
- PR metadata;
- changed filenames;
- code diff/patch;
- acceptance evidence.

The reviewer should classify findings as:

- Blocker
- Required before merge
- Follow-up
- No issue

The reviewer should not silently rewrite the feature unless explicitly asked to take over the branch.
