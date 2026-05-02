---
name: writing-plans
namespace: process
description: "Use AFTER an approved spec or WHEN plan/план is ready TO produce a phased implementation plan, require review/ревью loop, then split into atomic tasks and epic/эпик before execution. Trigger phrases: составь план, сделал план, review plan, ревью луп, atomic, атомарные задачи, epic."
allowed-tools: [Read, Grep, Glob, Write, Edit]
phase: plan
prerequisites: [requirements-spec]
emits-artifact: implementation-plan
confidence-rubric: confidence-rubrics/plan.yaml
gate-on-exit: true
version: 1.1
last-verified: 2026-05-02
---

# Writing Plans

## When to invoke

AFTER `supervibe:brainstorming` produces an approved spec, OR AFTER `supervibe:requirements-intake` decides complexity 3-6 (skip brainstorm direct to plan).

NOT for: still-vague requirements (go back to brainstorming), trivial one-line changes (skip to executing).

## Step 0 — Read source of truth (required)

1. Read the approved spec at `docs/specs/YYYY-MM-DD-<topic>-design.md`. **If no spec exists at all** → STOP and tell the user: "Нет утверждённой спецификации в `docs/specs/`. Запусти `/supervibe-brainstorm <topic>` чтобы её создать, или укажи путь к существующему spec явно: `/supervibe-plan <path>`." Do not proceed with planning vapor.
2. Read the active host instruction file for project's verification commands (typecheck, test, lint)
3. Read existing patterns the plan must follow (skim related code via Glob)
4. Check `package.json` / `composer.json` / `Cargo.toml` for available scripts
5. Read `docs/references/scope-safety-standard.md` and preserve the approved scope boundary

## Scope check

If spec covers multiple independent subsystems → STOP, return to brainstorming for decomposition. One plan = one coherent subsystem.

If the plan includes functionality not present in the approved spec, Scope Safety Gate, or explicit user-approved change request → STOP and either remove it, defer it, or record a scope-change tradeoff. Do not let "nice to have" work enter implementation tasks silently.

## Continuation Contract

Do not stop after individual plan phases, the first task list, or a draft review-gate section. Write the full plan before handoff unless the user explicitly stops/pauses, the spec is missing or unapproved, scope must be decomposed, or one blocking ambiguity prevents a production-safe plan.

Internal phase review gates are instructions for executors later; they are not chat-level stop points for the planner. Use conservative assumptions for non-blocking gaps, document them, and continue through file mapping, critical path, tasks, rollback, verification, production readiness, final 10/10 acceptance, and the mandatory review handoff.

## Evidence and visual plan gate

Every implementation plan must add `## Retrieval, CodeGraph, And Visual Evidence` before file-structure tasks:

- project-memory and Code RAG commands the executor must run before edits;
- CodeGraph mode and Case A/B/C expectation for structural tasks;
- expected source citations, graph warnings, and fallback handling;
- one compact Mermaid/table visual for critical path, state flow, architecture, or release gate, with `accTitle`, `accDescr`, and text fallback.

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
3. **Scope Safety Gate** — create approved/deferred/rejected scope lists; require user outcome, evidence, complexity cost, tradeoff, owner, verification, rollout and rollback for every accepted scope expansion.
4. **Delivery strategy** — define SDLC flow, MVP slice, staged rollout, production target, owner/support path, and how the plan reaches production rather than stopping at a partial implementation.
5. **Production readiness contract** — specify test pyramid, security/privacy checks, performance/SLO gates, observability, rollback, release notes, migration/runbook needs, and post-release learning.
6. **Per-task breakdown** with:
   - Files (Create/Modify list)
   - Bite-sized steps (2-5 min each) showing exact commands and code
   - Verification command + expected output
   - Commit step (or note if commits suppressed)
7. **Final 10/10 acceptance gate** — define exact evidence needed to call the work production-ready; include "no open blockers" and plan reread requirements.
8. **Self-review** — placeholder scan, type consistency across tasks, spec coverage matrix, SDLC completeness, production-readiness coverage.
9. **Machine-validate plan** — run `node "<resolved-supervibe-plugin-root>/scripts/validate-plan-artifacts.mjs" --file docs/plans/YYYY-MM-DD-<feature>.md`. Fix every reported readiness gap before scoring.
10. **Score** — `supervibe:confidence-scoring` with artifact-type=implementation-plan; ≥9 required, 10/10 only when final acceptance evidence is complete.
11. **Save** to `docs/plans/YYYY-MM-DD-<feature>.md`.
11a. **No-silent-stop contract** - include a `NEXT_STEP_HANDOFF` block pointing at `/supervibe-plan --review`. If the block cannot be produced, the plan is not complete.
12. **Handoff** to the mandatory review loop. Do not hand off directly to execution. Print `Шаг 1/1: review loop по плану?`.
13. **After review passes**, hand off to atomic work item and epic creation before execution. Print `Шаг 1/1: разбить план на атомарные work items и epic?`.

## Output contract

Returns: plan file with header (Goal/Architecture/Tech Stack), File Structure, Critical Path, Scope Safety Gate, Delivery Strategy, Production Readiness, numbered Tasks with bite-sized steps, Final 10/10 Acceptance Gate, Self-Review, mandatory Review Handoff, post-review Atomic/Epic Handoff, and a machine-readable `NEXT_STEP_HANDOFF`.

Required handoff block after saving the plan:

```text
NEXT_STEP_HANDOFF
Current phase: plan
Artifact: docs/plans/YYYY-MM-DD-<slug>.md
Next phase: plan-review
Next command: /supervibe-plan --review docs/plans/YYYY-MM-DD-<slug>.md
Next skill: supervibe:requesting-code-review
Stop condition: ask-before-plan-review
Why: Execution and atomization are blocked until plan review passes.
Question: Step 1/1: the plan review loop?
END_NEXT_STEP_HANDOFF
```

## Guard rails

- DO NOT: write tasks with placeholders ("TBD", "implement later", "similar to Task N")
- DO NOT: skip verification commands — every task ends with one
- DO NOT: bundle multiple unrelated changes in one task
- DO NOT: call types/functions not defined elsewhere in the plan
- DO NOT: offer `/supervibe-execute-plan` before review passes and atomic work items exist
- DO NOT: finish without `NEXT_STEP_HANDOFF`
- DO NOT: add tasks that implement unapproved extras, speculative framework parity, protocol work, or polish without a Scope Safety tradeoff
- ALWAYS: show exact code for code steps (engineer reads tasks out of order)
- ALWAYS: include rollback safety (commit per task or per green test)
- ALWAYS: map every task to approved scope or an explicit user-approved scope change

## Verification

- Plan file exists at documented path
- `node "<resolved-supervibe-plugin-root>/scripts/validate-plan-artifacts.mjs" --file <plan>` exits 0
- Scope Safety Gate lists approved, deferred, and rejected scope with tradeoffs
- Spec coverage matrix maps every spec section to ≥1 task
- Confidence-scoring(implementation-plan) ≥9 recorded

## Related

- `supervibe:brainstorming` — produces input spec
- `supervibe:executing-plans` — consumes this output
- `supervibe:subagent-driven-development` — alternative consumer for parallel tasks

## Critical path identification (required)

After listing all tasks, identify which tasks block which:
1. Build dependency graph: task A → task B means A must complete before B starts
2. Find the **critical path**: longest chain of dependencies
3. Mark tasks on critical path with `[CRITICAL-PATH]` in plan
4. Off-critical-path tasks are candidates for parallelization

Example output (in plan body):
```
Critical path: T1 → T3 → T5 → T8 → T-FINAL (5 tasks, est. 6h sequential)
Parallelizable: T2 || T4 (off-path); T6 || T7 (after T5)
```

## Parallelization opportunities (required)

Identify which tasks can run as parallel subagents:
- Independent file modifications (e.g., 10 agent files = 10 parallel subagents)
- Independent test suites (no shared sandbox)
- Independent doc updates (no merge conflicts)

In the Execution Handoff section at the end, list parallel batches:
```
Subagent-Driven batches:
- Batch 1 (foundation, sequential): T1, T2, T3
- Batch 2 (parallel, 5 subagents): T4, T5, T6, T7, T8
- Batch 3 (sequential): T9, T-FINAL
```

This drastically reduces wall-clock execution time.

## Rollback plan per task (required)

Each task gets a one-line "rollback" entry:

```markdown
### Task N: <name>

**Rollback**: `git revert <commit-sha>` OR `git checkout HEAD~1 -- <files>` — verifies via re-running test from Step 1 of original task.
```

This forces clarity about whether a task is reversible. Tasks that aren't reversible (e.g., DB schema changes) get explicit "irreversible — extra review" tag.

## Risk register per task

For tasks touching public surface (API, schema, contracts), include:

```markdown
**Risks:**
- **R1 (severity: high)**: <what could break>; mitigation: <how to detect / undo>
- **R2 (severity: medium)**: <secondary risk>; mitigation: <...>
```

Skip for purely-internal tasks (variable rename inside a function, etc.).

## Honest scope estimation

For each task, write:
- **Estimated time**: `5min` / `15min` / `1h` / `half-day` (no precise hour estimates — they're always wrong)
- **Confidence in estimate**: `high` / `medium` / `low`
- **If estimate doubles, the plan still works** OR `if estimate doubles, escalate`

Tasks marked `low` confidence + `escalate` are flagged for extra brainstorming before execute.

## Review gates between phases

For multi-phase plans (>15 tasks), insert REVIEW GATE markers:

```markdown
---

### REVIEW GATE 1 (after Phase A)

Before starting Phase B, verify:
- [ ] All Phase A tasks committed and tests green
- [ ] No regressions in unrelated tests
- [ ] User approved Phase A output (if user gate)

If gate fails: STOP and escalate; do not proceed to Phase B.

---
```

This prevents cascading failures.

## Output contract template

Save plans to `docs/plans/YYYY-MM-DD-<feature-name>.md`. Reference template at `docs/templates/plan-template.md`.

Required header:
```markdown
# <Feature> Implementation Plan
> For agentic workers: REQUIRED SUB-SKILL ...
**Goal:** <one sentence>
**Architecture:** <2-3 sentences>
**Tech Stack:** <key libs>
**Constraints:** <hard rules>
```

Required sections per task:
- Files (Create / Modify with line ranges / Test path)
- Bite-sized steps (2-5 min each)
- Failing test FIRST (TDD red)
- Verification command + expected output
- Rollback plan
- Commit step

Required at end:
- Scope Safety Gate with approved/deferred/rejected scope and tradeoffs
- Delivery Strategy and Production Readiness sections
- Final 10/10 Acceptance Gate with no-open-blockers rule
- Self-Review (spec coverage / placeholders / type consistency)
- Execution Handoff (Subagent-Driven batches OR Inline batches)

## Anti-patterns

- **Steps not bite-sized** ("implement the feature" is not a step; "write failing test for X" is)
- **No failing-test-first** for behavioral tasks (TDD red phase missing)
- **No verification command** ("should work" is not verification; `npm test` is)
- **No commit per task** (lumping commits hides regressions)
- **No critical path** (engineer doesn't know which task to start when)
- **No Scope Safety Gate** (hidden extras can enter the plan without a product decision)
- **No rollback plan** (task fails midway → unclear how to recover)
- **Estimates with false precision** ("3h 17min" lies; "1h ± 2x" is honest)
- **Empty self-review** (failure to scan own work for placeholders)

## Common workflows

### Workflow: Feature plan (5–15 tasks)

1. Read brainstorm output (`docs/specs/...-brainstorm.md`) if exists
2. List ALL tasks in dependency order
3. Mark critical path
4. Identify parallelization batches for handoff
5. Per task: failing test, impl, verify, rollback, commit
6. Self-review: coverage / placeholders / type consistency
7. Save to `docs/plans/`

### Workflow: Multi-phase plan (>15 tasks, >1 day)

1. Same as feature plan PLUS:
2. Insert review gates between phases
3. Each phase has its own subagent batches
4. Final task is always release-prep (CHANGELOG / version / final tests)

### Workflow: Refactor plan (high regression risk)

1. Each task has explicit rollback (often `git revert`)
2. Review gate after every 5 tasks
3. Risk register heavier
4. Conservative time estimates

## Verification

- Plan saved to `docs/plans/YYYY-MM-DD-<feature>.md`
- Every task has bite-sized steps + failing test + verify command + commit
- Critical path documented
- Scope Safety Gate documents approved, deferred, rejected, and spiked scope with evidence and tradeoffs
- Delivery Strategy covers SDLC, MVP, phases, launch, and production target
- Production Readiness covers test, security/privacy, performance, observability, rollback, and release
- Final 10/10 Acceptance Gate requires verification evidence and no open blockers
- Parallelization batches in Handoff section
- Rollback plan per task
- Self-Review section completed before saving
- Machine validator: `validate-plan-artifacts.mjs --file <plan>` exits 0

## Related

- `supervibe:brainstorming` — predecessor; provides recommended option as input
- `supervibe:executing-plans` — consumer; this skill writes what that skill executes
- `supervibe:subagent-driven-development` — when handoff says Subagent-Driven
- `supervibe:explore-alternatives` — for risk-register options
- `supervibe:confidence-scoring` — gate before saving plan (≥9 required)
- `supervibe:requirements-intake` — alternative entry point for complexity 3-6 plans
