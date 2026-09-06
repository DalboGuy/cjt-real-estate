# CJT Project Acceptance Gate

Use this checklist before a feature is marked Built or merged into the integration branch.

## Scope
- GitHub Issue exists and matches the work.
- No unrelated files/modules were changed.
- Owner-approved facts were not guessed or altered.

## Code / architecture
- One canonical implementation/source of truth.
- No unnecessary runtime patching or duplicate definitions.
- Secrets/configuration are outside source.
- Existing rollback path is preserved when replacing behavior.

## Testing
- Vercel preview builds successfully when applicable.
- Desktop acceptance tested.
- Mobile acceptance tested.
- Anonymous/public behavior tested for guest-facing features.
- Error/empty/failure state tested where applicable.
- Data-changing behavior tested only against approved development data.

## Data / production
- Database impact documented.
- Preview does not unintentionally write production data.
- Production remains unchanged unless explicitly approved.
- Production migrations require separate explicit approval.

## Handoff
- PR/commit summary states files changed and known limitations.
- Acceptance criteria are checked with evidence.
- Platform Maps status is updated only after acceptance.

If any required item is not verified, classify the feature as `Partial` or `Needs review`.
