---
name: subagent-driven-development
namespace: process
description: "Use WHEN executing an implementation plan, epic, or atomic task wave with independent tasks AND subagents are available TO dispatch fresh subagent per task in isolated worktree/session with active session registry, heartbeat, stop/resume/status controls, and two-stage review. Trigger phrases: parallel subagents, fan-out, subagent-driven, atomic tasks, epic worktree, 3h autonomous, active session registry."
allowed-tools: [Read, Grep, Glob, Write, Edit, Bash]
phase: exec
prerequisites: [implementation-plan]
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.1
last-verified: 2026-05-02
---

# Subagent-Driven Development

## When to invoke

WHEN executing a plan AND subagent dispatch is available AND plan has 5+ independent tasks. Preferred over `supervibe:executing-plans` (inline) when both apply.

## Continuation Contract

Continue through every ready wave until the wave queue is exhausted, a
verification/review gate fails, a policy or approval gate blocks progress, a
write-set conflict appears, budget expires, or the user explicitly pauses. Do
not stop after the first subagent result, first green task, first rejected task,
or first review checkpoint when unrelated ready work remains.

If one task fails, quarantine or re-queue that task with reason, retry count,
owner, and next unblock action; keep independent ready tasks moving when their
write sets and dependencies are disjoint.

## Definition Of Ready

A subagent task is ready only when it has a reviewed plan reference, dependency
state, declared write set, expected files, acceptance criteria, verification
command, rollback plan, scope id, risk level, stop condition, and reviewer. If
any field is missing, split or repair the task before dispatch.

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
`QUARANTINED` with evidence. `SUCCESS` requires worker evidence, independent
Stage 2 review, verification output, side-effect reconciliation, scope safety,
`hostInvocation.source` + `hostInvocation.invocationId` for the real host
subagent run, and confidence at least 9/10. Rejected or partial worker output is not progress
until it is repaired or explicitly accepted as partial by the user.

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
1a. **Orchestration preflight** - for durable/epic execution, run or consult `/supervibe-loop --plan-waves <plan-or-state>` and use capability/preset assignment before dispatching a wave. Every task needs a worker, an independent reviewer, declared write scope, and required evidence before launch.
2. **Wave organization** — group tasks; tasks within wave are parallelizable
2a. **Session coordination** - if execution is epic/worktree-backed, check the active worktree session registry before dispatch. Do not let two sessions claim the same epic/work item unless explicitly allowed.
2b. **Assignment explainability** - record why the worker/reviewer were chosen, which alternatives were rejected, and why any task was serialized or blocked.
3. **Per task: write brief** (subagent has no conversation memory; brief must be self-contained):
   - What to do (concrete deliverable)
   - What files to touch
   - Verification command + expected output
   - Quality gate (≥9 on agent-output)
   - Approved scope id and explicit instruction to reject or defer unapproved extras instead of implementing them
4. **Dispatch wave** — parallel Agent tool calls in single message
5. **Two-stage review per task**:
   - Stage 1: subagent self-reviews via attached `supervibe:verification` and `supervibe:confidence-scoring`
   - Stage 2: parent (this skill) reviews subagent output for scope respect, evidence completeness, regression safety
6. **Reject if**: scope violation, unapproved feature expansion, missing evidence, regression introduced
7. **Re-dispatch with corrected brief** if rejected
8. **After wave completes** — proceed to next wave
9. **Heartbeat/status** - update the session registry after each wave and mark stale/cleanup-blocked sessions explicitly.
10. **Producer receipt gate** - for every durable worker/reviewer artifact, issue runtime workflow receipts with host invocation proof and run `npm run validate:agent-producer-receipts` before claiming the wave complete.

## Output contract

Returns wave-by-wave execution log:
```
Wave 1 (parallel, N tasks):
  Assignment model: <worker-preset>/<subagent-type> + <reviewer-preset>, with why-worker, why-reviewer, rejected alternatives, required evidence, and wave/block reason
  - Task 1: <subagent-type> → SUCCESS / REJECTED+reason
  - Task 2: ...
Wave 2 (parallel, N tasks):
  ...
Final: combined deliverable + per-wave confidence score
```

## Guard rails

- DO NOT: include conversation context in subagent brief (will leak)
- DO NOT: dispatch >5 parallel in single wave (track-ability suffers)
- DO NOT: skip Stage 2 review (subagent can claim done without doing)
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

- Every task has dispatch + Stage 1 + Stage 2 outputs
- Every successful worker/reviewer has a `hostInvocation.invocationId` linked to a runtime-issued workflow receipt
- Failed tasks have new brief + re-dispatch evidence
- Stage 2 review confirms no unapproved scope expansion shipped
- Final deliverable passes overall agent-output rubric ≥9

## Related

- `supervibe:executing-plans` — fallback when subagents unavailable
- `supervibe:dispatching-parallel-agents` — for ad-hoc parallelism (not plan execution)
