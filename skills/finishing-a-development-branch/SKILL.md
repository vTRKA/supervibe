---
name: finishing-a-development-branch
namespace: process
description: >-
  Use WHEN implementation complete and all verifications pass to decide how to
  integrate the work (merge, PR, archive, discard) with safety checks. Triggers:
  'finish branch', 'merge готовое', 'закрой ветку', 'wrap up branch'.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: review
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-04-27T00:00:00.000Z
---

# Finishing a Development Branch

## When to invoke

WHEN implementation complete, all verifications pass, and the question is "what now?". After `supervibe:executing-plans` reaches its end OR after feature work in a worktree.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 — Read source of truth (required)

1. `git status` — uncommitted changes?
2. `git log --oneline @{upstream}..HEAD` — commits ahead of upstream
3. `git log --oneline HEAD..@{upstream}` — commits behind upstream
4. Check CI status if applicable
5. Read project's PR template / merge policy from `.github/`

## Decision tree

```
What's the state?
├─ Uncommitted changes → STOP, finish committing first
├─ Behind upstream → rebase or merge upstream first
├─ Up to date AND tests pass:
│   ├─ Solo project / direct-merge OK → merge to main locally
│   ├─ Team project / PR required → open PR
│   ├─ Spike / experimental → archive branch, don't merge
│   └─ Failed approach → discard branch
└─ Tests fail → STOP, return to debugging
```

## Procedure

1. **Status check** (Step 0)
2. **Run `supervibe:pre-pr-check`** for full check (typecheck/test/lint/audit)
3. **Run `supervibe:requesting-code-review`** if reviewer agent involved
4. **Per option**:
   - **Merge to main**: `git checkout main && git merge --no-ff <branch>` (if user says no commit suppression)
   - **Open PR**: `gh pr create --title ... --body ...` with template
   - **Archive**: rename branch to `archive/<original>` to retain history
   - **Discard**: only after explicit user confirmation; `git branch -D` is banned by rule, use `git update-ref -d refs/heads/<branch>` (also banned!) — actually: leave the branch, just stop working on it
5. **Cleanup worktree** if applicable: `git worktree remove`
6. **Score** — `supervibe:confidence-scoring` artifact-type=agent-output

## Examples

- Use when all implementation tasks are done: run final validation, ensure review findings are closed, prepare release notes, and leave the branch ready for merge.
- Do not use while open graph work remains or while reviewers have not completed the final sweep.

## When not to use

- Do not use this skill to bypass the command or workflow that owns durable artifacts.
- Do not use it when source evidence, RAG/CodeGraph, or required verification is missing.
- Do not use it to replace a specialist producer, worker, or reviewer that must issue runtime evidence.

## Common rationalizations

- "This is small, so no source check is needed" - reject when the skill changes code, config, or durable artifacts.
- "The user asked for speed, so skip receipts" - reject when durable work, delegation, or review is claimed.
- "Existing prose is enough evidence" - reject when validators or command output are required.

## Red flags

- A durable artifact changes without a command, receipt, or verification path.
- The skill is used outside its phase without an explicit handoff.
- Claims of completion appear before evidence and confidence scoring.

## Checklist

- Source of truth read.
- Scope and owner confirmed.
- RAG/CodeGraph/memory requirement decided.
- Evidence artifact or command recorded.
- Stop condition and next handoff clear.

## Failure modes

- Inline emulation replaces a required producer or reviewer.
- Broad use of the skill slows delivery without improving evidence.
- Missing verification lets stale assumptions pass as production-ready.

## Output contract

Returns:
- Final state: merged / PR opened / archived / abandoned
- Evidence: PR URL, commit hash, or archive name
- Confidence score

## Guard rails

- DO NOT: merge with failing tests
- DO NOT: force-push to main (banned by rule)
- DO NOT: discard branches (banned by rule); archive instead
- DO NOT: `git stash` to clean (banned)
- ALWAYS: run full check before merge/PR
- ALWAYS: confirm with user before any destructive choice

## Verification

- `pre-pr-check` output included
- Final state has evidence (URL/hash/archive-name)
- No banned operations executed

## Related

- `supervibe:pre-pr-check` — invoked first
- `supervibe:requesting-code-review` — invoked for PR option
- `supervibe:using-git-worktrees` — pairs with this for cleanup
- `git-discipline` rule (Phase 3) — bans force-push, branch -D
