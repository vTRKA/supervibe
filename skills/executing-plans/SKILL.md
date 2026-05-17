---
name: executing-plans
namespace: process
description: 'Use WHEN an approved implementation-plan exists to execute it phase-by-phase with mandatory verification per task and confidence-gate per phase. Triggers: ''выполни план'', ''execute plan'', ''запусти план'', ''погнали по плану''.'
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
phase: exec
prerequisites:
  - implementation-plan
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.1
last-verified: 2026-05-02T00:00:00.000Z
---

# Executing Plans

## Overview

Executing Plans provides a reusable Supervibe operating method for Use WHEN an approved implementation-plan exists to execute it phase-by-phase with mandatory verification per task and confidence-gate per phase. Triggers: 'выполни план', 'execute plan', 'запусти план', 'погнали по плану'.
It keeps the work evidence-first, scope-bounded, confidence-scored, and verified before completion claims.
Execution is source-bound: each change must map to the reviewed plan, current
repository evidence, trusted runtime receipts, and the final release/merge gate.
## When to Use

WHEN a plan exists at `.supervibe/artifacts/plans/YYYY-MM-DD-<feature>.md` with confidence-scoring ≥9, OR user explicitly says "execute the plan".

If subagents available, prefer `supervibe:subagent-driven-development` for fresh-context per task.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.
Manual drafts, inline worker summaries, or controller-authored substitutions are
diagnostic only. They cannot satisfy production artifact, worker, reviewer,
validator, command, or external-tool output requirements without an owning
runtime invocation and trusted receipt.

## Step 0 — Read source of truth (required)

1. Read the full plan file
2. Critical review — identify questions/concerns BEFORE starting
3. Read project's verification commands from the active host instruction file
4. If on main branch and plan modifies code, propose worktree (`supervibe:using-git-worktrees`) unless user opts out
5. Read `docs/references/scope-safety-standard.md` and identify the plan's approved/deferred/rejected scope boundary

## HARD GATE

If plan has critical gaps preventing start, STOP and ask. Do NOT guess.

If a task, subtask, or agent suggestion adds functionality outside the approved
plan scope, STOP. Either remove the addition, defer/reject it with rationale, or
obtain explicit user approval with tradeoff, verification, rollout, and rollback
before continuing.

## Scope Safety Gate

Before implementation, classify every task or proposed side effect as `include`,
`defer`, `reject`, or `spike`. Block scope expansion until the tradeoff,
complexity cost, concrete harm, owner, verification, rollback, and user approval
are recorded.

## Plan User-Decision Gate

Before executing any plan work, confirm the current plan/pre-plan handoff has an explicit user answer for this exact phase. An unanswered `NEXT_STEP_HANDOFF`, plan-scope preview, next-action handoff, atomization handoff, or execution handoff is a blocker. STOP and ask the handoff question instead of treating older broad consent as approval to continue.

## Continuation Contract

Do not stop after the first task, phase, or green check while the reviewed plan
still has ready work, budget, and no blocker. Phase gates are verification
checkpoints; they become terminal only when a check fails, scope expands,
approval is required, dependencies are missing, or the user pauses/stops.

After every completed task, update a resume-safe checkpoint: completed task id,
changed files, verification output, residual risks, next ready task, and exact
resume command. If a task fails, fix the failure or mark the plan blocked with
the failing command and next unblock action; do not silently skip to unrelated
scope.

## Definition Of Ready

A plan task is ready only when it has accepted scope mapping, dependency state,
declared files, bite-sized steps, verification command, rollback, and stop
condition. If the plan omits these, repair the plan or route back to
`supervibe:writing-plans` before implementation.

## Definition Of Done

A plan task is done only after the implementation matches the plan, allowed
development checks are recorded, final-gate verification remains scheduled, no
unapproved extras shipped, required receipts are trusted, and confidence is at
least 9/10. A phase is done only when all tasks in that phase are done or
explicitly blocked/partial with user acceptance.

## Decision tree

```
Plan complexity?
├─ <10 tasks, all sequential → execute inline with checkpoint after each phase
├─ 10-50 tasks, some independent → execute inline with batch checkpoints (every 3-5 tasks)
└─ 50+ tasks → propose subagent-driven-development; if user picks inline, batch heavily

Per task: blocked?
├─ YES (missing dep, unclear instruction) → STOP, ask user
└─ NO → execute, verify, mark complete
```

## Procedure

1. **Critical review** of plan (Step 0)
2. **TodoWrite setup** — one entry per task
3. **For each task**:
   a. Mark in_progress
   b. Follow steps exactly (don't skip verifications)
   c. Check scope safety: the work maps to an approved requirement or scope-change note
   d. Run only allowed non-final development checks, record any final-only
      validator or test as scheduled for the release/merge gate, and preserve
      the command or artifact evidence
   e. Show relevant output or evidence summary
   f. If an allowed check fails -> STOP, debug; if a final-only validator is
      needed -> mark it scheduled, not passed
   g. Commit step (skip if user said no commits)
4. **Per-phase confidence gate** — invoke `supervibe:confidence-scoring` with artifact-type=agent-output for the phase deliverable; ≥9 required to proceed
5. **After last phase** — invoke `supervibe:requesting-code-review`
6. **Handoff** to `supervibe:finishing-a-development-branch`

## Examples

- Use after a plan passes review: convert actionable steps into owned work items, preserve dependencies, and execute only ready work with verification recorded at the task boundary.
- Do not execute speculative tasks that are still missing acceptance criteria or source evidence.

## When not to use

- Do not use this skill to bypass the command or workflow that owns durable artifacts.
- Do not use it when source evidence, RAG/CodeGraph, or required verification is missing.
- Do not use it to replace a specialist producer, worker, or reviewer that must issue runtime evidence.
- Do not use it to leak manual production artifacts from controller-authored
  drafts, copied notes, or unreceipted specialist output.

## Common rationalizations

- "The plan exists, so every task is ready" fails when a task lacks dependencies,
  write set, acceptance criteria, rollback, verification command, or current
  user gate.
- "A worker completed one phase, so execution can be marked done" fails until
  all plan acceptance criteria, review gates, receipts, and residual risks are
  reconciled.
- "Fixing nearby issues is efficient while the file is open" fails unless the
  issue maps to approved scope, has an owner, and does not expand the plan
  without a recorded decision.

## Red flags

- A task moves to done with no command result, artifact link, receipt, or
  reviewer decision matching its acceptance criteria.
- Plan steps are executed out of dependency order without recording why the new
  order is safe.
- The executor runs broad release checks inside every child task instead of
  targeted checks during work and the full release gate at handoff.
- Development execution runs `node --test`, `npm test`, `npm run check`,
  `npm run validate:*`, or `node scripts/validate-*` before the final
  release/merge gate.

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

Return:

- `executionState`: `not-started`, `in-progress`, `blocked`, `partial`, or
  `complete`.
- `taskLedger`: task id, owner, status, write set, evidence, and blockers.
- `verification`: targeted commands, exit codes, artifacts, and release-gate
  status, including skipped-final-only entries for deferred validators and
  tests.
- `scopeChanges`: approved additions, rejected extras, and deferred follow-ups.
- `receipts`: command, worker, reviewer, validator, and external-tool receipts
  required by the owning workflow.
- `confidence`: per-phase score, final score, and why any score is capped.
- `handoff`: next owner, final reviewer needs, rollback, residual risk, and
  next action.

## Guard rails

- DO NOT: skip verifications even when "obviously fine"
- DO NOT: continue past failing verification
- DO NOT: edit plan tasks during execution (file an issue/note for retro)
- DO NOT: start on main branch without explicit user consent
- DO NOT: accept worker-added "nice to have" functionality as progress
- DO NOT: run final-only tests or validators during plan, graph, or task
  development; schedule them for the final release/merge gate
- DO NOT: treat hand-written receipts or manual production drafts as trusted
  evidence
- ALWAYS: stop and ask when blocked; never guess
- ALWAYS: invoke `supervibe:verification` before any "done" claim
- ALWAYS: explain why unapproved additions are being deferred or rejected

## Verification

- During plan, graph, and task development, do not run `node --test`,
  `npm test`, `npm run check`, `npm run validate:*`, or
  `node scripts/validate-*`; record them as final-only checks.
- Run allowed lightweight checks assigned by the plan only when they are not
  tests or validators, and capture their output.
- At the final release/merge gate, run the plan's scheduled tests, validators,
  receipt validation, and release check once the graph or release slice is
  complete.
- Confirm every task ledger row has acceptance, evidence, scope-safety, and
  residual-risk status before returning `complete`.

## Related

- `supervibe:writing-plans` — produces input
- `supervibe:subagent-driven-development` — preferred alternative when subagents available
- `supervibe:verification` — invoked per claim
- `supervibe:finishing-a-development-branch` — invoked after all phases done
