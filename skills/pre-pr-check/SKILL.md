---
name: pre-pr-check
namespace: process
description: >-
  Use BEFORE opening a PR, requesting review, merging, or handing off a release
  candidate to prove the diff is scoped, intentional, verified, linked to
  artifacts, reviewer-ready, and honest about residual risk. Triggers: pre-PR
  check, pre-merge check, check before PR, reviewer readiness, release readiness.
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

# Pre-PR Check

## Overview

Run this skill as the last engineering check before a PR, review request, merge,
or release handoff. It proves that the change set matches the stated intent,
that verification is scoped to the changed surfaces, that durable artifacts are
linked, and that the reviewer receives enough context to evaluate risk without
reconstructing the whole task.

The skill emits an evidence bundle. It does not replace the workflow, reviewer,
or specialist that owns the change; it makes the pre-review state explicit.

## When to Use

- Use before opening or updating a PR when implementation appears complete and
  the next action is review, merge, or release handoff.
- Use before merging to a protected branch when the project requires a final
  human-readable verification and residual-risk record.
- Use when a worker hands off a diff and needs to prove changed files, intent,
  checks, artifacts, and reviewer readiness in one bounded packet.
- Use after a requested fix when the PR description or release readiness record
  must be refreshed with current verification evidence.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source
of truth, preserve retrieval evidence, apply scope safety, use real producers
with runtime receipts for durable delegated outputs, verify before completion
claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

1. Read the active user request, task contract, plan artifact, issue, PR
   template, or release gate that defines the intended change.
2. Read `git status --short` and the relevant diff or commit range. Separate
   owned changes, user changes, generated artifacts, and unrelated work.
3. Read project check commands from the active host instructions, `package.json`,
   `Makefile`, language manifests, CI config, or command docs.
4. Check project memory, Code RAG, and CodeGraph readiness when the change is
   non-trivial or when a maturity, release, or architectural claim depends on
   repository context. Record stale or unavailable evidence rather than hiding it.
5. Identify required durable artifacts: receipts, review notes, screenshots,
   release readiness records, ADRs, migrations, test reports, or handoff files.

## When not to use

- Do not use while implementation work is still open or the diff is expected to
  change materially.
- Do not use to bypass a command, reviewer, specialist producer, or workflow
  that owns durable artifacts or approvals.
- Do not use when required source evidence, artifact links, or verification
  commands are missing; return `NOT-READY` with the blocker.
- Do not use as an inner-loop test shortcut. Run narrow implementation checks
  directly during development and reserve this skill for the pre-review gate.

## Decision tree

```text
Diff contains unrelated or unexplained files?
  -> NOT-READY: isolate, explain, or get owner approval before review.
Intent cannot be tied to task, issue, plan, or user request?
  -> NOT-READY: recover the intent source or create a bounded handoff.
Required artifact, receipt, screenshot, or decision link is missing?
  -> NOT-READY: produce or link the artifact before asking for review.
Changed surface maps to specific checks?
  -> Run targeted checks plus any project-mandated full gate.
Checks pass and reviewer context is complete?
  -> READY with residual risk and exact evidence.
Checks fail, are skipped, or are stale?
  -> NOT-READY unless the owner explicitly accepts a documented exception.
```

## Procedure

1. Inventory the diff: list changed paths, generated files, deleted files, test
   files, docs, configuration, and artifacts. Mark anything outside the owned
   scope as user-owned, parallel-worker-owned, or blocked.
2. State intent: connect each changed area to the task goal, issue, plan line,
   reviewer finding, or user decision. Flag any change that lacks a clear reason.
3. Select targeted checks from the changed surfaces:
   - Code paths: typecheck or compile, relevant unit tests, lint, and affected
     integration tests.
   - Public API, schema, migration, auth, security, dependency, or release
     paths: run the project-approved validator or reviewer path for that risk.
   - UI or browser-facing paths: include runtime, screenshot, console, network,
     accessibility, or visual checks required by the project.
   - Docs, prompts, agents, skills, templates, or generated artifacts: run the
     matching content, link, contract, or artifact validator.
4. Run checks sequentially when output ordering matters. Capture exact command,
   exit code, and concise result for each check. Preserve verbatim failure lines
   when a check fails.
5. Validate artifact links: confirm every referenced artifact, receipt, report,
   screenshot, template, or handoff path exists or is explicitly unavailable
   with an owner and next action.
6. Prepare reviewer readiness: summarize scope, intent, changed files, commands,
   artifacts, approvals, unresolved comments, known omissions, and how to review.
7. Record residual risk: name untested surfaces, stale indexes, skipped checks,
   accepted exceptions, dependency or environment uncertainty, and owner of the
   next safe action.
8. Score with `supervibe:confidence-scoring` when the active workflow requires
   a confidence artifact. Keep the verdict below ready when evidence is partial.

## Common rationalizations

- "The diff is small, so changed-file intent is obvious" fails because reviewers
  still need to know why each file changed and whether unrelated edits leaked in.
- "One broad test command passed, so targeted checks are unnecessary" fails when
  the diff touches docs, artifacts, security, UI, generated output, or workflow
  state that broad tests do not inspect.
- "The artifact exists somewhere in `.supervibe`" fails unless the PR or handoff
  links the exact artifact path, receipt id, or report the reviewer must inspect.
- "Residual risk makes the PR look weaker" fails because hidden risk prevents
  reviewers from choosing the right depth and release owner.

## Red flags

- The diff includes files outside the task, owned write set, or reviewer scope
  with no explanation or approval.
- The check list is copied from a generic stack template and does not mention
  the actual changed paths, artifacts, or user-facing risk.
- A release or PR description claims readiness without artifact links,
  approvals, reviewer instructions, or residual-risk owner.
- Verification output is paraphrased as "looks good" while exit codes, command
  names, or failure snippets are absent.

## Checklist

- Diff scope, changed files, and ownership are explicit.
- Intent is tied to the task, issue, plan, user request, or reviewer finding.
- Targeted checks match changed surfaces and project-mandated gates.
- Artifact links, receipts, screenshots, reports, and handoffs are exact.
- Reviewer readiness includes review focus, approvals, omissions, and blockers.
- Residual risk has impact, owner, trigger, and next safe action.
- Verdict is `READY` only when evidence supports review or merge.

## Failure modes

- A worker runs only the happy-path test command and misses a changed template,
  prompt, release artifact, or generated index that has its own validator.
- A PR opens with unrelated user changes mixed into the diff, causing reviewers
  to review or revert work outside the task owner.
- A release handoff links to stale receipts or stale Code RAG/CodeGraph evidence
  and overstates confidence.
- A reviewer has to reconstruct intent from commit history because the evidence
  bundle omits scope, artifact links, or residual risk.

## Examples

- Use before a skill-normalization PR: inspect `git status --short`, map
  `skills/pre-pr-check/SKILL.md` and `references/templates/release-readiness.md`
  to the task intent, run `npm run validate:skill-content-quality` and
  `npm run validate:artifact-links`, then record artifact links and residual
  stale-index risk for the reviewer.
- Use before a browser-facing feature review: list UI files and screenshots,
  run the project browser runtime verification plus targeted tests, link the
  screenshot or console report artifact, and state any unverified viewport risk.
- Do not accept a PR request when a generated workflow receipt is referenced in
  prose but no runtime-issued receipt id, ledger path, or validator output is
  attached to the evidence bundle.

## Output contract

- `verdict`: `READY` or `NOT-READY`.
- `diffScope`: changed paths, ownership, generated artifacts, and excluded
  unrelated files.
- `intent`: task, issue, plan, reviewer finding, or user request that explains
  the change.
- `commands`: exact checks run, exit codes, and concise result.
- `artifacts`: exact links to receipts, reports, screenshots, templates,
  handoffs, approvals, or explicit missing-artifact blockers.
- `reviewerReadiness`: review focus, approvals, unresolved comments, omissions,
  and suggested reviewer path.
- `residualRisk`: risks, impact, owner, trigger, mitigation, and next action.

## Guard rails

- DO NOT: revert, hide, or reclassify unrelated user changes to make the diff
  appear cleaner.
- DO NOT: declare ready with failed, skipped, stale, or unavailable checks unless
  the output clearly marks an approved exception.
- DO NOT: invent artifact links or hand-write receipts.
- DO NOT: copy external hook or command recipes into the local project gate.
- ALWAYS: include exit codes or blocker reasons for every required check.
- ALWAYS: keep reviewer instructions scoped to the actual diff and risk.

## Verification

- Run the targeted project validators that match the changed surface, for
  example `npm run validate:skill-content-quality` for skill edits and
  `npm run validate:artifact-links` for artifact-reference integrity.
- Confirm every output artifact or Markdown link referenced by the evidence
  bundle resolves, or record the missing link as a blocker or exception.
- Confirm the final verdict matches command outcomes, artifact availability, and
  residual-risk severity.

## Related

- `supervibe:finishing-a-development-branch` invokes this before branch closeout.
- `supervibe:requesting-code-review` uses the evidence bundle to prepare review.
- `supervibe:verification` verifies individual claims before this PR-level gate.
- [Release Readiness Template](../../references/templates/release-readiness.md)
  records release-oriented commands, artifacts, approvals, rollback, support
  owner, and exceptions.
