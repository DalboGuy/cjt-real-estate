# Grok first assignment: public booking image pipeline

## Start here

Open `DalboGuy/cjt-real-estate` and work from `reorg/platform-v1`. Read:

- `AGENTS.md`
- `docs/AI-COLLABORATION.md`
- `docs/PLATFORM-V1-ARCHITECTURE.md`
- `docs/PLATFORM-MAPS.md`
- `docs/REPAIR-BACKLOG-2026-09-06.md`
- `docs/PROJECT-ACCEPTANCE-GATE.md`
- `docs/BOOKING-ROOM-PHOTO-FOLDERS-2026-09-06.md`

If any of these files or the owner-approved source assets are unavailable, stop and report the missing item. Do not guess.

## Assignment

Create `grok/public-image-pipeline` and implement the **Public Booking Image Pipeline** for the public booking page.

Replace brittle Google Drive thumbnail and fallback behavior with a stable, read-only public image delivery approach and one canonical asset manifest. Preserve exactly:

- Opening collage order: `Copy of 8.jpg`, `30.jpg`, `Copy of 14.jpg`, `Copy of 5.jpg`, `Copy of 40.jpg`, `Copy of 23.jpg`.
- Room groups and names: Master Bedroom, Boho Room, Glam Room, Flex Room, and Bunk Room.
- Owner-approved room membership and photo counts from the source documentation.

Do not modify pricing, availability, booking logic, reservations, payments, authentication, reviews, amenities, or map behavior. Do not modify `main`, production data, or production environment variables.

## Delivery requirements

- Keep the manifest as the single application source for public image URLs, opening order, room grouping, labels, and alt text.
- Use stable read-only URLs that load anonymously in a Vercel preview; do not rely on authenticated Drive browsing or fragile thumbnail URL conversion.
- Do not substitute an unapproved image when an asset fails. Make the failure visible and document it.
- Preserve responsive behavior and accessible image labeling.
- Open a pull request targeting `reorg/platform-v1`.
- Include the preview URL, changed-file summary, validation commands, acceptance results, and known limitations in the pull request.
- Do not describe the feature as Built until the image-specific acceptance gate passes.
