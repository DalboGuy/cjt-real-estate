# Project acceptance gate

A feature may be described as **Built** only when all applicable checks below pass and the evidence is attached to its pull request.

## Scope and source

- [ ] The implementation matches the assigned issue and does not include unrelated feature work.
- [ ] Owner-approved facts, images, names, and groupings are preserved exactly.
- [ ] The source of truth and any transformations are documented.
- [ ] No secrets, private owner files, or production data are committed.

## Behavior

- [ ] The public flow works anonymously in a Vercel preview.
- [ ] Direct links and refreshes work.
- [ ] Loading, missing-asset, and failure states are intentional and visible.
- [ ] Existing behavior outside the assignment remains unchanged.

## Responsive and accessibility checks

- [ ] Desktop and mobile layouts are usable without unintended horizontal page scrolling.
- [ ] Images have meaningful alternative text or are correctly treated as decorative.
- [ ] Keyboard focus and controls remain usable.
- [ ] Text remains readable at normal zoom.

## Delivery and handoff

- [ ] Targeted tests or validation commands are recorded.
- [ ] Preview URL and screenshots or clear reproduction steps are recorded.
- [ ] Known limitations and follow-up work are documented.
- [ ] A human has reviewed the diff before merge.

## Public booking image pipeline

- [ ] The canonical manifest contains the six exact opening photos in owner-approved order.
- [ ] The manifest contains the five exact room groups and preserves their owner-provided names and membership.
- [ ] Every referenced public image loads anonymously from the Vercel preview.
- [ ] The page does not depend on Google Drive thumbnail transformation or authenticated browsing.
- [ ] A failed image does not silently substitute an unapproved property image.
- [ ] Pricing, availability, reservations, payments, reviews, amenities, maps, and authentication are unchanged.
