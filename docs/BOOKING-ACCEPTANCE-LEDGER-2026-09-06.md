# Guest booking acceptance ledger — 2026-09-06

**Purpose:** restore a section-by-section acceptance checkpoint for the guest booking page after the P0 implementation work. This is an acceptance worksheet, not a claim that the page is accepted.

- **Implementation base:** `reorg/platform-v1` at the branch point used by this PR.
- **Acceptance PR branch:** `grok/booking-acceptance-ledger`.
- **Issue:** [#17 — Restore acceptance checkpoints via GitHub Issues](https://github.com/DalboGuy/cjt-real-estate/issues/17).
- **Gate:** [PROJECT-ACCEPTANCE-GATE.md](./PROJECT-ACCEPTANCE-GATE.md).

## How to use this ledger

The preparer did not run a browser or preview session for this ledger. Every checkpoint below is therefore **Pending** until Joel records evidence. Do not change a checkpoint to `Built` from this document. Use `Pending` for the test result and `Needs review` or `Partial` for the gate status until the complete desktop/mobile/anonymous matrix is evidenced.

For each row, Joel should record the preview URL and commit, timestamp in CT, viewport, signed-in state, fixture/data state, screenshot or recording link, and any console/network error. A result is `Pass` only when the stated behavior is observed; use `Fail` for a reproducible defect and `Pending` when the environment or evidence is unavailable.

## Environment prerequisites

| Prerequisite | Required condition / check | Current gate status | Evidence / owner action |
| --- | --- | --- | --- |
| Preview deployment | Use the PR preview or another explicitly identified preview URL; record the deployed commit. | Needs review | Joel: paste URL, commit SHA, and CT timestamp before testing. |
| Preview database | Preview must use the approved non-production DB branch and booking submissions must not create production holds/reservations. See [#19](https://github.com/DalboGuy/cjt-real-estate/issues/19) and [PREVIEW-DATABASE-SETUP.md](./PREVIEW-DATABASE-SETUP.md). | Needs review | Joel: verify the deployed env points to the approved preview DB; run only approved test data and attach the evidence. |
| OTA / iCal | Protected environment configuration must provide the iCal/OTA feed; no signed/private feed URL should be exposed in source or rendered page. See [#20](https://github.com/DalboGuy/cjt-real-estate/issues/20) and [OTA-CALENDAR-CONFIGURATION.md](./OTA-CALENDAR-CONFIGURATION.md). | Needs review | Joel: verify configuration in the deployment environment and test availability behavior without exposing the feed URL. |
| Stripe | Payment acceptance is **on hold** for this pass. Do not charge a card or treat payment as accepted; browse through the pre-payment flow only if the preview exposes it. See [#21](https://github.com/DalboGuy/cjt-real-estate/issues/21) and [STRIPE-PAYMENTS.md](./STRIPE-PAYMENTS.md). | Partial | Joel: record `Not tested — Stripe on hold`; report any client-trusted amount or premature confirmation as a failure. |
| 14-guest production constraint | UI/API preparation exists, but the production migration still requires Joel approval. See open [#22](https://github.com/DalboGuy/cjt-real-estate/issues/22) and [FOURTEEN-GUEST-OCCUPANCY.md](./FOURTEEN-GUEST-OCCUPANCY.md). | Partial | Joel: test 1–12 in preview; test 13–14 only against approved non-production data and record migration-pending behavior until production approval. |

## Acceptance matrix

### 1. Gallery

| Checkpoint | Desktop | Mobile | Anonymous / public | Evidence / result
| --- | --- | --- | --- |
| Opening gallery shows the owner-approved six opening photos, with no blank/stale image. | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | URL + commit: ____  Screenshots: ____  Result (`Pass`/`Fail`/`Pending`): ____  Notes: ____ |
| Gallery navigation/lightbox preserves the intended order and remains usable at the tested viewport. | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | Screenshot/video: ____  Result: ____  Notes: ____ |
| Bedroom photos render from the canonical asset set; no Drive-thumbnail fallback or broken image is visible. | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | Screenshot: ____  Console/network notes: ____  Result: ____ |

### 2. Booking controls

| Checkpoint | Desktop | Mobile | Anonymous / public | Evidence / result
| --- | --- | --- | --- |
| Arrival/departure controls accept a valid date range and visibly communicate unavailable/invalid dates. | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | Fixture/date range: ____  Screenshot: ____  Result: ____ |
| Guest control supports the approved range and displays clear behavior for 13–14 while production migration is pending. | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | Guest counts tested: ____  Screenshot/API evidence: ____  Result: ____ |
| Quote/availability response is understandable, loading and error states are usable, and no booking submission writes production data. | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | Preview DB evidence: ____  Network/error notes: ____  Result: ____ |
| Guest can reach the inquiry/hold boundary without requiring an account; no payment is accepted in this pass. | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | Screenshot: ____  Stripe note: ____  Result: ____ |

### 3. Rooms

| Checkpoint | Desktop | Mobile | Anonymous / public | Evidence / result
| --- | --- | --- | --- |
| Room names, counts, descriptions, and bedroom groupings are present once and agree with the canonical booking-page data. | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | Screenshot(s): ____  Source/fixture: ____  Result: ____ |
| Room cards/photos do not duplicate, disappear, or depend on contradictory stale HTML being removed at runtime. | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | Screenshot/video: ____  Console notes: ____  Result: ____ |

### 4. Amenities

| Checkpoint | Desktop | Mobile | Anonymous / public | Evidence / result
| --- | --- | --- | --- |
| Amenities list contains the approved guest-facing facts, with no placeholder or contradictory copy. | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | Screenshot: ____  Fact/source note: ____  Result: ____ |
| Amenities layout remains readable, complete, and non-overlapping at the mobile viewport. | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | Mobile screenshot: ____  Result: ____ |

### 5. Reviews

| Checkpoint | Desktop | Mobile | Anonymous / public | Evidence / result
| --- | --- | --- | --- |
| Approved review content renders in the correct section without a loading failure, placeholder, or accidental private/auth-only gate. | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | Screenshot: ____  Console/network notes: ____  Result: ____ |
| Review text and controls remain readable and usable without horizontal overflow or clipped content. | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | Desktop/mobile screenshots: ____  Result: ____ |

### 6. Map

| Checkpoint | Desktop | Mobile | Anonymous / public | Evidence / result
| --- | --- | --- | --- |
| Map/location section loads or presents its documented fallback without blocking the rest of the guest page. | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | Screenshot + network notes: ____  Result: ____ |
| Map interaction and location presentation remain usable at the mobile viewport and do not expose credentials. | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | Mobile screenshot: ____  Result: ____ |

### 7. Policies

| Checkpoint | Desktop | Mobile | Anonymous / public | Evidence / result
| --- | --- | --- | --- |
| Check-in/out, cancellation, house rules, occupancy, and other owner-approved policy facts are visible and internally consistent. | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | Screenshot(s): ____  Fact/source note: ____  Result: ____ |
| Policies are readable without clipping, hidden overflow, or an auth requirement; 13–14 occupancy language reflects migration-pending behavior where applicable. | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | **Pending / Needs review** — [ ] | Mobile screenshot: ____  Guest-count note: ____  Result: ____ |

## Issue and implementation context

| Reference | State / relevance to this ledger |
| --- | --- |
| [#12 — stable public booking image pipeline](https://github.com/DalboGuy/cjt-real-estate/issues/12) | Closed/merged implementation reference; gallery and bedroom-photo acceptance remains Pending until this matrix has evidence. |
| [#18 — canonical booking-page implementation](https://github.com/DalboGuy/cjt-real-estate/issues/18) | Closed implementation reference; section-by-section guest acceptance remains Pending until this matrix has evidence. |
| [#19 — preview database isolation](https://github.com/DalboGuy/cjt-real-estate/issues/19) | Closed reference; environment isolation still must be demonstrated for the preview used by Joel. |
| [#20 — OTA calendar feed configuration](https://github.com/DalboGuy/cjt-real-estate/issues/20) | Closed reference; verify protected configuration and availability behavior, not just code presence. |
| [#21 — Stripe payment and confirmation loop](https://github.com/DalboGuy/cjt-real-estate/issues/21) | Closed implementation reference, but payment acceptance is on hold for this ledger. |
| [#22 — true 14-guest support](https://github.com/DalboGuy/cjt-real-estate/issues/22) | Open; production migration is pending explicit approval, so 13–14 cannot be marked accepted here. |

## Exact Joel runbook

1. Open the PR preview URL in a signed-out private/incognito window. Record the URL, deployed commit, and CT timestamp.
2. Confirm the preview DB is the approved non-production branch before submitting any test inquiry/hold. Do not use production data or real payment credentials.
3. At desktop (recommended 1440×900), walk the seven sections in order and fill every Desktop cell with screenshot/video and result evidence.
4. Repeat at a mobile viewport (recommended 390×844), including date/guest controls, gallery navigation, policy readability, and map fallback/interaction.
5. Repeat the public/anonymous check in a fresh private window with no account session. Record any auth redirect, blank state, console error, or network failure.
6. For dates, OTA availability, or booking attempts, record the fixture and response behavior; never paste private iCal URLs, secrets, or payment data into the issue/PR.
7. Add a short sign-off comment to [#17](https://github.com/DalboGuy/cjt-real-estate/issues/17) only after the matrix has evidence. Until then, leave the overall gate as `Needs review` or `Partial`.

## Joel sign-off

- [ ] Desktop evidence complete
- [ ] Mobile evidence complete
- [ ] Anonymous/public evidence complete
- [ ] Preview DB isolation evidenced
- [ ] iCal/OTA behavior evidenced without exposing a private URL
- [ ] Stripe remains explicitly on hold for this pass
- [ ] 14-guest production migration remains unapproved unless separately approved

**Overall result:** `Pending`  **Gate status:** `Needs review`  **Joel:** ____  **Date (CT):** ____  **Sign-off comment/link:** ____
