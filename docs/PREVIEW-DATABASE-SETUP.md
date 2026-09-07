# Preview vs production database setup

Status: **Live isolation is wired.** This document matches `lib/db.js` and the Neon/Vercel setup Gate Keeper applied. Joel should still confirm a Preview inquiry lands only on the official Preview Neon branch before promoting this guarded SHA to Production.

No connection strings or credentials belong in Git. Names, Neon branch names, branch ids, and redacted host prefixes only.

## Canonical Preview wiring (current)

Runtime (`lib/db.js`) prefers `CJT_DATABASE_URL` over Neon-managed `DATABASE_URL`. Do not rely on `DATABASE_URL` alone for Preview. The Neon integration still injects `DATABASE_URL` on **Preview and Production**; that managed value is not the Preview override.

| Deployment | Required settings | Fail-closed if |
| --- | --- | --- |
| Vercel Preview | `CJT_DATABASE_URL` (official Preview branch), `CJT_DB_TARGET=preview`, and **no** `CJT_ALLOW_PROD_DB` | Missing target, `CJT_ALLOW_PROD_DB=1` leaked into Preview, or host contains `ep-calm-field` |
| Vercel Production | Effective URL (usually Neon-managed `DATABASE_URL`), `CJT_DB_TARGET=production`, `CJT_ALLOW_PROD_DB=1` | Either production guard is missing. **These two vars are not set on Production yet** — set them before promoting this SHA; do not set them from this docs PR. |
| Local / non-Vercel | `CJT_DATABASE_URL` or `DATABASE_URL`; `CJT_DB_TARGET=local` is optional | `CJT_ALLOW_PROD_DB=1` is never valid outside Vercel Production |

A Preview deployment with a missing target, a leaked production opt-in, or a production Neon host fails closed before any read or write. That includes quote/calendar reads as well as inquiry and owner writes.

## Neon branches (do not mix these up)

Official Vercel Preview target:

- Neon branch name: `preview/reorg/platform-v1`
- Branch id: `br-damp-wildflower-avtyiin5`
- Host prefix: `ep-rapid-bird`
- Created by the Vercel/Neon integration (`creation_source: vercel`)

Legacy / sibling — **not** the Vercel Preview target:

- Neon branch name: `reorg-platform-v1`
- Branch id: `br-falling-cherry-avxasm60`
- Host prefix: `ep-long-hall`
- Console-created sibling of production. Keep it for history if useful; do not point Preview at it.

Production (rejected on Preview):

- Neon branch name: `main`
- Branch id: `br-billowing-smoke-avawnhdx`
- Host prefix: `ep-calm-field`
- Preview must never use this host. The runtime rejects any Preview URL whose hostname contains `ep-calm-field`.

## Vercel configuration for Joel

Set these in the Vercel project UI using the indicated **Environment** scope. Paste values only in Vercel/Neon — never in Git.

### Preview (already applied — keep it this way)

- `CJT_DATABASE_URL` — connection string for Neon branch `preview/reorg/platform-v1` (`ep-rapid-bird`). This is the override Preview actually uses.
- `CJT_DB_TARGET` — `preview`.
- `CJT_ALLOW_PROD_DB` — **leave unset**. Do not add it to Preview.
- `DATABASE_URL` — Neon-managed; it still exists. Runtime ignores it when `CJT_DATABASE_URL` is set. Do not treat it as the Preview target.

If you ever replace Preview's override, copy the Connect snippet for `preview/reorg/platform-v1` only. Do not use `reorg-platform-v1` / `ep-long-hall` or production / `ep-calm-field`.

### Production (not yet complete — required before this guarded SHA goes live)

- Keep Neon-managed `DATABASE_URL` pointed at production `main` (`ep-calm-field`).
- `CJT_DB_TARGET` — `production` — **not set yet**.
- `CJT_ALLOW_PROD_DB` — `1` — **not set yet**.

Set those two Production-only variables in the Vercel UI **before** promoting a SHA that includes `lib/db.js` production guards. Do not set them as part of a docs-only PR. The guard does not migrate, seed, or otherwise modify production data.

Until those Production vars exist, a Production deploy of this SHA will fail closed (`Production database access requires CJT_ALLOW_PROD_DB=1` / `CJT_DB_TARGET=production`). That is intentional.

### Development

Use a local `.env` file or shell environment that is not committed. Prefer `CJT_DATABASE_URL` (or `DATABASE_URL`) pointed at a disposable/local database or at `preview/reorg/platform-v1`. `CJT_DB_TARGET=local` is optional when `VERCEL_ENV` is unset. Never set `CJT_ALLOW_PROD_DB=1` locally.

## Joel checklist

1. In Neon, confirm the official Preview branch is `preview/reorg/platform-v1` (`br-damp-wildflower-avtyiin5` / `ep-rapid-bird`), not sibling `reorg-platform-v1`.
2. In Vercel → Preview env: `CJT_DATABASE_URL` and `CJT_DB_TARGET=preview` are present; `CJT_ALLOW_PROD_DB` is absent.
3. Do not delete or “fix” Neon-managed `DATABASE_URL` on Preview just because it exists — the runtime prefers `CJT_DATABASE_URL`.
4. Redeploy Preview after any env change.
5. Hit `/api/quote` and `/api/calendar` on Preview — they should succeed.
6. Create one test inquiry on Preview. Confirm the hold exists on `preview/reorg/platform-v1` and **not** on production `main`.
7. Before Production promotion of this guarded SHA: add Production `CJT_DB_TARGET=production` and `CJT_ALLOW_PROD_DB=1`. Do not add those to Preview.

`ensureSchema()` still creates/updates application tables on whichever database the runtime connected to. That is expected on the isolated Preview branch and is not a production migration.

## Known limitations

- The runtime cannot inspect Neon control-plane metadata from a URL. `CJT_DB_TARGET=preview` plus the `ep-calm-field` host reject are the safety net; Joel still confirms `CJT_DATABASE_URL` names `preview/reorg/platform-v1`.
- A missing or incorrect Preview configuration disables all database-backed API routes rather than silently accepting writes.
- This document does not change pricing, availability, reservation, or owner workflow logic.
