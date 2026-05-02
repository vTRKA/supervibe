---
name: dispatching-parallel-agents
namespace: process
description: >-
  Use WHEN facing 2+ independent tasks BEFORE starting them sequentially to
  determine if parallel subagent dispatch saves time without coordination cost.
  Triggers: 'parallel dispatch', 'fan-out', 'параллельно агентов', 'разнеси
  задачи'.
allowed-tools:
  - Read
  - Grep
  - Glob
phase: exec
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.1
last-verified: 2026-05-02T00:00:00.000Z
---

# Dispatching Parallel Agents

## When to invoke

WHEN you have 2+ tasks to do AND you're about to start them. BEFORE you go sequential by default.

NOT for: single tasks, tasks with sequential dependencies, tasks sharing mutable state.

## Dispatch Quality Contract

Parallelism is allowed only when it lowers wall-clock time without increasing
merge, context, review, or policy risk. The default for uncertain ownership is
sequential execution.

Each dispatched task needs a self-contained worker packet: objective, why it
matters, read context, write set, acceptance criteria, verification command,
stop condition, output contract, and explicit note that the worker must not
revert unrelated edits or assume it is alone in the codebase.

## Continuation Contract

After dispatch, continue until every launched task is collected, reviewed, and
classified as `success`, `blocked`, `rejected`, or `partial-with-user-acceptance`.
Do not stop after the first subagent returns. A failed subagent does not cancel
independent completed outputs, but it must block the final claim until repaired,
quarantined, or explicitly accepted as partial.

## Definition Of Done

Parallel work is done only when aggregation has checked write-set conflicts,
contradictory recommendations, missing evidence, and verification status for
each task. The combined answer must cite per-agent outcomes and explain any
discarded, re-run, or serialized task.

## Step 0 — Read source of truth (required)

1. List the candidate tasks
2. Identify what each task reads vs writes
3. Identify shared state (files, registry, DB) between tasks
4. Read project's subagent dispatch examples in the active host instruction file if present

## Decision tree

```
Are tasks independent?
├─ Same files modified → SEQUENTIAL (parallel = merge conflicts)
├─ Same in-memory state → SEQUENTIAL
├─ Sequential output dependency (B needs A's result) → SEQUENTIAL
└─ All criteria pass → PARALLEL OK

If parallel OK, count tasks:
├─ 2-5 tasks → parallel via single message with multiple Agent tool calls
├─ 6-15 tasks → parallel batches of 5
└─ 16+ tasks → use supervibe:subagent-driven-development with full plan
```

## Procedure

1. **List tasks** (Step 0)
2. **Apply decision tree** per task pair
3. **If sequential**: just execute in order; this skill is a no-op
4. **If parallel**:
   a. Write per-task brief (each must be self-contained — agent has no memory of conversation)
   b. Dispatch in single message with multiple Agent tool calls
   c. Wait for all to return
   d. Aggregate outputs
   e. Score combined result with `supervibe:confidence-scoring`
5. **Per-agent verification** — each subagent's output verified separately
6. **Aggregation review** — does combined output meet original goal?

## Output contract

Returns:
- Task list with parallel/sequential decision
- If parallel: dispatch confirmation, per-agent outcome, aggregated result
- Combined confidence score

## Guard rails

- DO NOT: parallelize tasks that share file targets
- DO NOT: pass conversation context to subagent (write self-contained brief)
- DO NOT: dispatch >5 in single message (too noisy to follow)
- DO NOT: aggregate outputs blindly (each may have made conflicting decisions)
- ALWAYS: per-task brief includes WHY the task matters + expected output format
- ALWAYS: verify aggregation makes sense before claiming done

## Verification

- Decision documented (sequential or parallel)
- If parallel: per-agent outputs collected and shown
- Aggregated result meets original goal
- No subagent's output overwrote another's

## Related

- `supervibe:subagent-driven-development` — preferred for plan-execution at scale
- `supervibe:executing-plans` — alternative when sequential is fine
