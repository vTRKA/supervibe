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

WHEN a plan exists at `docs/plans/YYYY-MM-DD-<feature>.md` with confidence-scoring ≥9, OR user explicitly says "execute the plan".

If subagents available, prefer `evolve:subagent-driven-development` for fresh-context per task.

## Step 0 — Read source of truth (MANDATORY)

1. Read the full plan file
2. Critical review — identify questions/concerns BEFORE starting
3. Read project's verification commands from `CLAUDE.md`
4. If on main branch and plan modifies code, propose worktree (`evolve:using-git-worktrees`) unless user opts out

## HARD GATE

If plan has critical gaps preventing start, STOP and ask. Do NOT guess.

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
   c. Run verification command via Bash
   d. Show output verbatim
   e. If pass → mark complete; if fail → STOP, debug
   f. Commit step (skip if user said no commits)
4. **Per-phase confidence gate** — invoke `evolve:confidence-scoring` with artifact-type=agent-output for the phase deliverable; ≥9 required to proceed
5. **After last phase** — invoke `evolve:requesting-code-review`
6. **Handoff** to `evolve:finishing-a-development-branch`

## Output contract

Returns: TodoWrite log of completed tasks + verification outputs + per-phase confidence scores + final delivery summary.

## Guard rails

- DO NOT: skip verifications even when "obviously fine"
- DO NOT: continue past failing verification
- DO NOT: edit plan tasks during execution (file an issue/note for retro)
- DO NOT: start on main branch without explicit user consent
- ALWAYS: stop and ask when blocked; never guess
- ALWAYS: invoke `evolve:verification` before any "done" claim

## Verification

- Every task in TodoWrite is `completed`
- Every verification command output is shown verbatim
- Per-phase confidence ≥9 recorded
- Final code-review phase invoked

## Related

- `evolve:writing-plans` — produces input
- `evolve:subagent-driven-development` — preferred alternative when subagents available
- `evolve:verification` — invoked per claim
- `evolve:finishing-a-development-branch` — invoked after all phases done
