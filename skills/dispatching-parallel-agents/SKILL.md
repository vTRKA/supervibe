---
name: dispatching-parallel-agents
namespace: process
description: 'Use WHEN facing 2+ independent tasks BEFORE starting them sequentially to determine if parallel subagent dispatch saves time without coordination cost. Triggers: ''parallel dispatch'', ''fan-out'', ''параллельно агентов'', ''разнеси задачи''.'
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

## Overview

Dispatching Parallel Agents provides a reusable Supervibe operating method for Use WHEN facing 2+ independent tasks BEFORE starting them sequentially to determine if parallel subagent dispatch saves time without coordination cost. Triggers: 'parallel dispatch', 'fan-out', 'параллельно агентов', 'разнеси задачи'.
It keeps the work evidence-first, scope-bounded, confidence-scored, and verified before completion claims.
## When to Use

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

Every successful subagent result must come from a real host Agent/Task call and
carry a host invocation id. Do not emulate a subagent result in the parent
agent; save non-agent notes separately if the host dispatch did not run.

## Definition Of Done

Parallel work is done only when aggregation has checked write-set conflicts,
contradictory recommendations, missing evidence, and verification status for
each task. The combined answer must cite per-agent outcomes and explain any
discarded, re-run, or serialized task.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

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
   f. For durable outputs, issue workflow receipts with `hostInvocation.source`
      and `hostInvocation.invocationId`, then run `npm run validate:agent-producer-receipts`
5. **Per-agent verification** — each subagent's output verified separately
6. **Aggregation review** — does combined output meet original goal?

## Examples

- Use when a graph has disjoint work items: group by write scope, dispatch independent workers concurrently, and keep the controller responsible for progress and handoffs.
- Do not split tightly coupled edits that would force workers to overwrite or wait on each other.
- Use for documentation/template connectivity work: one worker audits
  references, another checks command routing, while the controller patches only
  the confirmed gaps and runs `npm run validate:artifact-links`.
- Anti-example: do not send two workers into the same validator file and ask
  both to "improve quality"; split read-only analysis from the single writer or
  serialize the edits.

## When not to use

- Do not use this skill to bypass the command or workflow that owns durable artifacts.
- Do not use it when source evidence, RAG/CodeGraph, or required verification is missing.
- Do not use it to replace a specialist producer, worker, or reviewer that must issue runtime evidence.

## Common rationalizations

- "More agents always means faster delivery" fails when work shares files,
  decisions, migrations, generated state, or a single release gate; split by
  independent write set or serialize.
- "Read-only analysis does not need a packet" fails because explorers still
  need a bounded question, source paths, stop condition, and output shape to
  avoid duplicate or irrelevant work.
- "The first worker found the answer, so the wave is done" fails when other
  ready tasks remain, receipts are missing, or aggregation has not reconciled
  conflicting outputs.

## Red flags

- Two active workers own the same file, generated artifact, graph node, or
  release decision without an explicit conflict exception.
- A worker prompt lacks write scope, verification command, expected output
  fields, or "not alone in the codebase" coordination language.
- The controller waits idly for workers while non-overlapping local work or
  another independent wave is ready.

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

- `dispatchMode`: `parallel`, `sequential`, `mixed`, or `blocked`.
- `wavePlan`: task ids, dependencies, write sets, and why each task can share a
  wave.
- `workerPackets`: per-worker scope, sources, expected output, verification,
  receipt need, and stop condition.
- `hostInvocations`: host invocation ids for claimed workers/reviewers.
- `aggregation`: accepted outputs, conflicts, rejected work, and next wave.
- `verification`: exact commands or validators run after aggregation.
- `confidence`: score and residual risk for the dispatch decision.

## Guard rails

- DO NOT: parallelize tasks that share file targets
- DO NOT: pass conversation context to subagent (write self-contained brief)
- DO NOT: dispatch >5 in single message (too noisy to follow)
- DO NOT: aggregate outputs blindly (each may have made conflicting decisions)
- DO NOT: claim a worker/reviewer/subagent ran when no host invocation id exists
- ALWAYS: per-task brief includes WHY the task matters + expected output format
- ALWAYS: verify aggregation makes sense before claiming done

## Verification

- Run `npm run validate:agent-producer-receipts` when delegated worker or
  reviewer output is claimed as durable evidence.
- Run the task-specific targeted validator, for example
  `npm run validate:agent-skill-coverage` for ownership edits or
  `npm run validate:artifact-links` for reference changes.
- Confirm every worker output has an owning packet, host invocation id when
  required, and no overlapping write-set mutation.
- Confirm aggregation resolved conflicts before a completion claim.

## Related

- `supervibe:subagent-driven-development` — preferred for plan-execution at scale
- `supervibe:executing-plans` — alternative when sequential is fine
