---
name: autonomous-agent-loop
namespace: process
description: >-
  Use when a user requests a goal-complete autonomous loop, epic run, worktree
  session, or long multi-agent execution to preserve scope, receipts, evidence,
  resume state, and safe stop conditions through completion.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
phase: exec
prerequisites:
  - user-request-or-plan
emits-artifact: loop-state
confidence-rubric: confidence-rubrics/autonomous-loop.yaml
gate-on-exit: true
version: 1.3
last-verified: 2026-05-14T00:00:00.000Z
---

# Autonomous Agent Loop

## Overview

This skill is the controller contract for a goal-bounded autonomous run. It
turns approved scope into ready tasks, dispatches bounded workers, records
runtime evidence, reconciles state, and continues until the goal is complete,
blocked, paused, or stopped by an explicit policy/budget/approval gate.

Keep detailed evidence packet templates, side-effect ledgers, wave examples,
resume checks, and final-report matrices in
[Loop Evidence Patterns](../../references/skills/loop-evidence-patterns.md).

## When to Use

Use when a user asks for an autonomous run, epic execution, goal-until-complete
loop, long worktree session, or multi-step delivery that must keep working until
done or safely stopped.

Do not use for one small local edit, a read-only explanation, or non-dry
execution of a plan that is not user-approved as loop-ready or already atomized
into an accepted work graph with the current user handoff answered.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source
of truth, preserve retrieval evidence, apply scope safety, use real producers
with runtime receipts for durable delegated outputs, verify before completion
claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

Read the approved user request, current plan/spec or work graph, active host
instructions, `.supervibe/memory/` workflow state, recent project memory,
Code RAG/CodeGraph health, command-agent plan output, and receipt recovery
status. If scope, evidence, or receipts are missing or stale, enter readiness
repair or dry-run instead of dispatch.

## Decision tree

```
Scope, stop condition, user gate, or verification target is missing
  -> readiness repair or one focused user question.

Accepted graph has independent tasks with disjoint write sets
  -> dispatch a small parallel wave with explicit worker packets.

Tasks share files, public contracts, migrations, or release state
  -> serialize, split, or quarantine until rollback and ownership are clear.

Provider permission, retrieval evidence, receipts, or policy preflight is absent
  -> policy/readiness stop before non-dry work.

Ready work remains after a wave
  -> continue; do not report final completion from a partial checkpoint.
```

## Scope Safety Gate

Before dispatch or resume, classify each task, subtask, or emergent issue as
`include`, `defer`, `reject`, or `spike`. Stop or quarantine scope expansion
until the tradeoff, complexity cost, concrete harm, owner, verification,
rollback, and user approval are recorded.

## Plan Approval And User Gate

When a loop starts from a plan, pre-plan, epic, or atomized graph, require a
user-approved loop-ready plan or accepted work-item graph plus a current explicit user answer for
the latest handoff. Unanswered plan-scope, optional review, atomization, or execution
handoffs block non-dry execution. Surface Next User Decision before execution or resume.

Reviewer coverage is mandatory before production or release completion. The loop
must record which final reviewer checked each completed task, the verdict,
production-readiness status, and trusted runtime receipt evidence before closing
the graph.

## Controller Model

- Controller: owns task graph, scope, approvals, budget, policy, state, and final
  truth.
- Worker: owns one bounded task with declared write set, acceptance criteria,
  verification, rollback, and stop conditions.
- Reviewer: independently checks worker evidence, scope safety, regression risk,
  and acceptance before production/release completion.

Workers are not trusted because they sound confident or finish a first step.
Completion requires reviewer-grade evidence and controller reconciliation.

## Definition Of Ready

A task is ready only when approved scope, dependencies, disjoint write set,
acceptance criteria, verification, rollback, risk level, policy preflight,
minimal context pack, stop conditions, and readiness score are present. Score
must be at least 9/10 unless the run is dry-run or explicitly accepted as partial
with remediation recorded.

## Definition Of Done

A task is done only when acceptance criteria are satisfied, required verification
ran, worker evidence is complete, reviewer evidence is attached or deliberately
reserved for the final sweep, the side-effect ledger matches reality, scope
safety passes, rollback and residual risks are recorded, and confidence is at
least 9/10.

## Continuation Contract

Continue ready work until the approved goal is complete, the user pauses/stops,
an explicit budget is reached, policy or approval gates block progress,
verification fails, no-progress policy fires, or required evidence is missing.
Final output must distinguish `COMPLETE`, `BLOCKED`, `PARTIAL`, `POLICY_STOP`,
`BUDGET_STOP`, and `USER_PAUSED`.

If the user changes topic while loop state or a queued handoff exists, surface
run id, phase, active task/wave, artifact path, next safe action, and blocker,
then ask one resume/pause/switch/stop question.

## Workflow Signal Contract

Every loop status must include workflowSignal so resume, compact context, worktree sessions, and subagent cleanup can distinguish continue, pause, stop/archive, blocked, and complete states.

## Topic Drift / Resume Contract

If a saved loop, `NEXT_STEP_HANDOFF`, or workflowSignal exists and the user changes topic, surface the saved phase and ask whether to continue, skip/delegate safe non-final decisions, pause and switch topic, or stop/archive.

### Execution Packet

Each ready task gets an Execution Packet with task id, owner, write set,
acceptance criteria, required skills, context citations, verification commands,
rollback path, stop conditions, receipt requirements, and expected output
contract. Store durable loop state and packet pointers under
`.supervibe/memory/loops/<run-id>/` when the owning workflow uses loop memory.

### Wave Planning And Dispatch

Plan waves from the ready front, not from urgency alone. Dispatch parallel work
only when write sets are disjoint, state dependencies are satisfied, and worker
packets are self-contained. Do not stop after the first task or wave while
ready work remains; reconcile results, quarantine failures, and launch the next
safe wave until the goal is complete or a real stop condition fires.

### Recovery And Resume

On compact context, interruption, stale claim, worker failure, or process
restart, reread durable loop state, graph status, receipts, active agents, and
side-effect ledger before continuing. Close completed or stale subagent sessions
that no longer own active work, recover safe claims, and resume from the next
ready action instead of relying on hidden chat memory.

## Procedure

1. Normalize the request or read the user-approved loop-ready plan/work graph.
2. Run preflight for scope, autonomy level, explicit budgets, environment, MCP or
   tool permissions, secrets, provider permissions, approvals, and rollback.
3. Apply `docs/references/scope-safety-standard.md`; reject, defer, or ask about
   tasks that do not map to approved scope.
4. Build execution contracts for every ready task and score autonomy readiness.
5. Build or refresh the durable task graph with dependencies, write sets,
   verification, policy risk, required capability, stop conditions, and ready
   ordering.
6. Build a minimal context pack with memory, Code RAG, CodeGraph when relevant,
   citations, retrieval quality, graph warnings, and fallback reasons.
7. Dispatch only ready-front tasks. Parallelize only disjoint write sets or
   read-only investigations.
8. Require structured worker handoff with verification evidence, side effects,
   residual risks, rollback, and reviewer needs.
9. Reconcile state after each task or wave; quarantine failing tasks without
   blocking unrelated ready work.
10. Stop on policy, budget, cancellation, approval expiry, provider permission
    failure, repeated no-progress, state migration failure, or missing evidence.
11. Before completion, reread source scope, verify every acceptance criterion,
    close or block every risk, confirm production-readiness gates, and run the
    final reviewer sweep.
12. Write the final report with status, evidence, receipts, score, rollback,
    artifact retention, and next action.

## Examples

- Valid: a user-approved loop-ready plan has five independent documentation fixes and two shared
  validator changes. Dispatch the doc fixes as one receipt-backed wave, serialize
  the validator tasks, then run a final reviewer sweep before closing the graph.
- Invalid: a worker reports `npm test` passed but the graph still has open
  blockers, overlapping write sets, and no reviewer receipt. Mark the task
  incomplete or blocked; do not report `COMPLETE`.

## When not to use

- Do not bypass the command or workflow that owns durable loop artifacts.
- Do not use stale retrieval, missing receipts, or legacy migrated evidence as
  production completion proof.
- Do not replace specialist producers, workers, or reviewers with controller
  summaries when runtime receipts are required.

## Common rationalizations

- "One failed task means the whole run should stop" - reject; quarantine it and
  continue unrelated ready work when scope and write sets allow.
- "The worker says tests passed, so the graph is complete" - reject; reconcile
  acceptance, side effects, reviewer evidence, and open blockers first.
- "The user said continue earlier, so unanswered handoffs are implied" - reject;
  each handoff needs a current explicit answer.
- "Legacy evidence is close enough for release" - reject; production completion
  needs current trusted reviewer or validator evidence.

## Red flags

- A ready task lacks write set, verification, rollback, or stop conditions.
- Two active workers can modify the same file without a conflict exception.
- Final status says `COMPLETE` while blockers, risks, or reviewer gates remain.
- Side-effect ledger omits commands, files, spawned processes, or approvals.

## Checklist

- Reviewed scope and latest user gate confirmed.
- Memory, Code RAG, CodeGraph, and receipt status checked.
- Task graph has dependencies, write sets, acceptance, verification, rollback,
  policy risk, stop conditions, and ready-front ordering.
- Worker packets are bounded and self-contained.
- Final reviewer sweep and production readiness evidence are recorded.

## Failure modes

- Controller-authored summaries substitute for worker or reviewer receipts.
- The loop stops after the first successful wave while ready work remains.
- Scope expands through "helpful" optional work without approval.
- Resume relies on hidden chat state instead of durable loop state.

## Output contract

- `STATUS`: `IN_PROGRESS`, `COMPLETE`, `BLOCKED`, `PARTIAL`, `POLICY_STOP`,
  `BUDGET_STOP`, or `USER_PAUSED`.
- `EXIT_SIGNAL`: whether the loop should stop now.
- `CONFIDENCE`: evidence-backed score, below gate when evidence is partial.
- `NEXT_AGENT`: next worker/reviewer id or `none`.
- `NEXT_ACTION`: concrete next safe action.
- `STOP_REASON`: exact blocker or `none`.
- `POLICY_RISK`: `none`, `low`, `medium`, or `high`.
- `PERMISSION_MODE`: `ask-preserving`, `blocked`, or `unknown`.
- `BYPASS_DISABLED`: true when unsafe bypasses are blocked.
- `MVP_READINESS_STAGE`: discovery, planning, implementation, verification,
  release, or post-release.
- `PRODUCTION_READINESS`: reviewer-backed readiness score.
- `OPEN_BLOCKERS`: current blocker count.
- `SCOPE_SAFETY`: `pass`, `blocked`, or `needs-tradeoff`.
- `SCOPE_CHANGES`: approved scope-change count.

## Guard rails

- Do not mutate files, provider state, network resources, or external tools
  unless procedure, policy, and user approval allow it.
- Do not skip prerequisites, confidence gates, explicit approvals, or reviewer
  gates.
- Do not claim completion without concrete verification and receipt evidence.
- Preserve unrelated worktree changes.

## Verification

- Run the loop validator, dry-run, audit, or task-local command named by the
  owning workflow.
- For production completion, prefer `/supervibe-loop --validate-completion --require-trusted-evidence`
  when trusted receipts are available.
- Confirm emitted loop state and final report match the Output contract.
- If verification cannot run, state the blocker and keep confidence below gate.

## Supporting references

- [Loop Evidence Patterns](../../references/skills/loop-evidence-patterns.md) -
  worker packet schema, evidence ledger, wave examples, resume checks, and final
  report matrices.

## Related

- `supervibe:subagent-driven-development` - executes ready worker waves.
- `supervibe:dispatching-parallel-agents` - parallelization safety.
- `supervibe:using-git-worktrees` - isolation for long-running work.
- `supervibe:verification` - verification evidence before completion claims.
