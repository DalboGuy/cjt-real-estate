# Agent instructions

## Branch and deployment safety

- Never modify or push `main` directly.
- Start each feature from `reorg/platform-v1` unless the issue says otherwise.
- Use one short-lived feature branch per feature and open a pull request for review.
- Do not change production data, production environment variables, or live integrations while working in preview.
- Never commit credentials, API keys, database URLs, private links, or exported personal data.

## Scope control

- Read the relevant architecture and acceptance documents before editing.
- Keep each branch focused on the assigned feature.
- Do not change pricing, reservations, payments, authentication, reviews, amenities, or map behavior unless the assignment explicitly includes that area.
- Do not infer property facts, room names, bed layouts, image ownership, or guest-facing claims. Use owner-approved source records and document the source.
- Preserve existing working behavior outside the assigned scope.

## Delivery rules

- Make the smallest complete change that satisfies the assignment.
- Add or update documentation for configuration, source-of-truth decisions, and known limitations.
- Validate the feature in a Vercel preview when the assignment changes public behavior.
- Record the acceptance tests and their results in the pull request.
- Do not call a feature `Built` until every applicable item in `docs/PROJECT-ACCEPTANCE-GATE.md` passes.
