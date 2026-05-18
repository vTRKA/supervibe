---
name: planning-and-task-breakdown
namespace: planning
description: "Use WHEN turning approved requirements into executable work to create ordered, thin, owned, verifiable tasks before implementation."
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: plan
prerequisites: []
emits-artifact: task-breakdown-plan
confidence-rubric: confidence-rubrics/plan.yaml
gate-on-exit: true
version: 1
last-verified: 2026-05-18T00:00:00.000Z
---

# Planning And Task Breakdown

## Overview

Planning And Task Breakdown converts approved requirements, PRDs, specs, or concept decisions into ordered work that can be executed safely. It emphasizes thin vertical slices, dependency order, owner boundaries, acceptance checks, rollback, and verification.

It does not replace `/supervibe-plan` or `writing-plans`; it gives agents a reusable task-shaping method inside those flows or for narrow direct plans.

## When to Use

Use when an approved requirement or clear change needs to become implementation tasks. Use before parallelizing work, assigning agents, creating graph items, or starting a multi-file implementation.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

1. Read approved requirements, PRD, plan, graph, issue, or user acceptance criteria.
2. Search memory for prior plans, incidents, or sequencing decisions in the area.
3. Run Code RAG for local implementation patterns and likely affected files.
4. Use CodeGraph for public surfaces, shared modules, refactors, or dependency impact.
5. Read command ownership rules when the output would create durable plan or graph state.

## When not to use

- Do not create a durable plan artifact when `/supervibe-plan` owns the workflow.
- Do not plan implementation before requirements are approved or blocking questions are resolved.
- Do not split tasks by technical layer when a user-observable vertical slice is possible.
- Do not assign specialist work without real agent availability and receipt requirements.

## Decision tree

```text
Is there approved scope?
  NO  -> route to requirements, PRD, brainstorming, or idea-refine.
  YES -> continue.

Can tasks be vertical slices?
  YES -> slice by user outcome and verification.
  NO  -> create preparatory infrastructure tasks with explicit downstream slice.

Is there parallelizable work?
  YES -> split only when write sets and dependencies are independent.
  NO  -> keep sequential.
```

## Procedure

1. Restate scope, non-goals, acceptance criteria, and constraints.
2. Identify major risk areas: unknown code, public contract, data migration, UI runtime, security, performance, release, or dependency.
3. Order work risk-first: prove risky contracts and integration points before broad implementation.
4. Break work into tasks that each have one owner, one write set, one acceptance signal, and one verification command.
5. Prefer vertical slices: contract + implementation + test + docs for a small behavior.
6. Add explicit dependency edges and blocked-by conditions.
7. Add rollback or cleanup task for flags, migrations, compatibility layers, and temporary scaffolding.
8. Name which specialist agents or skills own each task; do not substitute generic workers for required specialists.
9. Define final gate: targeted validators during development and broad release gate when appropriate.
10. Score with `supervibe:confidence-scoring`; below the gate, mark the plan draft or blocked.

## Common rationalizations

- "Backend first, frontend later" fails when the smallest useful slice can prove the contract end to end.
- "We can assign owners during execution" fails because overlapping write sets create conflicts and weak accountability.
- "Verification is obvious" fails when every task cannot name an exact command or evidence artifact.

## Red flags

- Task title is a broad noun such as database work or frontend work with no behavior.
- Multiple tasks can edit the same file without sequencing.
- Acceptance criteria are copied from requirements but not mapped to tasks.
- Rollback is absent for migrations, flags, generated clients, or release changes.
- Review and verification are bundled into implementation without owner separation.

## Checklist

- Approved scope and non-goals recorded.
- Tasks are thin, ordered, owned, and verifiable.
- Dependencies and write sets are explicit.
- Risk-first sequence covers unknowns early.
- Rollback, cleanup, docs, and final gate are included where needed.

## Failure modes

- Plan reads well but cannot be executed without re-planning.
- Tasks are too large for a single reviewable diff.
- Parallel dispatch creates conflicts because write sets overlap.
- Verification is postponed without policy or final gate.

## Output contract

- `scope`: approved goal and non-goals.
- `tasks`: ordered list with owner, write set, acceptance signal, verification, dependencies, rollback.
- `riskFirstRationale`: why the sequence is safe.
- `parallelization`: independent task groups or reason none.
- `specialists`: required agents/skills and receipt expectations.
- `finalGate`: commands and validators before completion.
- `openQuestions`: blockers that prevent execution.

## Guard rails

- Do not bypass command-owned plan or graph workflows.
- Do not create tasks without acceptance and verification.
- Do not claim agent ownership unless invocation and receipt path are available.
- Preserve scope; push extras into explicit future tasks.

## Verification

- `node scripts/validate-plan-artifacts.mjs --file <plan>` for durable plan artifacts.
- `npm run validate:agent-skill-coverage` and `npm run validate:skill-content-quality` when skill/agent ownership changes.
- For direct lightweight plans, verify task count, dependencies, owners, write sets, and commands by source review.

## Related

- `supervibe:writing-plans`
- `supervibe:executing-plans`
- `supervibe:dispatching-parallel-agents`
- `supervibe:subagent-driven-development`
- `supervibe:incremental-implementation`