---
name: writing-plans
namespace: process
description: >-
  Use after an approved spec or approved requirements intake to write a reviewed
  implementation plan, preserve scope safety, require user gates, and hand off
  to review before atomic atomization or execution for epic-scale work; covers
  plan and review expectations. Triggers: 'план', 'ревью'.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Edit
phase: plan
prerequisites:
  - requirements-spec
emits-artifact: implementation-plan
confidence-rubric: confidence-rubrics/plan.yaml
gate-on-exit: true
version: 1.2
last-verified: 2026-05-14T00:00:00.000Z
---

# Writing Plans

## Overview

This skill turns an approved spec or approved requirements-intake outcome into a
durable implementation plan. The planner owns scope control, retrieval evidence,
visual/text-first explanation, review handoff, and the stop conditions that block
atomization or execution until review passes.

Keep this file as the entrypoint contract. Detailed task patterns, templates,
critical-path examples, rollback/risk examples, and phase-gate matrices live in
[Plan Task Patterns](../../references/skills/plan-task-patterns.md).

## When to Use

Use after `supervibe:brainstorming` produces an approved spec, or after
`supervibe:requirements-intake` routes a complexity 3-6 request directly to
planning.

Do not use for vague requirements, speculative extras outside the approved spec,
one-line changes that can safely execute directly, or plans that would cover
multiple independent subsystems without decomposition.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source
of truth, preserve retrieval evidence, apply scope safety, use real producers
with runtime receipts for durable delegated outputs, verify before completion
claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

1. Read the approved spec at `.supervibe/artifacts/specs/YYYY-MM-DD-<topic>-design.md`.
   If no approved spec exists, STOP and tell the user to create one or pass an
   explicit existing spec path.
2. Read the active host instruction file and available verification scripts.
3. Inspect related files/modules enough to map real file responsibilities.
4. Read dependency manifests such as `package.json`, `composer.json`, or
   `Cargo.toml` for test and build commands.
5. Read `docs/references/scope-safety-standard.md` and preserve the approved
   scope boundary.

## Continuation Contract

Do not stop after individual plan phases. Produce a compact plan-scope preview, ask the approve/revise/exclude-or-defer/stop choice through `plan_delivery`, then continue to Post-plan summary and text-first summary. Let the user exclude or defer items, then write the full plan before handoff. Expose `NEXT_USER_ACTIONS[]` with run plan review and revise plan first, then emit `NEXT_STEP_HANDOFF`.

## Plan Scope Approval Gate

Ask one `plan_delivery` question. Do not save the durable plan, atomize work items, or offer execution until this gate is answered. Record Current explicit user answer, then continue from plan to review until the user chooses the next action. Delegated decisions cannot satisfy the final user gate.

## Topic Drift / Resume Contract

If a saved plan, `NEXT_STEP_HANDOFF`, or workflow state exists and the user changes topic, surface the saved phase and ask whether to continue, skip/delegate safe non-final decisions, pause and switch topic, or stop/archive.

## Decision tree

```
No approved spec, unapproved scope, or multiple independent subsystems
  -> STOP for spec creation, scope repair, or decomposition.

One coherent subsystem, <=10 tasks
  -> single-phase plan with task-level verification and rollback.

Two to four phases, roughly 20-60 tasks
  -> multi-phase plan with review gates and critical path.

Five or more phases, broad production path, or high regression risk
  -> mega-plan format with compact late phases, owner gates, and risk controls.
```

## Procedure

1. Run the Plan Scope Approval Gate before saving anything. Show one compact
   preview covering phases, task groups, files/modules, included/deferred/rejected
   scope, risks, verification, rollback, and what will not ship. Ask one visible
   question and wait for the current user answer.
2. Map file structure: every create/modify path, owner, responsibility, and
   expected test or verification surface.
3. Add `## Retrieval, CodeGraph, And Visual Evidence` before implementation
   tasks. Require project memory, Code RAG, CodeGraph mode/quality, citations,
   graph warnings/fallbacks, and one text-first stage map or compact table.
4. Decompose phases and tasks. Each behavioral task needs failing-test-first or
   an explicit non-TDD reason, bite-sized steps, verification command with
   expected signal, rollback, estimate confidence, risk notes when public
   contracts change, and commit guidance unless commits are suppressed.
5. Add Scope Safety Gate, Delivery Strategy, and Production Readiness sections:
   approved/deferred/rejected scope, MVP slice, anti-bloat boundary, rollout,
   security/privacy/performance/observability, runbook/migration/release notes,
   support owner, and post-release learning.
6. Identify critical path, off-path parallel opportunities, and any receipt-backed
   real-agent waves. Do not claim delegated output unless runtime receipts bind
   real host invocations.
7. Add Final Acceptance, Self-Review, and machine validation steps. Validate with
   `node "<resolved-supervibe-plugin-root>/scripts/validate-plan-artifacts.mjs" --file <plan>`.
8. Score with `supervibe:confidence-scoring` for `implementation-plan`; score at
   least 9 before handoff. Reserve 10/10 for complete final-acceptance evidence.
9. Save the durable plan only after the save gate is answered. Then summarize
   artifact path, phases, critical path, scope decisions, top risks, validation,
   confidence, and next actions.
10. Emit `NEXT_STEP_HANDOFF` for plan review and ask one user question. Review is
    mandatory before atomization. After review passes, ask one separate question
    before splitting into atomic work items and an epic.

## User Gates

Each gate requires a current explicit answer after the question is shown:
plan-scope preview, durable save, post-plan review handoff, post-review
atomization handoff, and execution handoff. Earlier broad consent never answers a
later gate.

If the user changes topic while a plan is incomplete or a `NEXT_STEP_HANDOFF`
exists, surface the saved phase, artifact path, next command, and blocker, then
ask one resume/pause/switch/stop question. Delegated decisions must be recorded
in assumptions, scope safety, or review handoff.

## When not to use

- Do not bypass the command or workflow that owns durable plan artifacts.
- Do not proceed when source evidence, RAG/CodeGraph status, or required
  verification is missing without recording the blocker and lowered confidence.
- Do not replace a specialist producer, worker, or reviewer that must issue
  runtime evidence.

## Common rationalizations

- "The spec is obvious, so a source read is unnecessary" - reject; plans start
  from approved artifacts and current repo evidence.
- "The user said continue, so save/review/atomize in one pass" - reject; each
  gate needs its own current answer.
- "This polish task is harmless" - reject unless it maps to approved scope or a
  recorded scope-change tradeoff.

## Red flags

- A plan adds files, features, providers, migrations, or launch steps not present
  in approved scope.
- `NEXT_STEP_HANDOFF` is missing, points to execution, or skips mandatory review.
- Critical path, rollback, verification, or final acceptance evidence is absent.
- Real-agent waves are described without runtime receipt requirements.

## Checklist

- Approved source of truth read and cited.
- Scope boundary, deferred/rejected items, and owner decisions recorded.
- Memory, Code RAG, CodeGraph, and visual/text-first evidence requirements set.
- Every task has files, steps, verification, rollback, and stop condition.
- Review handoff blocks atomization and execution until review passes.

## Failure modes

- Planning vapor from an unapproved or missing spec.
- Hidden optional work enters the task graph without a scope decision.
- Inline review notes are treated as reviewer-owned evidence.
- Plan confidence is scored before validation and self-review.

## Output contract

Returns a plan file with these fields/sections: `Goal`, `Architecture`,
`Tech Stack`, `Constraints`, `File Structure`, `Retrieval, CodeGraph, And Visual
Evidence`, `Critical Path`, `Scope Safety Gate`, `Delivery Strategy`,
`Production Readiness`, numbered tasks, `Final Acceptance Gate`, `Self-Review`,
post-plan summary, mandatory review handoff, post-review atomization handoff,
and machine-readable `NEXT_STEP_HANDOFF`.

The handoff must name: `Current phase`, `Artifact`, `Next phase`, `Next command`,
`Next skill`, `Stop condition`, `Why`, `Question`, and `Choices`.

## Guard rails

- Do not write placeholders such as `TBD`, `implement later`, or `similar to`.
- Do not offer execution before review passes and atomic work items exist.
- Do not continue from plan to review until the current user choice is recorded.
- Always include rollback safety, task-level verification, and approved-scope
  mapping.

## Verification

- Plan exists at `.supervibe/artifacts/plans/YYYY-MM-DD-<feature>.md`.
- `node "<resolved-supervibe-plugin-root>/scripts/validate-plan-artifacts.mjs" --file <plan>` exits 0.
- Scope Safety Gate lists approved, deferred, and rejected scope with tradeoffs.
- Spec coverage maps every approved spec section to at least one task.
- Confidence score for `implementation-plan` is at least 9 with no open blockers
  for completion claims.

## Supporting references

- [Plan Task Patterns](../../references/skills/plan-task-patterns.md) - task
  templates, critical path examples, rollback/risk matrices, output examples,
  and phase-gate patterns.

## Related

- `supervibe:brainstorming` - produces the approved input spec.
- `supervibe:requirements-intake` - alternate entry point for complexity 3-6.
- `supervibe:executing-plans` - consumes reviewed, atomized, receipt-backed work.
- `supervibe:confidence-scoring` - plan confidence gate.
