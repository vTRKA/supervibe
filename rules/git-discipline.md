---
name: git-discipline
description: "Bans destructive git operations (stash/pop, force-push, reset --hard, clean -f, branch -D, etc.) to preserve work and history. RU: Запрещает деструктивные git операции — force-push на main, reset --hard, skip hooks. Trigger phrases: 'git push', 'force push', 'merge'."
applies-to: [any]
mandatory: true
version: 1.0
last-verified: 2026-04-27
related-rules: [commit-discipline, no-dead-code]
---

# Git Discipline

## Why this rule exists

Destructive git commands have caused entire teams to lose work over the years. The pattern is always the same: developer runs `stash`/`reset`/`force-push` under pressure, intending to save 30 seconds, loses hours of work or breaks teammates' branches.

Concrete consequence of NOT following: lost commits (irrecoverable without reflog), overwritten remote history (other developers forced to re-clone), corrupted working tree (nuclear-option recovery only).

## When this rule applies

- ALL repos managed via `.claude/` Supervibe workflow
- Any branch (main and feature alike — the rule prevents both push --force and stash)
- Both interactive (developer) and automated (CI) contexts

This rule does NOT apply when: explicit user override with documented reason in `.supervibe/confidence-log.jsonl`.

## What to do

**BANNED commands** (enforced via `.claude/settings.json` deny-list):

- `git stash` (any variant: pop/drop/clear/list/show)
- `git push --force` / `git push -f` / `git push --force-with-lease`
- `git reset --hard`
- `git clean -f` / `-fd` / `-fx`
- `git checkout .` / `git checkout --`
- `git restore .`
- `git branch -D`
- `git rebase --onto` / `git rebase -i`
- `git filter-branch`
- `git update-ref -d`
- `git reflog expire`
- `git gc --prune`
- `git tag -d` / `git tag --delete`

**PREFERRED alternatives:**

- Instead of `git stash` → commit a WIP commit on a temporary branch; rename later
- Instead of `git reset --hard` → `git revert <commit>` (creates undo commit, preserves history)
- Instead of `git checkout .` → `git diff` to review, then selectively `git checkout -- <file>` (only allow-listed paths)
- Instead of `git push --force` → open new branch, communicate with team
- Instead of `git branch -D` → rename branch to `archive/<name>` to preserve history

## Examples

### Bad

```bash
# Pressure to ship; uncommitted changes; risky shortcut
git stash
git checkout main
git pull
# ... lost: stash easily forgotten, reset on accident wipes work
```

Why this is bad: stash is invisible. Future-you forgets it. Stash-clear/drop wipes silently.

### Good

```bash
# Same scenario; preserve work explicitly
git checkout -b wip/fix-billing
git add -A
git commit -m "wip: half-done billing fix"
git checkout main
git pull
# Later: git checkout wip/fix-billing to resume; visible in git log + branch list
```

Why this is good: visible, recoverable, communicable.

## Enforcement

- `.claude/settings.json` `permissions.deny` blocks Claude from running banned commands
- Pre-push hook runs `npm run check` (no commit-bypass)
- Code review checks for any sneaked-in destructive commands
- `supervibe:audit` includes git-discipline check (scan recent shell history if available)

## Related rules

- `commit-discipline` — Conventional Commits format (paired enforcement)
- `no-dead-code` — preserved history makes dead-code detection reliable
- `confidence-discipline` — override needed if banned command is truly necessary

## See also

- `https://git-scm.com/book/en/v2` — official Git book
