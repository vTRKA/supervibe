---
name: subagent-driven-development
namespace: process
description: "Use WHEN executing implementation plan with independent tasks AND subagents are available to dispatch fresh subagent per task with two-stage review. RU: Используется КОГДА выполняется план с независимыми задачами И доступны subagents — диспатчит свежий subagent на каждую задачу с двухстадийным ревью. Trigger phrases: 'parallel subagents', 'fan-out', 'разнеси по subagent', 'subagent-driven'."
allowed-tools: [Read, Grep, Glob, Write, Edit, Bash]
phase: exec
prerequisites: [implementation-plan]
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Subagent-Driven Development

## When to invoke

WHEN executing a plan AND subagent dispatch is available AND plan has 5+ independent tasks. Preferred over `evolve:executing-plans` (inline) when both apply.

## Step 0 — Read source of truth (MANDATORY)

1. Read full plan
2. Identify task dependencies (which tasks need others' output first)
3. Group into waves: tasks within wave run in parallel; waves are sequential
4. Read project's subagent type list to pick appropriate type per task

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
2. **Wave organization** — group tasks; tasks within wave are parallelizable
3. **Per task: write brief** (subagent has no conversation memory; brief must be self-contained):
   - What to do (concrete deliverable)
   - What files to touch
   - Verification command + expected output
   - Quality gate (≥9 on agent-output)
4. **Dispatch wave** — parallel Agent tool calls in single message
5. **Two-stage review per task**:
   - Stage 1: subagent self-reviews via attached `evolve:verification` and `evolve:confidence-scoring`
   - Stage 2: parent (this skill) reviews subagent output for scope respect, evidence completeness, regression safety
6. **Reject if**: scope violation, missing evidence, regression introduced
7. **Re-dispatch with corrected brief** if rejected
8. **After wave completes** — proceed to next wave

## Output contract

Returns wave-by-wave execution log:
```
Wave 1 (parallel, N tasks):
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
- ALWAYS: brief includes WHY the task matters + project conventions
- ALWAYS: per-task verification before claiming wave done

## Verification

- Every task has dispatch + Stage 1 + Stage 2 outputs
- Failed tasks have new brief + re-dispatch evidence
- Final deliverable passes overall agent-output rubric ≥9

## Related

- `evolve:executing-plans` — fallback when subagents unavailable
- `evolve:dispatching-parallel-agents` — for ad-hoc parallelism (not plan execution)
