# Internal Skill Anatomy Baseline

Refreshed: 2026-05-18
License: MIT
Copyright boundary: Use internalized facts, section names, and local comparison fields only; do not copy third-party prose or host-specific shell hooks into local skills.

## Baseline Counts

- Baseline skills: 23
- Baseline agent patterns: 3
- Baseline reference packs: 5
- Hook portability notes: 3

## Required Skill Anatomy

- Overview
- When to Use
- When not to use
- Step 0
- Decision tree
- Procedure
- Common rationalizations
- Red flags
- Checklist
- Failure modes
- Output contract
- Guard rails
- Verification
- Related

## Reference-Pack Model

Baseline references are grouped as `accessibility`, `orchestration`, `performance`, `security`, `testing`. Local policy: long checklists, examples, and templates belong in `references/` or `references/templates/`; `SKILL.md` should load them only when needed.

## Hook Portability Constraints

- Treat third-party host setup as adapter evidence, not a local implementation contract.
- Do not copy shell hooks directly; model behavior as host-neutral lifecycle policy, validators, or Supervibe receipts.
- Any hook-like automation must document sandbox, secrets, rollback, and non-interactive failure behavior.

## Refresh Boundary

This baseline records internalized facts and local comparison fields. Do not copy third-party prose, shell hooks, or host-specific setup instructions into local skills. Use the refresh doc to update local baseline evidence and mark stale comparisons.
