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
version: 1.0
last-verified: 2026-04-27
---

# Subagent-Driven Development

## When to invoke

WHEN executing a plan AND subagent dispatch is available AND plan has 5+ independent tasks. Preferred over `supervibe:executing-plans` (inline) when both apply.

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
- ALWAYS: brief includes WHY the task matters + project conventions
- ALWAYS: per-task verification before claiming wave done
- ALWAYS: include stop/resume/status commands for long autonomous waves
- ALWAYS: include assignment explanation and wave status in the handoff package
- ALWAYS: require workers to explain rejected or deferred extras with concrete project harm and a safer alternative

## Verification

- Every task has dispatch + Stage 1 + Stage 2 outputs
- Failed tasks have new brief + re-dispatch evidence
- Stage 2 review confirms no unapproved scope expansion shipped
- Final deliverable passes overall agent-output rubric ≥9

## Related

- `supervibe:executing-plans` — fallback when subagents unavailable
- `supervibe:dispatching-parallel-agents` — for ad-hoc parallelism (not plan execution)
