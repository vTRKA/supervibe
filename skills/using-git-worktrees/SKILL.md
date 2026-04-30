---
name: using-git-worktrees
namespace: process
description: "Use BEFORE feature work, autonomous session, or plan execution that needs isolation TO create or validate a git worktree, register active session ownership, keep the main workspace clean, heartbeat/status the session, and cleanup only after merge/PR. Trigger phrases: git worktree, isolated workspace, autonomous worktree, separate session, active session registry, heartbeat, cleanup."
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

## Step 0 — Read source of truth (required)

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

## Managed Session Policy

- Preferred roots: existing `.worktrees/`, existing `worktrees/`, configured project root, global cache, then ask the user.
- Project-local roots must be ignored before creation.
- Session record fields: `sessionId`, `epicId`, `branchName`, `worktreePath`, `createdAt`, `baselineCommit`, `baselineChecks`, `activeAgentIds`, `assignedWaveId`, `assignedTaskIds`, `assignedWriteSet`, `status`, `cleanupPolicy`.
- Multiple sessions may share one epic only when every session declares disjoint assigned tasks/work items and non-overlapping write sets.
- Status must expose active/stale/cleanup-blocked sessions.
- Cleanup must archive first and must never remove a worktree with uncommitted changes.

1. **Verify clean state** (Step 0)
2. **Choose branch name** — `feat/<topic>` or `fix/<topic>` per conventions
3. **Choose worktree path** — `../<repo-name>-<topic>` typically
4. **Create**: `git worktree add <path> -b <branch>` only after explicit user command or validated existing worktree.
4a. **Register session** in `.claude/memory/worktree-sessions/registry.json` and record heartbeat/status/cleanup controls.
5. **Verify**: `git worktree list` shows new entry
6. **Switch context** — communicate to user: subsequent commands run in `<path>`
7. **Work** — execute plan / feature / fix
8. **When done** → `supervibe:finishing-a-development-branch` skill decides merge / PR / discard
9. **Cleanup** — `git worktree remove <path>` (only after merge/PR done; don't remove uncommitted work)

## Output contract

Returns:
- Worktree path created
- Branch name created
- Session id and registry path
- Stop, status, resume, and cleanup commands
- Confirmation user is aware of context switch

## Guard rails

- DO NOT: create worktree in dirty workspace (uncommitted changes risk loss)
- DO NOT: `git stash` to clean (banned by `git-discipline` rule)
- DO NOT: use subdirectory of repo for worktree (gitignore confusion)
- DO NOT: remove worktree before verifying changes are merged/committed
- DO NOT: remove a worktree with uncommitted changes
- DO NOT: start an unscoped second session on the same epic
- DO NOT: let two active sessions claim the same work item, assigned task, or file write set unless explicitly allowed
- ALWAYS: name branch per project convention
- ALWAYS: record heartbeat/status in the active session registry
- ALWAYS: confirm with user before context switch

## Verification

- `git worktree list` shows new entry
- `git -C <new-path> branch --show-current` returns expected name
- Original workspace unchanged

## Related

- `supervibe:finishing-a-development-branch` — invoked at end of work to decide cleanup
- `git-discipline` rule (Phase 3) — bans stash; this skill respects that
