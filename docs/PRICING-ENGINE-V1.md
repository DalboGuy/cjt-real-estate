# Pricing Engine v1

Status: protected feature work for Issue #102. Not enabled in Production.

## Quote precedence

1. Load the seasonal nightly rate for every occupied night.
2. Apply the most specific active date override for the requested channel.
3. Evaluate active discounts. Discounts do not stack in v1; the eligible offer with the largest dollar benefit wins.
4. Calculate the operating-cost floor. `monitor` reports risk without changing the quote; `enforce` raises lodging to the floor; `off` skips it.
5. Add the guest cleaning fee and calculate tax using the existing shared quote breakdown.
6. Store the exact resulting quote with the request. Later pricing edits never rewrite that snapshot.

## Cost-floor math

Operating cost is allocated by occupied nights:

`allocated operating cost = monthly operating cost × 12 ÷ 365 × nights`

The minimum lodging charge is solved so the post-channel-fee proceeds cover the allocated operating cost, actual cleaning cost, and optional minimum contribution:

`required lodging = (allocated operating cost + cleaning cost + minimum contribution) ÷ (1 - channel fee rate) - cleaning fee charged`

The result rounds **up** to the nearest cent. Taxes are pass-through and are not counted as margin or operating cost. Channel fees are modeled against lodging plus the guest cleaning fee, excluding tax. This policy is explicit and replaceable if a channel contract uses a different fee base.

The old 7-day worksheet divided a monthly cost by seven. That is not a weekly allocation. With monthly operating cost of $6,368.21, the annualized seven-night allocation is about $1,465.56 (`6368.21 × 12 ÷ 365 × 7`).

## CSV format

Required columns vary by row. A single file may contain both row types.

```csv
record_type,name,channel,start_date,end_date,discount_type,value,minimum_nights,maximum_nights,eligible_weekdays,nightly_rate,active
discount,Midweek direct,direct,2026-09-01,2026-12-31,percent,15,2,4,Mon|Tue|Wed|Thu,,yes
discount,Extended stay,all,,,percent,10,7,,,,yes
override,Thanksgiving,all,2026-11-25,2026-11-29,,,,,,850,yes
```

Import is always two-step: parse/validate preview, then explicit owner confirmation. The server validates the same bytes again on commit and records a SHA-256 hash to prevent accidental duplicate imports.

## Protection rules

- The owner API remains authenticated.
- Internal operating costs and floor diagnostics never appear in the public quote response.
- New cost policies default to `monitor`; a deployment alone cannot raise a guest quote.
- Production schema and environment stay unchanged until a separate owner-approved migration/cutover.
- Stripe and guest messaging are outside this workstream.

## Migration and rollback

The additive Preview-first migration is `docs/migrations/005-pricing-engine-v1.sql`.
Application rollback leaves its tables dormant so pricing rules and import evidence
remain recoverable. Destructive table removal is a separate, explicitly approved
operation after export; it is never part of an automatic rollback.
