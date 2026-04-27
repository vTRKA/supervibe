---
name: writing-plans
namespace: process
description: "Use AFTER an approved requirements-spec exists to produce a phased implementation plan with bite-sized tasks, verification commands, and per-phase confidence gates"
allowed-tools: [Read, Grep, Glob, Write, Edit]
phase: plan
prerequisites: [requirements-spec]
emits-artifact: implementation-plan
confidence-rubric: confidence-rubrics/plan.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Writing Plans

## When to invoke

AFTER `evolve:brainstorming` produces an approved spec, OR AFTER `evolve:requirements-intake` decides complexity 3-6 (skip brainstorm direct to plan).

NOT for: still-vague requirements (go back to brainstorming), trivial one-line changes (skip to executing).

## Step 0 — Read source of truth (MANDATORY)

1. Read the approved spec at `docs/specs/YYYY-MM-DD-<topic>-design.md`
2. Read `CLAUDE.md` for project's verification commands (typecheck, test, lint)
3. Read existing patterns the plan must follow (skim related code via Glob)
4. Check `package.json` / `composer.json` / `Cargo.toml` for available scripts

## Scope check

If spec covers multiple independent subsystems → STOP, return to brainstorming for decomposition. One plan = one coherent subsystem.

## Decision tree

```
How many phases does this need?
├─ 1 phase, ≤10 tasks → single-phase plan, bite-sized TDD per task
├─ 2-4 phases, 20-60 tasks → multi-phase plan with phase-completion gates
└─ 5+ phases, 100+ tasks → mega-plan with master phase index, compact format for late phases

Per task: TDD applicable?
├─ YES (logic, transformation, parsing) → red-green-refactor steps
└─ NO (config files, scaffolding) → write + verify steps
```

## Procedure

1. **File structure mapping** — list every file to Create/Modify, with one-line responsibility per file.
2. **Phase decomposition** — group tasks into phases with clear goal + success criteria + prerequisites.
3. **Per-task breakdown** with:
   - Files (Create/Modify list)
   - Bite-sized steps (2-5 min each) showing exact commands and code
   - Verification command + expected output
   - Commit step (or note if commits suppressed)
4. **Self-review** — placeholder scan, type consistency across tasks, spec coverage matrix.
5. **Score** — `evolve:confidence-scoring` with artifact-type=implementation-plan; ≥9 required.
6. **Save** to `docs/plans/YYYY-MM-DD-<feature>.md`.
7. **Handoff** to `evolve:executing-plans` (or subagent-driven-development if independent tasks).

## Output contract

Returns: plan file with header (Goal/Architecture/Tech Stack), File Structure section, numbered Tasks with bite-sized steps, Self-Review section, Execution Handoff with subagent vs inline choice.

## Guard rails

- DO NOT: write tasks with placeholders ("TBD", "implement later", "similar to Task N")
- DO NOT: skip verification commands — every task ends with one
- DO NOT: bundle multiple unrelated changes in one task
- DO NOT: call types/functions not defined elsewhere in the plan
- ALWAYS: show exact code for code steps (engineer reads tasks out of order)
- ALWAYS: include rollback safety (commit per task or per green test)

## Verification

- Plan file exists at documented path
- Spec coverage matrix maps every spec section to ≥1 task
- Confidence-scoring(implementation-plan) ≥9 recorded

## Related

- `evolve:brainstorming` — produces input spec
- `evolve:executing-plans` — consumes this output
- `evolve:subagent-driven-development` — alternative consumer for parallel tasks
