# API response contract (UI / UX)

Status: **Draft — documents what the APIs already return** on `reorg/platform-v1` tip `884c127` (merged **#71** atomic inquiry / replay, **#72** fail-closed `sourceHealth`, **#73** quote nightly consistency). No application code changed in this docs PR.

This file is the UI/UX source of truth for **error codes, HTTP status, and JSON shapes** on guest booking and owner booking/calendar. It records **real** fields already returned. Where product language differs from the wire (`availability_unknown`, `duplicate_submission`, `fromStatus` / `toStatus`), the alias is called out so UI can map it — do not invent those strings on the server.

Related: [docs/OTA-CALENDAR-CONFIGURATION.md](./OTA-CALENDAR-CONFIGURATION.md), [docs/OPENSIGN.md](./OPENSIGN.md), [docs/INTEGRATION-RECONCILIATION.md](./INTEGRATION-RECONCILIATION.md).

---

## How to read this

- **Wire** = exact `error` string and JSON keys in the HTTP body today.
- **UI state** = the guest or owner screen the client should show.
- **Do not** treat `blockedDates: []` as “the house is open” unless `sourceHealth.ok === true` and HTTP is 200.
- **Do not** invent new `error` codes in UI. If a desired code is listed as an alias only, map it client-side.

Shared error envelope (most failures):

```json
{ "error": "<code>", "message": "<human copy>" }
```

Some paths add extra keys (`reservation`, `sourceHealth`, `from`, `to`, `action`, `missingEnv`). Success bodies are **not** wrapped in `{ data: … }`.

---

## UI / UX state map (read this first)

| UI state | What it means for the user | Wire today | HTTP | Client must |
| --- | --- | --- | --- | --- |
| **saved** | Write succeeded; show confirmation | `{ "ok": true, … }` plus the saved resource. Guest listing heart is **not** an API. | 200 | Show “Saved.” / “Quote saved.” / “Owner stay saved” / “Calendar added”. Keep the returned `id`. |
| **save failed** | Write did not persist | Specific `error` + `message` (no `save_failed` code) | 400 / 409 / 503 / 500 | Show `message` (fallback `error`). Do not pretend the resource saved. Re-enable the button. |
| **dates_unavailable** | Those nights are held or booked | `error: "dates_unavailable"` | 409 | Block booking / quote. Refresh calendar. Do **not** show a reservation id (none is returned). |
| **availability_unknown** / fail-closed | Live feeds could not be verified; inventory is **unknown**, not empty | `sourceHealth.failClosed === true` and `sourceHealth.ok === false`. Calendar/quote HTTP **503**. Codes: `ota_calendar_unhealthy`, `ota_calendar_configuration_missing`, or calendar-only `availability_unavailable`. | 503 | Pause date picking and quotes. Treat `blockedDates: []` as **unknown**, not open. There is **no** `availability_unknown` string on the wire. |
| **empty** | Healthy “nothing here” | 200 + empty list / empty `blockedDates` **and** `sourceHealth.ok === true` (calendar/quote) | 200 | Show an empty state. Distinct from fail-closed. A valid iCal with zero `VEVENT`s is empty **and healthy**. |
| **401 / expired login** | Owner session missing or past 12h | `{ "error": "unauthorized" }` | 401 | Show the owner passcode login. Do not keep editing. Distinct from `{ "error": "invalid_passcode" }` (wrong code) and `{ "error": "owner_login_not_configured" }` (503). |
| **duplicate_submission / replayed** | Same guest + same dates retried; existing hold returned | `{ "replayed": true, "reservation": { "id": "…" }, "quote", "message" }` | **200** (new hold is **201** + `replayed: false`) | Treat as success. **`reservation.id` is always present** on both 200 and 201. There is **no** `duplicate_submission` error. |
| **invalid_transition** | Owner action not legal from current status | `{ "error": "invalid_transition", "message", "from", "to", "action" }` | 409 | Show `message`. Refresh the reservation. Wire keys are `from` / `to` / `action` — **not** `fromStatus` / `toStatus`. |
| **not_updated** | Action was legal but the row did not change (race / already applied) | `{ "error": "not_updated", "message", "from", "to", "action" }` | 409 | Same toast as a stale update: refresh and retry. |

---

## 1. Saved / save failed

There is **no** `saved` or `save_failed` `error` code. Success is HTTP 200 + `ok: true` (or 201 for a **new** inquiry). Failures use the specific codes below.

### Guest listing heart (“Saved”)

`assets/js/booking-listing.js` toggles `localStorage` key `cjt_sand_sea_saved`. **No API.** A browser that blocks storage can fail silently; that is not an HTTP contract.

### Owner writes (`POST /api/owner`)

All of these require an owner session (or preview password-free). Unauthenticated → **401** `{ "error": "unauthorized" }` (see §5).

| Action | Success 200 | Typical failure |
| --- | --- | --- |
| `update` (reservation status) | `{ ok: true, reservation: { id, status, … } }` — may include `opensign: { documentId, signingUrl }` after `contract_sent` | 409 `invalid_transition` / `not_updated` / `reservation_closed` / `payment_not_verified`; 400 `missing_id` / `invalid_status`; 404 `reservation_not_found`; 503 `opensign_not_configured`; 502 `opensign_send_failed` |
| `update_quote` | `{ ok: true, quote }` | 400 `missing_id` / `invalid_quote`; 404 `reservation_not_found`; 409 `reservation_closed` / `payment_started` |
| `calendar_feeds_save` | `{ ok: true, feed: { id, label, hostHint, origin: "owner" } }` | 400 `missing_label` / `invalid_feed_url`; 409 `calendar_limit` |
| `calendar_feeds_clear` | `{ ok: true, id }` | 400 `invalid_id` |
| `calendar_entry_save` | `{ ok: true, entry: { id, kind, start_date, end_date, notes } }` | 400 `invalid_kind` / `invalid_dates` / `invalid_range` |
| `calendar_entry_delete` | `{ ok: true, id }` | 400 `invalid_id`; 404 `not_found` |
| `calendar_settings_save` | `{ ok: true, settings: { prepBufferEnabled, showGuestNames, showGuestContact } }` | 500 `owner_api_error` |
| `login` | `{ ok: true }` + `Set-Cookie: cjt_owner_session=…` | 401 `invalid_passcode`; 503 `owner_login_not_configured` |
| `logout` | `{ ok: true }` + cleared cookie | — |

UI copy already in use: reservations toast **“Saved.”** / **“Quote saved.”**; calendar **“Owner stay saved”** / **“Manual block saved”** / **“Calendar added”**; feed form fallback **“Save failed”** (generic — the body `message` is preferred).

Catch-all owner 500: `{ "error": "owner_api_error" }` (no `message`).

---

## 2. `dates_unavailable` (409)

Nights are known **unavailable**. This is **not** fail-closed unknown availability.

### `GET /api/quote` — blocked stay

```json
{
  "error": "dates_unavailable",
  "message": "One or more requested nights are no longer available.",
  "sources": [ /* see §8 */ ],
  "sourceHealth": { /* see §8; ok true, failClosed false */ }
}
```

### `POST /api/inquiries` — OTA / owner block / another guest’s lock

```json
{
  "error": "dates_unavailable",
  "message": "Those dates are currently being held or are booked."
}
```

Race on `reservations_no_overlap` when the blocker is **another** guest:

```json
{
  "error": "dates_unavailable",
  "message": "Those dates were just placed on hold by another guest."
}
```

Inquiry **409 does not include** `sources`, `sourceHealth`, or `reservation`. If the overlap is **this guest’s own** locking stay, the handler **replays** instead (200 + `replayed: true`) — see §6.

UI: guest booking form shows `message`. Owner pricing tester titles this **“Those nights are unavailable.”** Refresh `/api/calendar` after a 409.

---

## 3. Availability unknown / fail-closed (`sourceHealth`, 503)

**Product name:** availability unknown. **Wire:** there is no `availability_unknown` code.

Fail-closed rule (#72): a unique **live iCal** source that is missing, HTTP-failed, HTML, empty-body, truncated, or not a real `VCALENDAR` must **not** look like an open calendar.

`sourceHealth` is the authority:

```json
{
  "ok": false,
  "failClosed": true,
  "liveCount": 2,
  "unhealthyCount": 1,
  "unhealthy": ["airbnb"],
  "checkedAt": "2026-09-07T12:00:00.000Z"
}
```

- `ok === true` only when `liveCount > 0` **and** `unhealthyCount === 0`.
- `failClosed` is always `!ok`.
- `direct` and `owner_blocks` in `sources[]` are **not** live iCal and do **not** count toward `liveCount`.
- Duplicate owner URLs (`duplicateOf`) are ignored for health.

### `GET /api/calendar` — 503 (Cache-Control: `no-store`)

Always includes `blockedDates: []` so a naive client cannot paint “all open.”

**Unhealthy feed**

```json
{
  "blockedDates": [],
  "sources": [
    { "kind": "ical", "name": "airbnb", "origin": "env", "ok": false, "error": "http_500" }
  ],
  "sourceHealth": { "ok": false, "failClosed": true, "liveCount": 1, "unhealthyCount": 1, "unhealthy": ["airbnb"], "checkedAt": "…" },
  "checkedAt": "…",
  "error": "ota_calendar_unhealthy",
  "message": "One or more calendar feeds could not be verified. Availability is paused until feeds are healthy."
}
```

**No feeds configured**

```json
{
  "blockedDates": [],
  "sources": [],
  "sourceHealth": { "ok": false, "failClosed": true, "liveCount": 0, "unhealthyCount": 0, "unhealthy": [], "checkedAt": "…" },
  "checkedAt": "…",
  "error": "ota_calendar_configuration_missing",
  "missingEnv": ["AIRBNB_ICAL_URL", "VRBO_ICAL_URL"],
  "message": "No calendar feeds configured. Add up to 10 in Owner Calendar, or set AIRBNB_ICAL_URL / VRBO_ICAL_URL / BOOKING_COM_ICAL_URL."
}
```

**Unexpected fallback** (non-OTA throw): `error: "availability_unavailable"` plus the same empty `blockedDates` + fail-closed `sourceHealth`. Guest JS historically throws this string on any non-OK calendar response.

### `GET /api/quote` — 503 (no quote)

Same health codes. **`available` and `quote` are omitted.**

```json
{
  "error": "ota_calendar_unhealthy",
  "message": "One or more calendar feeds could not be verified. Quotes are paused until availability sources are healthy.",
  "sources": [ /* … */ ],
  "sourceHealth": { "ok": false, "failClosed": true, "checkedAt": "…" },
  "checkedAt": "…"
}
```

`ota_calendar_configuration_missing` on quote also includes `missingEnv`.

Pricing validation errors stay **400 / 422** and **do not** include `sourceHealth` (`invalid_dates`, `invalid_guests`, `stay_too_long`, `pricing_not_published`, `minimum_stay`). Generic quote 500: `{ "error": "quote_unavailable", "message": "…" }`.

**UI rule:** if HTTP is 503 **or** `sourceHealth.ok === false`, pause the picker and quote tester. Do not infer health by filtering `sources[]` for names `airbnb` / `vrbo` only — owner connections are keyed `owner:<id>`.

---

## 4. Empty (healthy)

Empty is a **200**. Fail-closed empty `blockedDates` is a **503**.

| Surface | Empty 200 body |
| --- | --- |
| `GET /api/calendar` | `{ blockedDates: [], sources, sourceHealth: { ok: true, failClosed: false, … }, checkedAt }` — valid empty iCal is healthy (`count: 0`, `ok: true`). |
| `GET /api/quote` | Not empty: either a quote, 409 dates, 503 health, or a validation error. |
| `GET /api/owner` | `{ reservations: [], temporaryPasswordFree }` — “No matching direct bookings.” |
| `calendar_feeds_status` | `{ feeds: [], envFeeds: [], liveSources: [], … }` — “No inbound calendars yet.” |
| `calendar_view` | `events: []`, `upcoming: []`, `conflicts: []`, `nights` may still have CI/CO slots. Occupancy `booked: 0`. |

---

## 5. 401 / expired login

Owner modules (`/api/owner`, and the same cookie on `/api/dashboard`, `/api/pricing`, `/api/financials`, `/api/communications`, `/api/owner-tasks`) use cookie `cjt_owner_session`:

- `HttpOnly; Secure; SameSite=Strict; Max-Age=43200` (12 hours)
- Server also checks `owner_sessions.expires_at > now()`
- Missing, unknown, or expired token → **401** `{ "error": "unauthorized" }` (no `message`)

Login failures (still on `POST /api/owner` `{ "action": "login" }`):

| HTTP | `error` | UI |
| --- | --- | --- |
| 401 | `invalid_passcode` | “Invalid passcode.” |
| 503 | `owner_login_not_configured` | “Owner login is not configured for this environment.” |
| 200 | — (`ok: true`) | Enter the app. |

Preview password-free: `authenticated()` returns true without a cookie. `GET /api/owner` then includes `temporaryPasswordFree: true`. Writes that still hit 401 should tell the owner **password-free preview is read-only**.

Named-user `/api/auth` is a parallel path (`invalid_credentials`, session `expiresAt`). Current owner-v1 modules use the passcode cookie above.

---

## 6. Duplicate submission / replayed

**Wire:** `replayed` boolean. **Not** `duplicate_submission`.

Identity: `lower(guest_email)` + exact `checkin` + exact `checkout` + locking status (`inquiry_hold`, `hold_verified`, `contract_sent`, `contract_signed`, `confirmed`). Released / expired / cancelled rows are **not** duplicates.

### Success / replay body (`POST /api/inquiries`)

`Cache-Control: no-store`.

```json
{
  "reservation": {
    "id": "DB-20261010-ABC123",
    "checkin": "2026-10-10",
    "checkout": "2026-10-13",
    "status": "inquiry_hold",
    "hold_expires_at": null
  },
  "quote": { /* stored or just-quoted seasonal-v2 object */ },
  "replayed": false,
  "message": "Your dates are reserved while CJT reviews your request and remain unavailable until an owner releases them."
}
```

| Case | HTTP | `replayed` | `reservation.id` |
| --- | --- | --- | --- |
| New hold | **201** | `false` | **Always present** (new `DB-…` id) |
| Retry / double-submit / overlap race on **own** stay | **200** | `true` | **Always present** (existing id) |

`hold_expires_at` is **null** (#67). Copy does **not** mention 24 hours. Current guest JS already requires `d.reservation.id` on any `r.ok`; it ignores `replayed`.

**UI:** show the hold message + booking reference. A replay is not an error. Only 409 `dates_unavailable` (or validation / 503 occupancy) is a failed submit.

Other inquiry errors:

| HTTP | `error` | When |
| --- | --- | --- |
| 400 | `invalid_request` | Missing name/email/dates or guests out of range |
| 400 | `invalid_dates` | Checkout ≤ check-in |
| 400 | `past_date` | Check-in before today |
| 405 | `method_not_allowed` | Not POST |
| 422 / `e.status` | `pricing_unavailable` or pricing `e.code` | Quote engine failed before persist |
| 503 | `occupancy_migration_pending` | 13–14 guests hit a pending DB check |
| 500 | `booking_unavailable` | Unexpected persist failure |

---

## 7. `invalid_transition` / `not_updated` (`from` / `to` / `action`)

Owner `POST /api/owner` `{ "action": "update", "id", "status" }` runs `planOwnerTransition` **before** SQL (#68). Illegal pairs do not send OpenSign.

**Wire keys are `from`, `to`, `action`.** There are no `fromStatus` / `toStatus` fields. UI may alias `from` → fromStatus and `to` → toStatus in local types.

```json
{
  "error": "invalid_transition",
  "message": "Cannot apply accept_request while the reservation is hold_verified.",
  "from": "hold_verified",
  "to": "hold_verified",
  "action": "accept_request"
}
```

Unrecognized action (should not happen if the client only sends known buttons): `message` “That owner action is not a recognized booking transition.”, `to: null`.

Matched-zero `UPDATE … RETURNING` (row moved under the owner):

```json
{
  "error": "not_updated",
  "message": "The reservation changed or this action is no longer available. Refresh and try again.",
  "from": "inquiry_hold",
  "to": "hold_verified",
  "action": "accept_request"
}
```

Both are **409**. Reservations UI today surfaces `message` as “That booking update could not be completed: …”.

Allowed `status` (action) values and legal `from` statuses:

| `action` | Allowed `from` | Result `to` |
| --- | --- | --- |
| `accept_request` | `inquiry_hold` | `hold_verified` |
| `reject_request` | `inquiry_hold`, `hold_verified`, `contract_sent`, `contract_signed` | `released` |
| `maintain_hold` | `inquiry_hold`, `hold_verified` | same as `from` |
| `contract_sent` | `inquiry_hold`, `hold_verified`, `contract_sent` | `contract_sent` |
| `contract_signed` | those plus `contract_signed` | `contract_signed` |
| `deposit_received` | locking statuses including `confirmed` | `confirmed` |
| `release_dates` | locking statuses | `released` |

Closed (`released` / `expired` / `cancelled`) → `invalid_transition` for those actions (or `reservation_closed` on quote / contract send). `deposit_received` also 409s `payment_not_verified` when Stripe is not verified.

---

## 8. `sources[]` and `sourceHealth` — required on calendar + quote?

**Yes, on guest `/api/calendar` and `/api/quote` health and availability paths.**

| Response | `sources[]` | `sourceHealth` |
| --- | --- | --- |
| Calendar 200 | **Required** | **Required** |
| Calendar 503 fail-closed | **Required** (may be `[{ name: "ota", ok: false, … }]` on a generic throw) | **Required**, with `ok: false`, `failClosed: true` |
| Quote 200 | **Required** | **Required** |
| Quote 409 `dates_unavailable` | **Required** | **Required** |
| Quote 503 feed health | **Required** | **Required** |
| Quote 400 / 422 pricing | omitted | **omitted** — do not treat as fail-closed |
| Inquiry 201 / 200 / 409 | omitted | omitted |
| Owner `calendar_view` | `sync.sources` (OTA probe). **No** `sourceHealth` object today | Use `sync.configError` if the owner probe threw |
| Owner `calendar_feeds_status` | `liveSources` (same probe objects). **No** `sourceHealth` | 200 even when a feed is down — owner diagnostic, not guest fail-closed |

### `sourceHealth` (canonical)

```json
{
  "ok": true,
  "failClosed": false,
  "liveCount": 2,
  "unhealthyCount": 0,
  "unhealthy": [],
  "checkedAt": "2026-09-07T12:00:00.000Z"
}
```

### `sources[]` item (iCal)

```json
{
  "kind": "ical",
  "name": "airbnb",
  "label": "airbnb",
  "channel": "airbnb",
  "ok": true,
  "count": 3,
  "error": null,
  "origin": "env",
  "hostHint": "example.test",
  "duplicateOf": null
}
```

Guest merge also appends:

```json
{ "name": "direct", "ok": true, "count": 1, "origin": "db", "channel": "direct" }
```

```json
{ "name": "owner_blocks", "ok": true, "count": 2, "origin": "owner", "channel": "manual_block" }
```

`error` on an unhealthy iCal is a public token (`http_500`, `feed_timeout`, `feed_unhealthy`, or a validation sentence such as HTML-instead-of-iCal). Full feed URLs are never returned.

Calendar 200 also sets `Cache-Control: s-maxage=60, stale-while-revalidate=180`. Quote 200 is `no-store`.

### Quote 200

```json
{
  "available": true,
  "quote": {
    "currency": "USD",
    "checkin": "2026-11-10",
    "checkout": "2026-11-12",
    "guests": 2,
    "nights": 2,
    "lodgingSubtotal": 1058,
    "cleaningFee": 240,
    "taxRate": 0.15,
    "taxes": 194.7,
    "total": 1492.7,
    "averageNightly": 529,
    "priceLines": [{ "season": "Non-Peak 1", "nightlyRate": 529, "nights": 2, "subtotal": 1058 }],
    "minimumStay": 2,
    "pricingThrough": "…",
    "paymentSchedule": { "mode": "full", "dueAtBooking": 1492.7, "remainingBalance": 0 },
    "quoteVersion": "seasonal-v2",
    "quotedAt": "…"
  },
  "checkedAt": "…",
  "sources": [ /* … */ ],
  "sourceHealth": { "ok": true, "failClosed": false, "liveCount": 1, "unhealthyCount": 0, "unhealthy": [], "checkedAt": "…" }
}
```

`lodgingSubtotal + cleaningFee + taxes === total`; `priceLines` subtotals sum to `lodgingSubtotal`; `averageNightly` is lodging / nights (#73).

---

## 9. Owner-block vs direct conflict shapes

### Already present — owner calendar snapshot

`POST /api/owner` `{ "action": "calendar_view" }` returns **200** (even if OTA probe failed — then `sync.configError` is set and `sync.sources` may be `[{ name: "ota", ok: false, … }]`).

A night is a **conflict** when more than one **claiming** channel (anything except `prep`) occupies it, **or** a prep night overlaps occupancy.

```json
{
  "nights": {
    "2026-09-12": {
      "date": "2026-09-12",
      "channels": ["direct", "manual_block"],
      "eventIds": ["direct:DB-…", "entry:12"],
      "conflict": true,
      "checkins": [],
      "checkouts": [],
      "prep": false
    }
  },
  "conflicts": [
    { "date": "2026-09-12", "channels": ["direct", "manual_block"] }
  ]
}
```

Channel ids: `direct`, `airbnb`, `vrbo`, `booking.com`, `owner_stay`, `manual_block`, `prep`, `other`.

`owner_stay` and `manual_block` **do** conflict with `direct` on the same night (`unique` claiming channels > 1). Same for Direct + Airbnb. Owner stays / manual blocks **block guests** but do **not** count as booked occupancy.

`calendar_entry_save` does **not** 409 on overlap. It returns 200; the owner UI may toast “Owner stay saved. Overlaps an existing guest stay or OTA block.”

Events carry `channel`, `kind`, `reservationId` (direct) or `entryId` (owner block/stay), `blocksGuests`, `occupancy`, `canDelete`.

### Guest calendar / quote / inquiry — not present (TBD, slice B)

Guest `/api/calendar` only returns a merged `blockedDates: string[]`. `/api/quote` and `/api/inquiries` 409 `dates_unavailable` **do not** say whether the blocker was an owner block, a direct hold, or an OTA night.

**Slice B TBD (do not invent in UI):**

- Per-night or per-conflict `reason` / `channels` on guest calendar or quote 409
- Distinct inquiry errors such as `owner_block` vs `direct_overlap`
- Server-side reject of `calendar_entry_save` that overlaps a locking direct stay

Until that slice lands, guest UI has a single unavailable state; owner UI already has `nights[].conflict` + `conflicts[]`.

---

## 10. Alias cheat sheet (product → wire)

| Product / UI phrase | Do **not** expect on the wire | Use instead |
| --- | --- | --- |
| `availability_unknown` | that string | HTTP 503 and/or `sourceHealth.ok === false` (`ota_calendar_unhealthy`, `ota_calendar_configuration_missing`, `availability_unavailable`) |
| `duplicate_submission` | that string | `replayed: true` on HTTP 200; `reservation.id` always set |
| `fromStatus` / `toStatus` | those keys | `from` / `to` / `action` on 409 `invalid_transition` and `not_updated` |
| `save_failed` | that string | `message` + specific `error` (`invalid_dates`, `calendar_limit`, `payment_started`, …) |
| “24-hour hold” | expiry copy | `hold_expires_at: null`; dates stay locked until owner release |

---

## 11. Current UI gaps (notes only — this PR does not change JS)

- Guest calendar still decides `calendarHealthy` by filtering `sources[]` for names `airbnb` and `vrbo`. After #72 it should prefer **`sourceHealth.ok`** and treat any non-200 as fail-closed.
- Guest inquiry success ignores `replayed` (safe: `r.ok` + `reservation.id` still work).
- Owner reservations collapse all 409s into one toast; they already show `message`, including `from`/`to` if the client later wants a richer invalid-transition banner.
- Owner `calendar_view` can be 200 with a failed OTA probe (`sync.configError`). That is **not** the guest fail-closed contract.

---

## 12. Sources inspected

`api/inquiries.js`, `api/owner.js`, `api/calendar.js`, `api/quote.js`, `lib/inquiry-create.js`, `lib/booking-transitions.js`, `lib/availability.js`, `lib/calendar-view.js`, plus tests `lib/inquiry-create.test.js`, `lib/booking-transitions.test.js`, `lib/availability.test.js`.
