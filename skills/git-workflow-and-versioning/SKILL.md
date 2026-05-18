---
name: git-workflow-and-versioning
namespace: process
description: "Use WHEN making, grouping, committing, versioning, or releasing changes to keep git history atomic, reversible, and user-work safe."
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: review
prerequisites: []
emits-artifact: git-versioning-plan
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-05-18T00:00:00.000Z
---

# Git Workflow And Versioning

## Overview

Git Workflow And Versioning keeps changes easy to review, revert, release, and audit. It complements `using-git-worktrees`, `finishing-a-development-branch`, `pre-pr-check`, and release governance with explicit atomic-commit, branch hygiene, version surface, changelog, tag, and user-work protection rules.

## When to Use

Use before committing, splitting, staging, rebasing, tagging, version bumping, changelog writing, or release branch finishing. Use when multiple files changed and the reviewer needs a coherent story.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

1. Run `git status --short --branch` and separate intended edits from user or parallel-worker changes.
2. Read active plan, work item, PRD, release note, or user request that defines the allowed write set.
3. Search project memory for branch, version, changelog, release, or rollback decisions when release impact exists.
4. Use Code RAG/CodeGraph when commit grouping depends on public APIs, generated files, or shared runtime behavior.
5. Read package/plugin/version surfaces before proposing a version bump.

## When not to use

- Do not mutate git history, stage files, commit, tag, rebase, push, or publish without user/workflow authority.
- Do not use to hide unrelated user changes inside a commit.
- Do not bump versions before implementation and verification gates are green.

## Decision tree

```text
Is git mutation authorized?
  NO  -> inspect and propose only.
  YES -> continue with status, scope, and verification checks.

Are changes separable by behavior?
  YES -> split into atomic commits by user-observable or contract outcome.
  NO  -> one commit may be acceptable if it has one reason to revert.

Does the change affect release/package/plugin surfaces?
  YES -> require version, changelog, docs, registry, and rollback checks.
  NO  -> commit grouping and PR summary are enough.
```

## Procedure

1. Inspect git status and current branch before any staging or history decision.
2. Map changed files to user outcome, task, or release surface.
3. Split commits so each commit has one reason to revert and one verification story.
4. Keep generated files with the source or command that produced them; do not stage unexplained generated drift.
5. Write commit messages in imperative mood with scope and behavior, not tool narration.
6. For versioned artifacts, check all version surfaces: package manifests, plugin metadata, registry, changelog, docs, lockfiles, and generated install metadata.
7. For release tags, verify tag name, target commit, changelog entry, package version, and rollback path agree.
8. Before rebase/merge/cherry-pick, record current status and conflict risk; never overwrite unrelated work.
9. Run the targeted verification for each commit group or the release gate when versioning changes.
10. Re-run `git status --short --branch` after operations and report remaining unrelated changes.

## Common rationalizations

- "I will just commit everything" fails when unrelated user work or generated drift is mixed with the requested change.
- "Version bump is simple" fails when package, plugin, registry, changelog, and docs surfaces can drift.
- "Rebase is safe" fails without status evidence and a rollback plan for conflicts.

## Red flags

- Commit includes files with no relationship to the stated behavior.
- Changelog claims behavior that no test or validator verified.
- Version surfaces disagree across package, plugin, registry, README, or lockfile.
- Tag or release note exists before checks pass.
- Untracked files are staged without source or purpose.

## Checklist

- Status checked before and after.
- Unrelated work preserved and excluded.
- Commit groups are atomic and reversible.
- Version/changelog/tag surfaces are synced when relevant.
- Verification command output is attached to the git or release claim.

## Failure modes

- Clean history is achieved by reverting user changes.
- Commit boundaries follow file type instead of behavior.
- Version is bumped to unblock release process before quality gates pass.
- Rollback path depends on artifacts not created or published.

## Output contract

- `branch`: current branch and target branch if known.
- `statusBefore`: concise git status summary.
- `intendedChanges`: files grouped by commit or release surface.
- `excludedChanges`: unrelated files preserved.
- `commitPlan`: commit messages and file groups.
- `versionPlan`: package/plugin/changelog/tag surfaces or `none`.
- `verificationCommands`: exact commands required before commit/release claim.
- `rollback`: revert, branch, tag delete, or package rollback path.

## Guard rails

- Never run destructive git commands unless explicitly requested.
- Never stage, commit, tag, push, publish, rebase, or merge without authority.
- Never use `git reset --hard` or `git checkout --` to clean unrelated changes.
- Keep release claims separate from advisory git hygiene suggestions.

## Verification

- `git status --short --branch`
- Targeted tests or validators for changed files.
- `npm run check` before release handoff when release scope is in play.
- `npm run validate:agent-skill-coverage` when agent skill ownership changes.

## Related

- `supervibe:using-git-worktrees`
- `supervibe:finishing-a-development-branch`
- `supervibe:pre-pr-check`
- `supervibe:shipping-and-launch`
- `supervibe:verification`