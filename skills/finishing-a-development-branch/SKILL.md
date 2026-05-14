---
name: finishing-a-development-branch
namespace: process
description: >-
  Use WHEN implementation is complete and the branch must be closed out to run
  final validation, documentation decisions, changelog or release-notes triage,
  cleanup, no unrelated reverts, and a clear handoff. Triggers: finish branch,
  wrap up branch, prepare PR, release handoff, merge readiness.
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
last-verified: 2026-05-14T00:00:00.000Z
---

# Finishing a Development Branch

## Overview

Use this skill to close a branch without losing context, hiding risk, or
disturbing other workers' changes. It turns completed implementation into a
merge, PR, archive, or handoff decision backed by final validation,
documentation status, release-note triage, cleanup state, and reviewer-ready
evidence.

This skill does not replace the merge policy, PR workflow, or release owner. It
organizes the last mile so the branch can move safely to the next owner.

## When to Use

- Use after implementation and local fixes are complete and the remaining
  question is whether to open a PR, merge, archive, hand off, or pause.
- Use when a worktree, parallel task, or owned write set must be closed without
  reverting or overwriting unrelated user or worker changes.
- Use when release readiness needs a durable record of commands, artifacts,
  approvals, rollback, support owner, and exceptions.
- Use after review findings have been addressed and the branch needs final
  validation, docs, changelog, cleanup, and handoff evidence.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source
of truth, preserve retrieval evidence, apply scope safety, use real producers
with runtime receipts for durable delegated outputs, verify before completion
claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

1. Read the active user request, issue, plan artifact, work item, PR template,
   merge policy, release gate, and any existing reviewer findings.
2. Run `git status --short` and identify owned changes, unrelated user changes,
   untracked files, generated artifacts, and worktree state.
3. Read branch relationship with upstream when available:
   - `git rev-parse --abbrev-ref --symbolic-full-name @{upstream}`
   - `git log --oneline @{upstream}..HEAD`
   - `git log --oneline HEAD..@{upstream}`
4. Read final validation commands from project instructions, package manifests,
   CI config, or the active task contract.
5. Check project memory, Code RAG, and CodeGraph readiness for non-trivial
   release, workflow, architecture, or maturity claims. Record stale evidence
   instead of rebuilding unless the active task requires it.

## When not to use

- Do not use while required implementation tasks, review blockers, or final
  validation failures remain open.
- Do not use to bypass a required PR, CI, reviewer, release owner, approval, or
  runtime-issued workflow receipt.
- Do not use when closing the branch would require reverting, overwriting,
  stashing, deleting, or force-moving unrelated user or worker changes.
- Do not use for destructive cleanup without explicit user approval and a
  rollback or recovery path.

## Decision tree

```text
Uncommitted or untracked changes exist?
  -> Classify ownership. Commit, document, or hand off owned changes; preserve
     unrelated changes.
Branch is behind upstream or CI state is unknown?
  -> Refresh or document blocker before merge readiness.
Final validation fails?
  -> NOT-READY: return to implementation or debugging.
Docs, changelog, release notes, artifacts, or approvals are incomplete?
  -> NOT-READY unless an explicit exception with owner and trigger is recorded.
Release-impacting change?
  -> Fill release readiness record and name rollback and support owner.
All checks pass and handoff is complete?
  -> Open PR, merge if policy allows, archive, or hand off with evidence.
```

## Procedure

1. Confirm branch identity, upstream relationship, active work item, write scope,
   and stop conditions.
2. Classify the worktree. Never revert, delete, stash, or overwrite changes that
   are unrelated to the current task or belong to another user or worker.
3. Run `supervibe:pre-pr-check` or the project-equivalent final gate. Include
   targeted validation, artifact links, reviewer readiness, and residual risk.
4. Decide documentation status:
   - Update docs when behavior, setup, workflow, command surface, artifact
     shape, user-facing text, or operational policy changed.
   - Record "no docs change" only with a reason tied to unchanged public or
     operational behavior.
5. Decide changelog or release notes:
   - Add or request release notes for user-facing behavior, commands, APIs,
     migration steps, security posture, release workflow, support burden, or
     breaking changes.
   - Record "no release note" only when the change is internal, test-only,
     refactor-only, or already covered by an existing release artifact.
6. Prepare release readiness when the change can affect release or support.
   Use [Release Readiness Template](../../references/templates/release-readiness.md)
   to record commands, artifacts, approvals, rollback, support owner, and
   exceptions.
7. Clean up only owned, task-local leftovers: temporary files, logs, build
   output, obsolete generated artifacts, draft notes, or abandoned local state.
   Leave unrelated changes untouched and visible in the handoff.
8. Choose the closeout path:
   - PR: prepare title, body, review focus, artifacts, approvals, and risk.
   - Merge: only when branch policy and user approval permit it and final gates
     pass.
   - Archive or pause: preserve history and document why the branch should not
     merge now.
   - Handoff: use [Worker Handoff](../../references/templates/worker-handoff.md)
     with next owner, blockers, verification, and write boundary.
9. Score with `supervibe:confidence-scoring` if the active workflow requires a
   confidence artifact. Keep confidence below gate when validation, review,
   approvals, or release readiness are incomplete.

## Common rationalizations

- "Cleanup can remove any untracked file" fails because untracked files may
  belong to a parallel worker, generated evidence, or a user-owned artifact.
- "No docs are needed because the code is self-explanatory" fails when behavior,
  workflow, commands, support obligations, or release operations changed.
- "Release notes are only for product features" fails when command behavior,
  migration policy, security posture, or support procedures change.
- "The branch is done because tests passed" fails when artifact links,
  approvals, rollback, support owner, or handoff context are missing.

## Red flags

- `git status --short` shows unrelated files and the closeout plan does not
  explicitly preserve them.
- A merge or PR is proposed with no final validation output, stale CI status, or
  missing reviewer readiness.
- Documentation, changelog, release-notes, or release-readiness decisions are
  omitted for a change that alters user, support, workflow, or operational
  behavior.
- Cleanup includes broad deletion, stash, reset, branch deletion, or force-push
  behavior instead of owned, task-local cleanup.

## Checklist

- Branch, upstream, CI, worktree, owned scope, and unrelated changes are known.
- Final validation and pre-PR evidence passed or blockers are explicit.
- Docs decision is recorded with changed paths or a no-docs rationale.
- Changelog or release-notes decision is recorded with path or no-note rationale.
- Release readiness record exists when release or support could be affected.
- Cleanup touches only owned, task-local leftovers and preserves unrelated work.
- Handoff names next owner, artifacts, approvals, rollback, support owner,
  exceptions, residual risk, and next action.

## Failure modes

- A worker "cleans" the branch by reverting or deleting unrelated edits and
  destroys parallel work before review.
- A PR opens without release notes or support ownership for an operational
  change, leaving the release owner to discover impact late.
- A branch is marked finished while Code RAG, CodeGraph, CI, or artifact links
  are stale and the handoff overstates confidence.
- Cleanup removes logs, screenshots, reports, or receipts that were required as
  evidence for review or release readiness.

## Examples

- Use after a skill-system task: run `git status --short`, preserve unrelated
  worker edits, run `npm run validate:skill-content-quality` and
  `npm run validate:artifact-links`, decide whether docs or release notes are
  needed, and hand off the exact release readiness or PR evidence.
- Use before merging a workflow command change: confirm upstream relationship,
  run the project command enforcement validators, fill the release readiness
  template with rollback and support owner, and ask for release-owner approval
  before merge.
- Do not finish a branch by deleting a local worktree, stashing changes, or
  resetting files when `git status --short` shows unowned edits outside the
  active task scope.

## Output contract

- `finalState`: PR opened, merged, ready-to-merge, archived, paused, abandoned,
  or handoff-required.
- `branchState`: branch name, upstream status, CI status, and worktree summary.
- `validation`: final commands, exit codes, artifacts, and blockers.
- `docsDecision`: docs path updated, no-docs rationale, or docs blocker.
- `releaseNotesDecision`: changelog/release-note path, no-note rationale, or
  release-note blocker.
- `cleanup`: owned cleanup completed and unrelated changes preserved.
- `handoff`: next owner, review focus, artifact links, approvals, rollback,
  support owner, exceptions, residual risk, and next action.

## Guard rails

- DO NOT: merge with failing or missing required validation.
- DO NOT: revert, reset, stash, delete, or force-push unrelated user or worker
  changes.
- DO NOT: discard a branch or worktree without explicit user approval and a
  recovery plan.
- DO NOT: claim release readiness without commands, artifacts, approvals,
  rollback, support owner, exceptions, and residual risk.
- ALWAYS: preserve evidence artifacts until the reviewer or release owner no
  longer needs them.
- ALWAYS: make docs and release-notes decisions explicit, even when the decision
  is "not needed".

## Verification

- Run the final validation command set selected by `supervibe:pre-pr-check` and
  record exact commands and results.
- Run artifact-reference validators when the closeout adds or changes release,
  handoff, template, receipt, agent, skill, or rule links, for example
  `npm run validate:artifact-links`.
- Confirm cleanup scope by rechecking `git status --short` and verifying
  unrelated changes remain untouched.
- Confirm the handoff or PR body includes validation, docs decision,
  release-notes decision, artifact links, approvals, rollback, support owner,
  exceptions, and residual risk.

## Related

- `/supervibe-ship` - release-readiness command surface that consumes verify and review packets, requires target-aware release evidence, and checks Docker only when the detected release target uses Docker.
- `supervibe:pre-pr-check` provides the final pre-review evidence gate.
- `supervibe:requesting-code-review` uses the handoff to request reviewer focus.
- `supervibe:using-git-worktrees` governs worktree cleanup and preservation.
- [Release Readiness Template](../../references/templates/release-readiness.md)
  records release closeout evidence.
- [Worker Handoff](../../references/templates/worker-handoff.md) records
  continuation state for another owner.
- [Migration And Deprecation](../../references/templates/migration-deprecation.md)
  records compatibility, communication, sunset, and rollback evidence when the
  branch changes an existing contract.
