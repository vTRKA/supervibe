---
name: finishing-a-development-branch
namespace: process
description: "Use WHEN implementation complete and all verifications pass to decide how to integrate the work (merge, PR, archive, discard) with safety checks"
allowed-tools: [Read, Grep, Glob, Bash]
phase: review
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Finishing a Development Branch

## When to invoke

WHEN implementation complete, all verifications pass, and the question is "what now?". After `evolve:executing-plans` reaches its end OR after feature work in a worktree.

## Step 0 — Read source of truth (MANDATORY)

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
2. **Run `evolve:pre-pr-check`** for full check (typecheck/test/lint/audit)
3. **Run `evolve:requesting-code-review`** if reviewer agent involved
4. **Per option**:
   - **Merge to main**: `git checkout main && git merge --no-ff <branch>` (if user says no commit suppression)
   - **Open PR**: `gh pr create --title ... --body ...` with template
   - **Archive**: rename branch to `archive/<original>` to retain history
   - **Discard**: only after explicit user confirmation; `git branch -D` is banned by rule, use `git update-ref -d refs/heads/<branch>` (also banned!) — actually: leave the branch, just stop working on it
5. **Cleanup worktree** if applicable: `git worktree remove`
6. **Score** — `evolve:confidence-scoring` artifact-type=agent-output

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

- `evolve:pre-pr-check` — invoked first
- `evolve:requesting-code-review` — invoked for PR option
- `evolve:using-git-worktrees` — pairs with this for cleanup
- `git-discipline` rule (Phase 3) — bans force-push, branch -D
