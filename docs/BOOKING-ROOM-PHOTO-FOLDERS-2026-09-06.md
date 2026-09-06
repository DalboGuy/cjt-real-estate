# Booking room photo folders — 2026-09-06

Status: connected on `reorg/platform-v1` preview.

The owner supplied five Google Drive folders and directed that each folder name become the guest-facing room name. No room name or bed configuration is inferred by CJT code.

## Folder mapping

- **Master Bedroom** — Drive folder `1IxJqk17K7skT9ss5LMXQ6_WrFuCbp5W_` — 5 images.
- **Boho Room** — Drive folder `1PHttJna7uy8D_d47gs_9Qz19oIdW7kJh` — 2 images.
- **Glam Room** — Drive folder `1kk2QcvsaZxM8NJqqr9agvAmNWLWmsRQY` — 2 images.
- **Flex Room** — Drive folder `1o-nrG3bMMqgZ4-Egm2XzNmXZ00MD2YGd` — 2 images.
- **Bunk Room** — Drive folder `1ui0dfMhlt5S4d2wLA34rtyteAHp9PQlk` — 1 image.

## Booking-page behavior

`Where you'll sleep` is generated from these five room groups. Each card uses a photo from its own folder, displays the folder name as the room name, shows the photo count, and opens only that folder's photo group in the room gallery modal.

The existing room bed-layout labels were intentionally removed from this widget because the folder links did not explicitly map those labels to the new room names. Bed descriptions should be added only after the owner confirms the room-to-bed mapping.

## Drive visibility release check

Drive metadata observed during integration:

- `Master Bedroom` currently has an `anyone` **writer** permission. This is too permissive for a public website asset folder and should be changed to **Anyone with the link — Viewer**.
- `Boho Room`, `Glam Room`, `Flex Room`, and `Bunk Room` currently show no public sharing permission in Drive metadata. Anonymous website visitors may not be able to load those thumbnails until public read access is enabled or the images are moved to a dedicated public asset store.

Do not treat owner-authenticated preview visibility as proof that the images are publicly readable.
