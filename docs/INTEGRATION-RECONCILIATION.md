# Integration reconciliation — bot baseline

**Status:** Shared coordination document for bots working on `reorg/platform-v1`.  
**Verified:** 2026-09-07 (TPM management takeover; `git fetch origin reorg/platform-v1`).  
**Scope:** Documentation only. Does not merge other PRs or close other bots’ work.

**Path for other bots:** `docs/INTEGRATION-RECONCILIATION.md`  
**Baseline commit:** `3b31b66707aa1a5f95fd360bc163d0e085cf07ad` (or the current `reorg/platform-v1` tip if it has moved — **re-verify before writing**).

Live Git is authoritative. Historical SHAs in older sections of prior revisions are not tip truth.

Do not treat `docs/PLATFORM-MAPS.md` as the merge-order source of truth until it is updated after acceptance. This file is the current integration baseline for bots.

---

## 1. Integration baseline

| Surface | Value (verified 2026-09-07) |
| --- | --- |
| Integration branch | `reorg/platform-v1` |
| Integration tip SHA | `3b31b66707aa1a5f95fd360bc163d0e085cf07ad` |
| Tip commit | Owner Calendar experience — Sync uses calendar_sync (**#81**) |
| Preview alias | https://cjtbookingpage-git-reorg-platform-v1-jibbailey82-7655.vercel.app |
| Preview deploy | Re-verify on current tip before Preview writes. Prior deploy IDs in older docs are historical. |
| Production branch | `main` |
| Production tip SHA | `f8a120462db36b27df898a9f400a8cefda6c5239` — “Link owner portal to communications hub” |
| Production deploy | `dpl_7LP9PXzR5EAZYwEfKQ8J39fWKxQc` — aliases include `cjtrealty.com`; `target=production` |

**Integration and Production are different implementations.** `main` is days behind `reorg/platform-v1`. Do not assume Production behavior from Preview, or Preview behavior from Production.

### Preview database isolation (Gate Keeper)

All Vercel Preview deployments for this project share the same Preview env vars (not per-PR Neon databases):

| Name | Required Preview setting | Notes |
| --- | --- | --- |
| `CJT_DATABASE_URL` | Official Preview Neon branch `preview/reorg/platform-v1` (host prefix `ep-rapid-bird`) | Runtime prefers this over Neon-managed `DATABASE_URL`. **Never print the value.** |
| `CJT_DB_TARGET` | `preview` | Required on Preview. |
| `CJT_ALLOW_PROD_DB` | **Absent / unset** | Must stay unset on Preview. |

Sibling Neon branch `reorg-platform-v1` (host prefix `ep-long-hall`) is **not** the Preview target. Preview DB docs from **#64** are on tip.

Canonical Preview env write-up: `docs/PREVIEW-DATABASE-SETUP.md`. Do not put connection strings, secrets, or signed URLs in Git.

### Landed on this tip (selected)

| Area | PRs | Notes |
| --- | --- | --- |
| Date lock until owner release | **#67** | `expireHolds()` is a compatibility no-op; new inquiries use `hold_expires_at = null` |
| Owner transition matrix | **#68** | Explicit transition errors / `not_updated` |
| OpenSign send + signed webhook | **#69** | Owner `contract_sent` → send when configured; webhook → `contract_signed`. Does **not** auto-send after accept. |
| Owner portal nav / KPI / login titles | **#65**, **#70** | UI/UX shell consistency |
| Atomic inquiry + duplicate-safe retries | **#71** | Business Logic reliability |
| Fail-closed iCal + `sourceHealth` | **#72**, **#76** | Guest inventory pauses when unhealthy |
| Quote nightly consistency | **#73** | Owner price adjustment quote breakdown |
| API response contract docs | **#74** | UI/UX contract reference |
| Owner-block vs direct concurrency | **#75** | Conflict protection |
| Reservation / Financials date windows | **#77**, **#78** | No arbitrary LIMIT caps for history windows |
| Owner `calendar_sync` API | **#80** | `sync.mode: full_refresh` |
| Guest Request-to-Book UX rebuild | **#79** | Booking Page; supersedes dirty **#47** |
| Owner Calendar Sync UI wiring | **#81** | UI/UX; Sync → `calendar_sync`; Month/Week only; Year/Day disabled until BL view support |

**Stripe remains on hold.** Owner Portal auth remains **required by default**.

---

## 2. Open PR map

Dispositions: **merge-ready** · **reconcile-first** · **do-not-merge** · **docs-only** · **out-of-lane**.

Verified open as of 2026-09-07 (post-#81). Draft PR **#24 is out of scope — do not touch, merge, close, or rewrite it.**

| PR | Feature | Base | Draft? | GitHub merge | Disposition |
| --- | --- | --- | --- | --- | --- |
| **#50** | Remove owner portal passcode on Preview (auth **off by default**) | `reorg/platform-v1` | Yes | CONFLICTING | **do-not-merge** as written |
| **#51** | Same open-by-default auth for live Production | `main` | Yes | MERGEABLE | **do-not-merge** as written |
| **#44** | Calendar hold sync + booking-page UX | `main` | Yes | MERGEABLE | **out-of-lane** — Production lineage; obsolete vs integration tip |
| **#26** | Seasonal Pricing accordion (sample data) | `integration/booking-release` | Yes | MERGEABLE | **out-of-lane** |
| **#24** | Historic booking reconciliation mega-draft | `main` | Yes | MERGEABLE | **out-of-lane — do not touch** |

### Closed / superseded (do not revive)

| PR | Was | Superseded by | Notes |
| --- | --- | --- | --- |
| **#47** | Guest Request-to-Book UX (dirty) | **#79** | Closed 2026-09-07 |
| **#56** | Owner Calendar UI+backend mix (dirty) | **#80** + **#81** | Closed 2026-09-07 |
| **#62** | Lock-until-release draft | **#67** (landed) | Closed 2026-09-07; structured trip/pet/event fields from original #60/#62 scope are **not** all on tip — see Issues |

---

## 3. AUTH WARNING — do not merge #50 / #51 as written

**PRs #50 and #51 remain open drafts.**

They introduce `ownerAuthOpen` / `requireOwnerAuth` such that the Owner Portal is **publicly readable and writable unless an env flag restores auth**.

| Rule | Required behavior |
| --- | --- |
| Disposition | **DO NOT MERGE AS WRITTEN.** |
| Gate Keeper | Must **not** rewrite those PRs without Joel authorization. |
| Protected APIs | Auth is **required by default**. Open-by-default is not acceptable. |
| Flag polarity | `OWNER_PORTAL_PASSCODE_REQUIRED=1` as opt-in restore is the defect. Auth must be on unless Joel explicitly opts out. |

Do not close, rewrite, or “fix forward” #50/#51 from this document without Joel authorization. Flag only.

---

## 4. Booking transition table (approved indefinite date-lock)

Approved model: **availability lock, owner approval, contract, payment, and confirmation are separate facts.**  
**Blocking ≠ paid ≠ fully confirmed.** Do not invent a contract/payment/confirmation sequence.

| Fact | Approved rule (Joel) | On tip `3b31b66` | Product decision |
| --- | --- | --- | --- |
| **Availability lock** | Request locks dates until owner **explicitly releases**. No automatic 24h expiration. | `hold_expires_at` null on create; `expireHolds()` no-op | **Approved / landed (#67)** |
| **Owner approval** | Acceptance **preserves** the lock. Not payment / not full confirmation. | Transition matrix (#68) | **Approved** |
| **Contract** | Separate fact. | OpenSign send on owner `contract_sent` when configured; webhook → `contract_signed` (#69). No auto-send after accept. | **In progress** — Joel may later choose auto-send |
| **Payment** | Separate fact. **Stripe on hold.** | Payment code exists; not live | **Unresolved** |
| **Confirmation** | Do not invent sequence. | `confirmed` paths exist in code; not an approved product sequence | **Unresolved** |

Guest UX on tip is **#79** (not #47). Do not reintroduce 24h expiry copy or behavior.

---

## 5. Approved business rules vs unresolved decisions

### Approved (Joel) — implement / preserve

- Submitted booking request **locks dates** until owner **explicitly releases**.
- **No** automatic 24-hour expiration.
- Approval, contract, payment, and date blocking are **separate facts**.
- Availability **fail-closed**; guest inventory uses `sourceHealth` where defined.
- Max overnight guests **14**.
- **Stripe is on hold.**
- Owner Portal auth **required by default**.
- Financial honesty: no invented NOI / fees / comparisons.

### Unresolved — flag; do not guess

- Whether OpenSign should auto-send after owner accept (today: explicit `contract_sent` only).
- Whether payment is required before `confirmed`.
- Owner Calendar **Year / Day** backend view support (UI buttons disabled until BL contract exists).
- Issue **#60** remainder: structured trip / pet / event persistence (lock portion landed; fields not verified on tip).
- Production cutover timing for `reorg/platform-v1` → `main`.

---

## 6. Current work posture (TPM)

No safe feature merges are pending on `reorg/platform-v1`.

| Priority | Owner | Action |
| --- | --- | --- |
| P0 | Joel | Preview-accept tip guest booking + owner calendar Sync lane (#79/#80/#81) |
| P0 | Gate Keeper | Keep this file current whenever tip moves |
| P1 | Business Logic | Parked — Issue #60 structured fields only if Joel confirms still required |
| P1 | UI/UX | Parked — Year/Day only after BL view contract + Joel authorize |
| P1 | Booking Page | Parked — no new guest UX until Joel Preview acceptance |
| Blocked | Anyone | Do not merge #50/#51/#24/#44 into integration as written |

### Specialist ownership (calendar is cross-domain)

- **Business Logic:** sync/fetch, `sourceHealth`, fail-closed, conflicts, blocks/stays, API contracts  
- **UI/UX:** Owner Calendar presentation, Sync button, drawers, responsive states  
- **Booking Page:** guest date picker / availability presentation  
- **Financial:** occupancy/revenue interpretation only when data supports it  
- **Gate Keeper:** sequencing when domains share files  

Do not invent a separate Calendar specialist.

### Shared high-risk files (sequence via Gate Keeper)

`api/owner.js`, `api/inquiries.js`, `api/calendar.js`, `lib/db.js`, owner-shell files, booking-listing files, financials UI, calendar UI, pricing surfaces.

---

## 7. Preview DB isolation checks — required BEFORE any test writes

Every bot that will POST an inquiry, owner action, calendar block, or any other write must complete these checks first. **Do not print secrets or connection strings.**

1. Confirm the deploy is a **Preview** (`target` is not `production`). Integration alias: https://cjtbookingpage-git-reorg-platform-v1-jibbailey82-7655.vercel.app
2. Confirm Preview env (names only): `CJT_DATABASE_URL` is set, `CJT_DB_TARGET=preview`, `CJT_ALLOW_PROD_DB` is **absent**.
3. Confirm the `CJT_DATABASE_URL` host prefix is the official Preview branch `preview/reorg/platform-v1` (`ep-rapid-bird`), **not** sibling `reorg-platform-v1` (`ep-long-hall`), and **not** Production (`ep-calm-field`).
4. Confirm Production (`cjtrealty.com`) is a different SHA (`f8a1204…`) and will not receive the test write.
5. Use only approved test guest data. A Preview inquiry writes a hold that **all** Preview deploys can see (shared Preview env).
6. If isolation cannot be verified, **do not write**. Read-only quote/calendar checks only.
7. Never copy Production `DATABASE_URL` / `CJT_DATABASE_URL` into Preview docs or chat.

---

## 8. Path for other bots

| Item | Value |
| --- | --- |
| Repository path | `docs/INTEGRATION-RECONCILIATION.md` |
| Pointer | `AGENTS.md` item 6 under “Read before changing code” |
| Integration branch | `reorg/platform-v1` |
| Baseline SHA | `3b31b66707aa1a5f95fd360bc163d0e085cf07ad` |
| If tip moved | Re-fetch `origin/reorg/platform-v1` and record the new SHA; do not assume this file’s SHA is still HEAD |

Before starting feature work: read this file, then the assigned Issue, then `docs/PLATFORM-V1-ARCHITECTURE.md`. Do not merge #50/#51 as written. Do not touch draft PR #24. Do not invent contract, payment, or confirmation sequence. Do not revive closed #47/#56/#62.

---

## Related docs (cross-links; do not replace)

| Path | Remains authoritative for |
| --- | --- |
| [docs/PROJECT-ACCEPTANCE-GATE.md](./PROJECT-ACCEPTANCE-GATE.md) | Feature acceptance checklist before marking Built or merging |
| [docs/BOOKING-ACCEPTANCE-LEDGER-2026-09-06.md](./BOOKING-ACCEPTANCE-LEDGER-2026-09-06.md) | Guest booking page section-by-section acceptance ledger |
| [docs/PLATFORM-V1-ARCHITECTURE.md](./PLATFORM-V1-ARCHITECTURE.md) | Platform-v1 architecture |
| [docs/AI-COLLABORATION.md](./AI-COLLABORATION.md) | Cross-agent collaboration / handoff rules |
| [docs/API-RESPONSE-CONTRACT.md](./API-RESPONSE-CONTRACT.md) | Guest/owner API response contracts for UI |
| [docs/OPENSIGN.md](./OPENSIGN.md) | Bounded OpenSign send/webhook slice (Stripe still held) |
| [docs/STRIPE-PAYMENTS.md](./STRIPE-PAYMENTS.md) | Stripe Checkout slice — **not live**; still held |
| [docs/PREVIEW-DATABASE-SETUP.md](./PREVIEW-DATABASE-SETUP.md) | Preview vs Production DB isolation |

---

## Appendix A — Financial bot ownership

Financial owns Owner Financials **honest-data rules**. Gate Keeper sequences shared Financials/shell files; it does **not** redefine these metrics.

| Rule | Meaning |
| --- | --- |
| No fake fillers | Do not invent `$0`, fees, NOI, or occupancy just to fill a cell. Show `—` / omit when unsupported. |
| Gross Revenue | Guest paid / booking value. |
| Owner Booking Revenue ≠ Net Income | After known channel deductions, before opex. Not Net Income / NOI. |
| America/Chicago MTD | Period math uses America/Chicago check-in dates. |
| API contract | Do not alter `/api/financials` response shape or calculations unless an explicit Financials PR says so. |
| Direct Booking Share | Prior-period pts only when real comparable stored data exists. |
| Occupancy | Guest nights ÷ calendar nights. Owner stays and manual blocks are not occupied nights. |
| Cross-module stay links | Only with stable IDs — no guest-name/date matching. |
| OTA rows | Use `booking_financials` for OTA rows. Do not invent reservation records or Stripe wording for OTA stays. |

**#78** (date-window queries) is on tip. Do not reintroduce LIMIT-capped financial history windows.
