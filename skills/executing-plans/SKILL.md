---
name: executing-plans
namespace: process
description: "Use WHEN an approved implementation-plan exists to execute it phase-by-phase with mandatory verification per task and confidence-gate per phase. RU: Используется КОГДА существует утверждённый implementation-plan — выполняет его пофазно с обязательной верификацией каждой задачи и confidence-gate на каждой фазе. Trigger phrases: 'выполни план', 'execute plan', 'запусти план', 'погнали по плану'."
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: exec
prerequisites: [implementation-plan]
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Executing Plans

## When to invoke

WHEN a plan exists at `.supervibe/artifacts/plans/YYYY-MM-DD-<feature>.md` with confidence-scoring ≥9, OR user explicitly says "execute the plan".

If subagents available, prefer `supervibe:subagent-driven-development` for fresh-context per task.

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
   d. Run verification command via Bash
   e. Show output verbatim
   f. If pass → mark complete; if fail → STOP, debug
   g. Commit step (skip if user said no commits)
4. **Per-phase confidence gate** — invoke `supervibe:confidence-scoring` with artifact-type=agent-output for the phase deliverable; ≥9 required to proceed
5. **After last phase** — invoke `supervibe:requesting-code-review`
6. **Handoff** to `supervibe:finishing-a-development-branch`

## Output contract

Returns: TodoWrite log of completed tasks + verification outputs + per-phase confidence scores + final delivery summary.

## Guard rails

- DO NOT: skip verifications even when "obviously fine"
- DO NOT: continue past failing verification
- DO NOT: edit plan tasks during execution (file an issue/note for retro)
- DO NOT: start on main branch without explicit user consent
- DO NOT: accept worker-added "nice to have" functionality as progress
- ALWAYS: stop and ask when blocked; never guess
- ALWAYS: invoke `supervibe:verification` before any "done" claim
- ALWAYS: explain why unapproved additions are being deferred or rejected

## Verification

- Every task in TodoWrite is `completed`
- Every verification command output is shown verbatim
- Scope Safety Gate shows zero unapproved additions shipped
- Per-phase confidence ≥9 recorded
- Final code-review phase invoked

## Related

- `supervibe:writing-plans` — produces input
- `supervibe:subagent-driven-development` — preferred alternative when subagents available
- `supervibe:verification` — invoked per claim
- `supervibe:finishing-a-development-branch` — invoked after all phases done
