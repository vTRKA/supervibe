---
name: subagent-driven-development
namespace: process
description: 'Use WHEN executing an implementation plan, epic, or atomic task wave with independent tasks AND subagents are available TO dispatch fresh subagent per task in isolated worktree/session with active session registry, heartbeat, stop/resume/status controls, and final-sweep review. Trigger phrases: parallel subagents, fan-out, subagent-driven, atomic tasks, epic worktree, goal-until-complete autonomous, active session registry.'
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Edit
  - Bash
phase: exec
prerequisites:
  - implementation-plan
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.1
last-verified: 2026-05-02T00:00:00.000Z
---

# Subagent-Driven Development

## Overview

Subagent Driven Development provides a reusable Supervibe operating method for Use WHEN executing an implementation plan, epic, or atomic task wave with independent tasks AND subagents are available TO dispatch fresh subagent per task in isolated worktree/session with active session registry, heartbeat, stop/resume/status controls, and final-sweep review. Trigger phrases: parallel subagents, fan-out, subagent-driven, atomic tasks, epic worktree, goal-until-complete autonomous, active session registry.
It keeps the work evidence-first, scope-bounded, confidence-scored, and verified before completion claims.
## When to Use

WHEN executing a plan AND subagent dispatch is available AND plan has 5+ independent tasks. Preferred over `supervibe:executing-plans` (inline) when both apply.

## Plan Approval And User Gate

Subagent-driven execution can only start from a user-approved loop-ready plan or accepted work-item graph with a current explicit user answer for the latest handoff question. `--user-approved-plan`, a plan path, or a worker assignment is not permission to execute by itself; it only establishes one graph-creation prerequisite.

Before dispatching workers, verify the accepted atomization/work graph, zero open critical/major blockers, and a Next User Decision that authorizes this execution phase. If any gate is missing or an unanswered `NEXT_STEP_HANDOFF` exists, stop and ask rather than spawning workers.

## Continuation Contract

Continue through every ready wave until the wave queue is exhausted, a
verification gate fails, a policy or approval gate blocks progress, a
write-set conflict appears, an explicit budget expires, or the user explicitly pauses. Do
not stop after the first subagent result, first green task, first rejected task,
or first checkpoint when unrelated ready work remains.

If one task fails, quarantine or re-queue that task with reason, retry count,
owner, and next unblock action; keep independent ready tasks moving when their
write sets and dependencies are disjoint.

## Definition Of Ready

A subagent task is ready only when it has an approved plan reference, dependency
state, declared write set, expected files, acceptance criteria, verification
command, rollback plan, scope id, risk level, stop condition, and final-sweep
review policy. If any field is missing, split or repair the task before dispatch.

## Worker Execution Packet

Each worker brief must be self-contained because the worker may not share the
parent conversation:

```yaml
taskId: "<stable id>"
whyItMatters: "<user-visible outcome>"
objective: "<bounded deliverable>"
writeSet: ["<repo-relative paths>"]
allowedReads: ["<context files or search citations>"]
approvedScope: "<scope id or explicit approval receipt>"
acceptanceCriteria: ["<criterion>"]
verification: ["<command and expected signal>"]
rollback: "<how to undo this task>"
stopConditions: ["<when to stop and report blocked>"]
outputContract: "changed files, evidence, risks, confidence, next action"
```

Workers must be told they are not alone in the codebase, must not revert edits
made by others, and must adapt to concurrent changes instead of overwriting
them.

## Definition Of Done

A wave is done only after every task in the wave is `SUCCESS`, `BLOCKED`, or
`QUARANTINED` with evidence. `SUCCESS` requires worker evidence, verification
output, side-effect reconciliation, scope safety,
`hostInvocation.source` + `hostInvocation.invocationId` for the real host
subagent run, final-sweep reviewer coverage before release completion, and
confidence at least 9/10. Rejected or partial worker output is not progress
until it is repaired or explicitly accepted as partial by the user.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 — Read source of truth (required)

1. Read full plan
2. Identify task dependencies (which tasks need others' output first)
3. Group into waves: tasks within wave run in parallel; waves are sequential
4. Read project's subagent type list to pick appropriate type per task
5. Read `docs/references/scope-safety-standard.md`, apply the Scope Safety Gate, and preserve the plan's approved/deferred/rejected scope boundary

## Decision tree

```
Per task: which subagent type?
├─ Code change in known stack → stack-specific developer agent (laravel-developer, etc.)
├─ Cross-cutting refactor → refactoring-specialist
├─ Investigation only → repo-researcher (READ-ONLY)
├─ Code review → code-reviewer
├─ Bug investigation → root-cause-debugger
└─ Unknown territory → general-purpose with detailed brief
```

## Procedure

1. **Plan analysis** (Step 0)
1a. **Orchestration preflight** - for durable/epic execution, run or consult `/supervibe-loop --plan-waves <plan-or-state>` and use capability/preset assignment before dispatching a wave. Every task needs a worker, declared write scope, required evidence, and final-sweep reviewer policy before launch.
2. **Wave organization** — group tasks; tasks within wave are parallelizable
2a. **Session coordination** - if execution is epic/worktree-backed, check the active worktree session registry before dispatch. Do not let two sessions claim the same epic/work item unless explicitly allowed.
2b. **Assignment explainability** - record why the worker was chosen, which final reviewer sweep will cover completion, which alternatives were rejected, and why any task was serialized or blocked.
3. **Per task: write brief** (subagent has no conversation memory; brief must be self-contained):
   - What to do (concrete deliverable)
   - What files to touch
   - Verification command + expected output
   - Quality gate (≥9 on agent-output)
   - Approved scope id and explicit instruction to reject or defer unapproved extras instead of implementing them
4. **Dispatch wave** — parallel Agent tool calls in single message
5. **No mid-graph reviewer dispatch by default**:
   - Stage 1: subagent self-checks via attached `supervibe:verification` and `supervibe:confidence-scoring`
   - Stage 2: controller reconciles worker evidence for progress only
   - Final stage: reviewer agents run once after all graph epics/tasks are complete
6. **Reject if**: scope violation, unapproved feature expansion, missing evidence, regression introduced
7. **Re-dispatch with corrected brief** if rejected
8. **After wave completes** — proceed to next wave
9. **Heartbeat/status** - update the session registry after each wave and mark stale/cleanup-blocked sessions explicitly.
10. **Producer receipt gate** - for every durable worker artifact, issue runtime workflow receipts with host invocation proof during execution. Reviewer receipts are required only for the final graph/epic/release sweep.

## Examples

- Use for real host subagents: invoke named specialists through the provider path, track invocation ids, bind receipts, and merge disjoint outputs through the controller.
- Do not emulate a named worker or reviewer inline when the host can invoke the real specialist.

## When not to use

- Do not use this skill to bypass the command or workflow that owns durable artifacts.
- Do not use it when source evidence, RAG/CodeGraph, or required verification is missing.
- Do not use it to replace a specialist producer, worker, or reviewer that must issue runtime evidence.

## Common rationalizations

- "The subagent is just helping, so a generic prompt is enough" fails because a
  worker without write scope, context packet, expected output, and stop
  condition can duplicate work or damage another worker's files.
- "The controller can write the reviewer result faster" fails whenever the
  workflow claims independent specialist provenance; use the real host
  invocation or mark the output as controller-authored diagnostic work.
- "A finished subagent means the task is done" fails until the controller reads
  the diff/output, checks receipts, verifies commands, and reconciles residual
  risk against the original acceptance criteria.

## Red flags

- A claimed worker or reviewer has no `hostInvocation.invocationId` when the
  active workflow requires real host-agent proof.
- The subagent prompt does not say the worker is not alone in the codebase or
  does not define owned files/modules.
- A worker edits outside its packet, reverts unrelated changes, or marks a task
  complete without targeted verification evidence.

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

- `waveId`: current wave id and dispatch mode.
- `assignments`: task id, logical role, owned files/modules, expected output,
  and stop condition.
- `hostInvocations`: real invocation ids for claimed workers or reviewers.
- `workerResults`: changed paths, evidence, verification, blockers, and
  residual risks from each worker.
- `controllerReconciliation`: accepted changes, conflicts, rejected output,
  next wave, and remaining blockers.
- `receiptStatus`: runtime receipt ids and validation status.
- `confidence`: per-wave and final confidence with capped reasons.

## Guard rails

- DO NOT: include conversation context in subagent brief (will leak)
- DO NOT: dispatch >5 parallel in single wave (track-ability suffers)
- DO NOT: dispatch reviewer agents inside every worker task unless per-task review mode is explicitly selected
- DO NOT: re-dispatch with same brief (will produce same output)
- DO NOT: dispatch work already owned by another active worktree session
- DO NOT: let a worker review its own output or share an overlapping write set in the same wave
- DO NOT: reward a worker for adding extra functionality that was not in the plan
- DO NOT: emulate a subagent, worker, or reviewer in the controller. If the host agent call did not run, stop or save a non-agent draft; never mark the task `SUCCESS`.
- ALWAYS: brief includes WHY the task matters + project conventions
- ALWAYS: per-task verification before claiming wave done
- ALWAYS: include stop/resume/status commands for long autonomous waves
- ALWAYS: include assignment explanation and wave status in the handoff package
- ALWAYS: require workers to explain rejected or deferred extras with concrete project harm and a safer alternative

## Verification

- Every task has dispatch + worker self-check + controller reconciliation outputs
- Every successful worker has a `hostInvocation.invocationId` linked to a runtime-issued workflow receipt
- Run `/validate:agent-producer-receipts` before claiming delegated producer work is complete
- Final reviewer sweep has reviewer `hostInvocation.invocationId` receipts before release completion
- Failed tasks have new brief + re-dispatch evidence
- Final reviewer sweep confirms no unapproved scope expansion shipped
- Final deliverable passes overall agent-output rubric ≥9

## Related

- `supervibe:executing-plans` — fallback when subagents unavailable
- `supervibe:dispatching-parallel-agents` — for ad-hoc parallelism (not plan execution)
