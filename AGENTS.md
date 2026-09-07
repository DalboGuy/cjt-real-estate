# AGENTS

## Scope and safety rules
- All work for this initiative must target `reorg/platform-v1`.
- Do not modify `main` or production data.
- Keep changes minimal and scoped to the assigned task.
- Do not rotate or expose secrets in code, logs, issues, or pull requests.
- Any destructive data change requires owner approval before execution.

## Cross-system coordination workflow (GitHub, Vercel, Neon)
1. Open a GitHub issue/PR comment with planned scope, risks, and rollout order.
2. Apply code/config updates on `reorg/platform-v1` only.
3. Coordinate required Vercel settings/environment changes for the same branch.
4. Coordinate Neon schema/query/data-impact checks before merge when backend behavior is touched.
5. Validate branch behavior and record results in the PR before requesting merge.

## Repair backlog and acceptance gate
### Repair backlog
- Track follow-up fixes in GitHub issues linked to the active PR.
- Label any blocking repair item as `repair-blocker`.
- Do not merge while blocker items remain open.

### Acceptance gate (must pass before merge)
- Scope is limited to `reorg/platform-v1` and excludes production data updates.
- Required reviewers approve task scope and rollout notes.
- GitHub/Vercel/Neon coordination checklist is completed in the PR.
- No open `repair-blocker` issues remain.

## Grok assignment: public booking image pipeline
After this documentation is merged, Grok must:
1. Read this file and related PR notes.
2. Create branch `grok/public-image-pipeline` from `reorg/platform-v1`.
3. Implement the public booking image pipeline using the owner-approved ordering and room grouping below.

### Owner-approved image order and room grouping (do not reorder)
1. **Exterior** — Sand and Sea Manor front exterior  
   `https://drive.google.com/thumbnail?id=1FYUDJapvuncWuAgi-5GrjBd7yIdT3rgq&sz=w1800`
2. **Outdoor amenities** — Sand and Sea Manor fire-pit area  
   `https://drive.google.com/thumbnail?id=1RJDq9stveaJn6bOXrCThEXZ_PG0AgPwS&sz=w1400`
3. **Outdoor amenities** — Sand and Sea Manor hot tub  
   `https://drive.google.com/thumbnail?id=1drjbEb5SCm_XXPNrNknsqrIvOBG7vqCS&sz=w1400`
4. **Interior common space** — Sand and Sea Manor living room  
   `https://drive.google.com/thumbnail?id=1qULKBwPz44P3iomZSxd9USXTG25RcHxg&sz=w1600`

## Handoff requirement
Post-merge, Grok proceeds with `grok/public-image-pipeline` from `reorg/platform-v1` and keeps image sequencing/grouping unchanged.
