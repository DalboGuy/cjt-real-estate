# CJT Realty Agent Operating Rules

This repository is shared work for the CJT Realty platform. These rules apply to ChatGPT, Grok, Claude, Gemini, Codex, and any other coding agent.

## Read before changing code

1. Read `docs/PLATFORM-V1-ARCHITECTURE.md`.
2. Read `docs/PLATFORM-MAPS.md`.
3. Read the GitHub Issue for the feature you are assigned.
4. Read `docs/AI-COLLABORATION.md`.
5. If the issue touches the current repair effort, read `docs/REPAIR-BACKLOG-2026-09-06.md`.

## Branching and ownership

- Never work directly on `main`.
- Do not work directly on `reorg/platform-v1` unless Joel explicitly requests it.
- One feature or repair per branch.
- Branch names identify the agent and task, for example `chatgpt/platform-map-reconciliation` or `grok/public-image-pipeline`.
- Do not edit another agent's branch unless the Issue or PR explicitly requests cross-agent repair.

## Production guardrails

- Production Git checkpoint and production database must remain unchanged unless Joel explicitly approves a production cutover or migration.
- Do not point preview deployments at production data when a safe development branch is available.
- Database experiments belong on the Neon reorganization branch or disposable child branches.
- Never hardcode secrets, credentials, signed URLs, API tokens, iCal secrets, or connection strings in source or documentation.
- Public website assets must be read-only to anonymous users. Do not grant public write access.

## Source of truth

- After reconciliation, `docs/PLATFORM-MAPS.md` is the architecture/release ledger.
- GitHub Issues define feature scope and acceptance criteria.
- Code implements the accepted Issue scope.
- Vercel preview is a test surface, not proof of acceptance.
- A feature is not `Built` until its acceptance criteria have been tested.

## Change discipline

- Do not mix unrelated feature work in one branch or PR.
- Do not silently rewrite adjacent modules.
- Prefer one canonical implementation over runtime patches, duplicate markup, or duplicated data definitions.
- Reuse existing working business logic unless the Issue explicitly calls for a rewrite.
- Preserve rollback paths until the replacement is accepted.
- Do not infer property facts, room configurations, policies, fees, review data, or external-provider behavior. Use owner-approved facts or verified sources.

## Required PR handoff

Every PR must state:

1. What changed.
2. Files changed.
3. What was deliberately not changed.
4. Acceptance criteria and test results.
5. Data/schema impact.
6. Production impact.
7. Known limitations.
8. Vercel preview URL when available.
9. Configuration handoff: exact environment-variable names only, required versus optional status, target Vercel environments, and whether Joel has set them; never include values.

If any acceptance criterion is unverified, mark the feature `Partial` or `Needs review`, not `Built`.
