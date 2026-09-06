# Preview vs production database setup

Status: **Needs review until Joel verifies the Vercel and Neon environment wiring.**

This project uses the same `DATABASE_URL` variable name in every deployment, so the **Vercel environment scope** is part of the database configuration. Preview must use the Neon reorganization/development branch and must never inherit the production database value. No connection strings or credentials belong in Git.

## Runtime safety guard

`lib/db.js` validates the deployment scope before creating the Neon client or running schema initialization:

| Deployment | Required settings | Result |
| --- | --- | --- |
| Vercel Production | `DATABASE_URL`, `CJT_DB_TARGET=production`, `CJT_ALLOW_PROD_DB=1` | Production access is explicitly opted in. |
| Vercel Preview | `DATABASE_URL`, `CJT_DB_TARGET=preview`, and no `CJT_ALLOW_PROD_DB=1` | Preview can use only the explicitly labelled preview configuration. |
| Local / non-Vercel development | `DATABASE_URL`; `CJT_DB_TARGET=local` is optional | Existing local workflow remains compatible; use a non-production database. |

A preview with a missing target, a production target, or a leaked production opt-in fails closed before any read or write. This applies to quote/calendar reads as well as inquiry and owner writes; after the safe preview database is configured, the existing read and booking behavior is unchanged.

## Vercel configuration for Joel

Set these in the Vercel project UI using the indicated **Environment** scope:

### Preview

- `DATABASE_URL` — the connection string for Neon branch `reorg-platform-v1` or an approved disposable child branch.
- `CJT_DB_TARGET` — `preview`.
- `CJT_ALLOW_PROD_DB` — do not configure this variable for Preview.

If a disposable child branch is used, it must be a child of the approved development/reorganization branch and its lifecycle must be owned by the team.

### Production

- Keep `DATABASE_URL` pointed at the existing production Neon branch.
- `CJT_DB_TARGET` — `production`.
- `CJT_ALLOW_PROD_DB` — `1`.

Configure these before deploying this branch to Production. The guard does not migrate, seed, or otherwise modify production data.

### Development

Use a local `.env` file or shell environment that is not committed. Point `DATABASE_URL` at a disposable/local or Neon development branch. `CJT_DB_TARGET=local` is optional when `VERCEL_ENV` is unset.

## Neon checklist

1. Confirm the branch named `reorg-platform-v1` (or an approved child) is the Preview target.
2. Provision/enable compute and apply any required schema work on that branch only.
3. Do not change the production branch or copy a production connection string into the Preview scope.
4. If the development branch contains copied production records, sanitize or limit access according to the team's data-handling policy before sharing Preview URLs.

`ensureSchema()` still creates/updates the application tables on the configured database. That is expected on the isolated development branch and is not a production migration.

## Verification checklist

Joel should verify in the Vercel UI and Neon console (without putting values in Git):

- Preview has the three-scope settings above and Production has its explicit opt-in.
- A Preview deployment succeeds and `/api/quote` and `/api/calendar` remain readable.
- A test inquiry on Preview creates a hold only on the development/reorganization branch.
- The same test does not appear on the production branch.
- A Preview deployment with the production opt-in accidentally copied into its scope returns a configuration error instead of opening a database connection.

## Known limitations

- The runtime cannot inspect Neon control-plane metadata from a `DATABASE_URL` and therefore cannot prove which Neon branch a correctly formatted URL names. The explicit `CJT_DB_TARGET` check prevents accidental environment-scope inheritance; Joel must still verify that the Preview secret value names the approved Neon branch.
- A missing or incorrect Preview configuration disables all database-backed API routes rather than silently accepting writes. This is intentional fail-closed behavior.
- This change does not alter pricing, availability, reservation, or owner workflow logic.
