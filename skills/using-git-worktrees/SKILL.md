---
name: using-git-worktrees
namespace: process
description: "Use BEFORE starting feature work that needs isolation from current workspace OR before executing implementation plans to create isolated git worktree. RU: Используется ПЕРЕД началом фичи, требующей изоляции от текущего workspace, ИЛИ перед выполнением плана — создаёт изолированный git worktree. Trigger phrases: 'git worktree', 'isolated workspace', 'отдельная ветка-папка', 'worktree'."
allowed-tools: [Read, Grep, Glob, Bash]
phase: exec
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: false
version: 1.0
last-verified: 2026-04-27
---

# Using Git Worktrees

## When to invoke

BEFORE starting feature work or executing a plan, IF current workspace has uncommitted changes that should NOT be polluted, OR plan execution risks broken intermediate state.

NOT for: small fixes, doc-only changes, work on a fresh repo.

## Step 0 — Read source of truth (MANDATORY)

1. Run `git status` — check for uncommitted changes
2. Run `git branch -v` — list current branches
3. Read project's branch naming convention from `CLAUDE.md` if specified
4. Verify worktree dir won't collide with existing path

## Decision tree

```
Is current workspace clean?
├─ YES + just want feature isolation → create worktree at sibling dir, fresh branch
├─ YES + executing big plan → create worktree at sibling dir, fresh branch
└─ NO (uncommitted changes) → STOP, ask user: commit / stash (forbidden by rule!) / abandon

Worktree location:
├─ Sibling dir (../<repo>-<feature>) → recommended
└─ Subdirectory of repo → bad (gitignore confusion)
```

## Procedure

1. **Verify clean state** (Step 0)
2. **Choose branch name** — `feat/<topic>` or `fix/<topic>` per conventions
3. **Choose worktree path** — `../<repo-name>-<topic>` typically
4. **Create**: `git worktree add <path> -b <branch>`
5. **Verify**: `git worktree list` shows new entry
6. **Switch context** — communicate to user: subsequent commands run in `<path>`
7. **Work** — execute plan / feature / fix
8. **When done** → `evolve:finishing-a-development-branch` skill decides merge / PR / discard
9. **Cleanup** — `git worktree remove <path>` (only after merge/PR done; don't remove uncommitted work)

## Output contract

Returns:
- Worktree path created
- Branch name created
- Confirmation user is aware of context switch

## Guard rails

- DO NOT: create worktree in dirty workspace (uncommitted changes risk loss)
- DO NOT: `git stash` to clean (banned by `git-discipline` rule)
- DO NOT: use subdirectory of repo for worktree (gitignore confusion)
- DO NOT: remove worktree before verifying changes are merged/committed
- ALWAYS: name branch per project convention
- ALWAYS: confirm with user before context switch

## Verification

- `git worktree list` shows new entry
- `git -C <new-path> branch --show-current` returns expected name
- Original workspace unchanged

## Related

- `evolve:finishing-a-development-branch` — invoked at end of work to decide cleanup
- `git-discipline` rule (Phase 3) — bans stash; this skill respects that
