# Integration reconciliation — bot baseline

**Status:** Shared coordination document for bots working on `reorg/platform-v1`.  
**Verified:** 2026-09-07 (re-checked with `gh` + Vercel before this commit).  
**Scope:** Documentation only. This file does not change application code, merge other PRs, or close other bots’ work.

**Path for other bots:** `docs/INTEGRATION-RECONCILIATION.md`  
**Baseline commit:** `5c06fa838ed534f83cdeffaff5c1a35e827c7e82` (or the current `reorg/platform-v1` tip if it has moved — re-verify before writing).

Do not treat `docs/PLATFORM-MAPS.md` as the merge-order or lock-semantics source of truth until it is updated after acceptance. This file is the current integration baseline for bots.

---

## 1. Integration baseline

| Surface | Value (verified 2026-09-07) |
| --- | --- |
| Integration branch | `reorg/platform-v1` |
| Integration tip SHA | `5c06fa838ed534f83cdeffaff5c1a35e827c7e82` |
| Tip commit | Reorder guest sleep room cards and Master Bedroom photos (#63) |
| Preview alias | https://cjtbookingpage-git-reorg-platform-v1-jibbailey82-7655.vercel.app |
| Preview deploy | `dpl_GxHRodDs7qHn4FH3hNtatpaEFFGo` — SHA **matches** tip; `githubCommitRef=reorg/platform-v1`; `target` is Preview (not Production) |
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

Sibling Neon branch `reorg-platform-v1` (host prefix `ep-long-hall`) is **not** the Preview target. See also open docs PR #64.

Canonical Preview env write-up: `docs/PREVIEW-DATABASE-SETUP.md` (stale on this tip until #64 merges). Do not put connection strings, secrets, or signed URLs in Git.

---

## 2. Open PR map

Dispositions: **merge-ready** (after Joel review / conflict check) · **reconcile-first** · **do-not-merge** · **docs-only** · **out-of-lane**.

Verified open as of 2026-09-07. Draft PR **#24 is out of scope — do not touch, merge, close, or rewrite it.**

| PR | Feature | Base | Draft? | GitHub merge | Dependencies / conflicts | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| **#64** | Canonical Preview DB docs (`CJT_DATABASE_URL` → `preview/reorg/platform-v1`) | `reorg/platform-v1` | Yes | CLEAN | Docs-only; also edits `AGENTS.md` (Preview DB sentence). This reconciliation PR adds a different `AGENTS.md` line. | **docs-only** — merge first among docs |
| **this file** | Integration reconciliation baseline | `reorg/platform-v1` | Yes (when opened) | — | Docs-only; `AGENTS.md` one-line pointer | **docs-only** |
| **#62** | Keep booking requests locked until owner release (removes 24h expiry; structured trip/pet/event fields) | `reorg/platform-v1` | Yes | CLEAN / MERGEABLE | 1 commit behind tip (#63). Unique tip file vs this branch: `assets/data/public-image-manifest.json` (no overlapping booking-workflow files). Overlaps **#47** on the booking-workflow set below. Closed #61 was the prior attempt — use #62. | **reconcile-first** vs #47; prefer #62 lock semantics; conflict-check vs tip then merge as the lock baseline |
| **#47** | Guest UX redesign (Dates → Reserve → …) plus lifecycle helpers; still references 24h holds in places | `reorg/platform-v1` | Yes | DIRTY / CONFLICTING | Base SHA `778881a8…` (behind tip). Overlaps **#62** and touches owner-shell / calendar / pricing files also used by #56/#57/#65. | **reconcile-first** — rebase onto post-#62 baseline; **must not reintroduce 24h expiry** |
| **#56** | Owner Calendar: Sync Calendars, day-press actions, fail-closed Direct holds | `reorg/platform-v1` | Yes | DIRTY / CONFLICTING | Shares `api/calendar.js`, `api/inquiries.js`, `api/owner.js`, calendar/pricing/financials JS with #47/#65 | **reconcile-first** — coordinate shared owner-shell / calendar files via Gate Keeper |
| **#58** | Redesign Owner Financials as a performance dashboard | `reorg/platform-v1` | No | CLEAN | Overlaps Financials HTML/JS with **#57** and **#65**. #58 notes: if #57 merges first, rebase. | **reconcile-first** (shared Financials / shell) |
| **#57** | Owner portal shell/nav consistency across Pricing + Financials | `reorg/platform-v1` | No | CLEAN | Shares `owner-shell.js`, Pricing/Financials chrome with **#58** and **#65** | **reconcile-first** (shared owner-shell) |
| **#65** | Owner portal nav, Overview KPI destinations, sticky context | `reorg/platform-v1` | Yes | CLEAN | Broad owner-shell + destination pages; overlap notes in PR for Calendar #56 and Financials #58 | **reconcile-first** — coordinate shared owner-shell files via Gate Keeper |
| **#50** | Remove owner portal passcode on Preview (`ownerAuthOpen` / `requireOwnerAuth`; **auth off by default**) | `reorg/platform-v1` | Yes | DIRTY / CONFLICTING | Companion **#51**. PR body warns Owner Portal becomes publicly readable/writable. | **do-not-merge** as written |
| **#51** | Same open-by-default auth helper for live Production (`main`) | `main` | Yes | CLEAN / MERGEABLE | Would make Production Owner Portal public. | **do-not-merge** as written |
| **#44** | Calendar hold sync + booking-page UX | `main` | Yes | CLEAN | Targets Production lineage, not integration. | **out-of-lane** — do not treat as integration work |
| **#26** | Seasonal Pricing accordion (sample data) | `integration/booking-release` | Yes | CLEAN | Old integration path, not `reorg/platform-v1`. | **out-of-lane** |
| **#24** | Reconcile booking portal, pricing controls and communications | `main` | Yes | CLEAN | Historic release-candidate draft. | **out-of-lane — do not touch** |

### #47 / #62 overlapping booking-workflow files

Both open drafts into `reorg/platform-v1`. Shared files include at least:

- `api/inquiries.js`
- `api/owner.js`
- `assets/js/booking-listing.js`
- `assets/js/reservations-v1.js`
- `booking-v2.html`
- `index.html`
- `lib/db.js`

**#47** = guest UX redesign plus lifecycle helpers; still references 24h holds in places.  
**#62** = approved indefinite lock (no 24h expiry) plus structured trip/pet/event fields.

**Disposition:** reconcile before merge. Prefer **#62’s indefinite lock semantics** as the approved business rule. **#47 must not reintroduce 24h expiry.**

### Automatic 24-hour hold expiration — still on integration tip

Confirmed on `5c06fa838ed534f83cdeffaff5c1a35e827c7e82`:

- `lib/db.js` `expireHolds()` still marks `inquiry_hold` / `hold_verified` rows `expired` when `hold_expires_at <= now()`.
- `api/inquiries.js` inserts `hold_expires_at = now()+interval '24 hours'` and GETs/POSTs call `expireHolds`.
- Owner/dashboard/financials GETs also call `expireHolds`. Guest copy still says “24-hour hold”.

#62 removes that automatic expiry. Approved Joel rule: **no automatic 24-hour expiration; dates lock until the owner releases.**

---

## 3. AUTH WARNING — do not merge #50 / #51 as written

**PRs #50 (base `reorg/platform-v1`) and #51 (base `main`) are still open drafts.**

They introduce `ownerAuthOpen` / `requireOwnerAuth` such that the Owner Portal is **publicly readable and writable unless an env flag restores auth**. Both PR bodies warn of this.

| Rule | Required behavior |
| --- | --- |
| Disposition | **DO NOT MERGE AS WRITTEN.** |
| Gate Keeper | Must **not** rewrite those PRs without Joel authorization. |
| Protected APIs | Auth is **required by default**. Open-by-default is not acceptable. |
| Flag | `OWNER_PORTAL_PASSCODE_REQUIRED=1` is an opt-in restore in those PRs — that polarity is the defect. Auth must be on unless Joel explicitly opts out, not the reverse. |

Do not close, rewrite, or “fix forward” #50/#51 from this document. Flag only.

---

## 4. Booking transition table (approved indefinite date-lock)

Approved model: **availability lock, owner approval, contract, payment, and confirmation are separate facts.**  
**Blocking ≠ paid ≠ fully confirmed.** Do not invent a contract/payment/confirmation sequence.

| Fact | Approved rule (Joel) | On integration tip (`5c06fa8`) | Intended after #62 (lock slice only) | Sequence / product decision |
| --- | --- | --- | --- | --- |
| **Availability lock** | Submitted booking request locks dates. Dates stay locked until the owner **explicitly releases**. No automatic 24h expiration. | 24h hold: `hold_expires_at = now()+24h`; `expireHolds()` auto-expires. | New inquiries use no expiry timestamp; `expireHolds` becomes a compatibility no-op; lock lasts until owner release. | **Approved.** |
| **Owner approval** | Owner acceptance **preserves** the lock. Approval is not payment and is not full confirmation. | Owner can accept / extend (+24h) / release. Extend Hold still exists. | Acceptance remains owner-controlled; Extend Hold removed; lock is not on a timer. | **Approved** for lock + accept/release. Later approval UX belongs to reconciled #47, not a new sequence. |
| **Contract** | Separate fact from lock, payment, and confirmation. | Owner actions can set `contract_sent` / `contract_signed` timestamps. OpenSign is not an automated, accepted trigger on this tip. | #62 does not define the contract send path. | **Unresolved** — see §5. Do not invent when the contract is sent or what sets `contract_signed`. |
| **Payment** | Separate fact. **Stripe is on hold.** | Payment code exists (Issue #21 / `docs/STRIPE-PAYMENTS.md`) and is **not** accepted as live. | Unchanged by #62. | **Unresolved** — whether payment is required before `confirmed` is not decided. Do not collect live charges in Preview work unless Joel says so. |
| **Confirmation** | Blocking ≠ paid ≠ fully confirmed. Do not invent the confirmation sequence. | `confirmed` status and payment-gated confirm paths exist in code; they are **not** an approved product sequence. | Do not add a new confirmation story in lock or guest-UX PRs. | **Unresolved** — do not invent the sequence. |

Guest-facing #47 path (Dates → Guests → Price → Reserve → Your info → Review → Reservation received) is UX on top of the existing inquiry/hold architecture. After rebase it must keep **#62 lock semantics** and must not claim Stripe/OpenSign completion.

---

## 5. Approved business rules vs unresolved decisions

### Approved (Joel) — implement / preserve

- Submitted booking request **locks dates**.
- Dates remain locked until the owner **explicitly releases**.
- Owner **acceptance preserves** the lock.
- **No** automatic 24-hour expiration.
- Approval, contract, payment, and date blocking are **separate facts**.
- **Blocking ≠ paid ≠ fully confirmed.**
- **Stripe is on hold.**
- **Do not invent** the confirmation sequence.

### Unresolved — flag; do not guess

- Exact OpenSign / contract send trigger, and what sets `contract_signed`.
- Whether payment is required before `confirmed` (Stripe paused).
- Fate of `pricing_overrides` / `midweek_offer` / `long_stay_offer` vs seasons-only quotes.
- Whether a `cancelled` status will be used vs **released** only.
- Production cutover for pricing/calendar tables that are missing on main Neon.

---

## 6. Bounded tasks and merge order

Recommendation only. Gate Keeper coordinates shared files. Do not merge/close/rewrite other bots’ PRs from this doc.

### Suggested merge order

1. **Docs:** #64 (Preview DB canonical wiring), then this reconciliation document.
2. **Business lock semantics:** #62 after a conflict check vs current tip (GitHub CLEAN as of 2026-09-07; still rebase if tip moves).
3. **Guest UX:** rebase / reconcile **#47** onto the post-#62 baseline. Remove any 24h reintroduction (`expireHolds` behavior, `now()+24 hours` inserts, guest/owner “24-hour hold” copy that implies auto-expiry).
4. **Owner surfaces (coordinate, do not land in parallel on the same files):** Calendar **#56**, Financials **#58** / shell **#57**, Design nav **#65**. Shared owner-shell / Financials / Calendar files go through Gate Keeper.
5. **Never** merge **#50** / **#51** as written.

### Business Logic bot — bounded tasks

| Task | Stay inside | Do not take |
| --- | --- | --- |
| Land #62 lock semantics on post-tip baseline | `lib/db.js`, `api/inquiries.js`, `api/owner.js` (lock/expiry/status only) | Guest visual redesign; owner-shell nav; Financials dashboard; Calendar day-press |
| Keep #47 from restoring 24h expiry when it rebases | Same APIs + `lib/booking-lifecycle.js` if still present after rebase | Inventing contract/payment/confirm order |
| Calendar fail-closed Direct holds (#56 server bits) | `api/calendar.js`, `api/quote.js`, `api/inquiries.js` hold/OTA fail-closed only | Rewriting #47 guest widget or #62 lock rule |
| Auth | Leave #50/#51 flagged | Rewriting those PRs without Joel authorization |

### UI / UX bot — bounded tasks

| Task | Stay inside | Do not take |
| --- | --- | --- |
| Reconcile #47 guest path onto post-#62 lock | `booking-v2.html`, `index.html`, `assets/js/booking-listing.js`, booking CSS, guest copy | Reintroducing 24h expiry; Stripe/OpenSign claims |
| Owner Calendar #56 | `owner-v1/calendar.html`, `assets/js/calendar-view.js`, calendar CSS | Rewriting shared `owner-shell.js` without Gate Keeper |
| Financials #58 / shell #57 / nav #65 | Coordinate one owner-shell source; rebase the others | Parallel uncoordinated edits to `assets/js/owner-shell.js`, `owner-v1/financials.html`, `assets/js/financials-v1.js` |

### Shared files that require Gate Keeper sequencing

| Cluster | Files | PRs |
| --- | --- | --- |
| Booking lock + guest submit | `lib/db.js`, `api/inquiries.js`, `api/owner.js`, `assets/js/booking-listing.js`, `assets/js/reservations-v1.js`, `booking-v2.html`, `index.html` | #62 then #47 |
| Owner shell / nav | `assets/js/owner-shell.js`, `assets/css/owner-shell.css`, `owner-v1.html`, Pricing/Financials HTML+JS | #57, #58, #65 |
| Calendar | `owner-v1/calendar.html`, `assets/js/calendar-view.js`, `api/calendar.js` | #56, #65, #47 |
| Auth helper (blocked) | `lib/owner-auth.js`, owner APIs | #50, #51 — do not merge |

---

## 7. Preview DB isolation checks — required BEFORE any test writes

Every bot that will POST an inquiry, owner action, calendar block, or any other write must complete these checks first. **Do not print secrets or connection strings.**

1. Confirm the deploy is a **Preview** (`target` is not `production`). Integration alias: https://cjtbookingpage-git-reorg-platform-v1-jibbailey82-7655.vercel.app (`dpl_GxHRodDs7qHn4FH3hNtatpaEFFGo` on tip `5c06fa8` as of this verification).
2. Confirm Preview env (names only): `CJT_DATABASE_URL` is set, `CJT_DB_TARGET=preview`, `CJT_ALLOW_PROD_DB` is **absent**.
3. Confirm the `CJT_DATABASE_URL` host prefix is the official Preview branch `preview/reorg/platform-v1` (`ep-rapid-bird`), **not** sibling `reorg-platform-v1` (`ep-long-hall`), and **not** Production.
4. Confirm Production (`cjtrealty.com` / `dpl_7LP9PXzR5EAZYwEfKQ8J39fWKxQc`) is a different SHA (`f8a1204…`) and will not receive the test write.
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
| Baseline SHA | `5c06fa838ed534f83cdeffaff5c1a35e827c7e82` |
| If tip moved | Re-fetch `origin/reorg/platform-v1` and record the new SHA in your PR; do not assume this file’s SHA is still HEAD |

Before starting feature work: read this file, then the assigned Issue, then `docs/PLATFORM-V1-ARCHITECTURE.md`. Do not merge #50/#51 as written. Do not touch draft PR #24. Do not invent contract, payment, or confirmation sequence.
