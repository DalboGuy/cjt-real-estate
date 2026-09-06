# AI collaboration workflow

## Shared coordination model

GitHub is the shared coordination layer for independent coding agents. The repository documents are the durable memory; chat instructions are not sufficient on their own.

| Surface | Purpose |
| --- | --- |
| Issue | Assignment, scope, owner decisions, and acceptance criteria |
| Feature branch | Isolated implementation; never work directly on `main` |
| Pull request | Diff, design decisions, review, test evidence, and handoff |
| Vercel preview | Public behavior and responsive UI verification |
| Neon preview/development database | Development-only data surface; never use it to change production schema or data without approval |
| Merge | Explicit human-approved promotion to the integration branch |

## Required handoff

Every agent handoff must identify the repository, source branch, feature branch, changed files, preview URL, tests run, known limitations, and the next decision needed. If a required document or source asset is missing, stop and report the gap instead of guessing.

## Branch flow

1. Start from `reorg/platform-v1`.
2. Create a focused branch such as `grok/public-image-pipeline`.
3. Commit only the assigned feature and its documentation.
4. Open a pull request targeting `reorg/platform-v1`.
5. Provide preview and acceptance evidence.
6. Wait for human review before merge or any production action.

## Platform boundaries

- Vercel is the preview and web delivery surface.
- Neon is the development database surface.
- Google Drive or another approved asset store may remain the source of owner files, but public delivery must use a stable, read-only approach.
- GitHub is not a place for secrets or private owner files.
