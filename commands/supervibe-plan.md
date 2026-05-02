---
description: >-
  Use AFTER approved spec or when plan/план is ready TO write a phased plan,
  require review/ревью loop, then atomic task split and epic/эпик handoff before
  execution; triggers include "сделал план", "review plan", and "atomize".
---

# /supervibe-plan

Direct trigger for the `supervibe:writing-plans` skill. Use after `/supervibe-brainstorm` (or any other producer of an approved spec) to lay out exactly how the work gets done.

## Continuation Contract

Do not stop after individual plan phases, file-structure mapping, first task batch, or the first review-gate draft. A `/supervibe-plan` invocation should write the full plan before the review handoff, unless the user explicitly stops/pauses, the spec is missing or unapproved, or a single blocking ambiguity prevents a production-safe plan.

Review gates inside the plan are execution-time gates for later workers; they are not reasons for the planning agent to stop before completing the full plan artifact.

## Invocation forms

### `/supervibe-plan <spec-path>`

Examples:
- `/supervibe-plan .supervibe/artifacts/specs/2026-04-28-payment-idempotency-design.md`
- `/supervibe-plan .supervibe/artifacts/specs/2026-04-28-mocks-preview-server-design.md`

### `/supervibe-plan` (no args)

Auto-detect the most recent spec in `.supervibe/artifacts/specs/` and use it. If none, fall back to:
- Show user the list of recent specs and ask which to plan
- If no specs exist at all → tell user to run `/supervibe-brainstorm` first and stop

## Procedure

1. **Resolve the spec.** Either explicit path, the freshest file in `.supervibe/artifacts/specs/`, or stop with a redirect to `/supervibe-brainstorm`.

2. **Validate the spec.** Read it. Check for:
   - Approved status (frontmatter or first H2 indicating user signed off)
   - Goals / non-goals / success criteria sections
   If gaps → ask user to confirm before planning incomplete requirements.

3. **Search project memory** for similar past plans (`supervibe:project-memory --query <topic>`). If a near-identical implementation exists, propose adapting it instead of re-planning from scratch.

4. **Invoke `supervibe:writing-plans` skill.** It produces:
   - File structure (which files to create / modify, with paths)
   - Critical path
   - Scope Safety Gate (approved/deferred/rejected scope, tradeoffs, and stop condition for unapproved additions)
   - Retrieval, CodeGraph, and visual evidence contract
   - Delivery strategy from MVP to production
   - Production readiness contract (tests, security/privacy, performance, observability, rollback, release)
   - Phased tasks (≤5 minutes each, with verification commands)
   - Per-phase confidence gates
   - Parallelization batches (which tasks can run concurrently)
   - Risk register + rollback plan per phase
   - Final 10/10 acceptance gate with no open blockers
   - Self-review checklist

5. **Save the plan.** Output goes to `.supervibe/artifacts/plans/YYYY-MM-DD-<topic-slug>.md`.

6. **Machine-validate the plan.** Run `node scripts/validate-plan-artifacts.mjs --file <plan>`. Any failure blocks execution handoff.

7. **Score against `plan.yaml` rubric.** Gate ≥9. <9 → iterate.

8. **Mandatory review handoff before execution.** Print:
   ```
   Plan saved to <path>.
   Шаг 1/1: review loop по плану?
   ```

8a. **Machine-readable review handoff.** Include:

   ```text
   NEXT_STEP_HANDOFF
   Current phase: plan
   Artifact: <plan-path>
   Next phase: plan-review
   Next command: /supervibe-plan --review <plan-path>
   Next skill: supervibe:requesting-code-review
   Stop condition: ask-before-plan-review
   Why: Execution and atomization are blocked until plan review passes.
   Question: Step 1/1: the plan review loop?
   END_NEXT_STEP_HANDOFF
   ```

9. **After review passes.** Hand off to atomization and epic creation:
   ```
   Шаг 1/1: разбить план на атомарные work items и epic?
   ```

After review passes, the concrete atomization command is `/supervibe-loop --atomize-plan <plan-path> --plan-review-passed`.
External tracker sync is optional after atomization: `/supervibe-loop --tracker-sync-push --file .supervibe/memory/work-items/<epic-id>/graph.json`. The native work-item graph remains canonical if no tracker adapter is available.
Atomized items are templated by work type and preserve labels, severity, owner/component/stack, required gates, verification hints, comments, and repo/package/workspace/subproject routing metadata for status queries.

## Output contract

```
=== Supervibe Plan ===
Spec:        <path>
Plan:        .supervibe/artifacts/plans/YYYY-MM-DD-<slug>.md
Phases:      <count>
Tasks:       <count>  (parallelizable batches: <count>)
Critical path: <N> tasks
Production readiness: test/security/perf/observability/rollback/release covered
Scope safety: approved scope mapped; deferred/rejected extras documented
Retrieval/graph: required memory, RAG, CodeGraph, citations, fallback and graph-quality checks mapped
Visual evidence: Mermaid/table plan with accessible title, description and text fallback
Final gate:  10/10 acceptance + no open blockers
Score:       <N>/10  Rubric: plan
Validator:   validate-plan-artifacts PASS

Next:        review loop -> atomic work items -> epic -> provider-safe execution preflight
Handoff:    NEXT_STEP_HANDOFF with command `/supervibe-plan --review <plan-path>`
```

## When NOT to invoke

- Spec doesn't exist or isn't approved — go to `/supervibe-brainstorm` first
- One-line trivial change — skip planning, just implement
- The work is exploratory ("let's see what happens if...") — that's brainstorming, not planning

## Related

- `supervibe:writing-plans` skill — the methodology
- `supervibe:project-memory` — pre-flight similarity check
- `/supervibe-brainstorm` — what produces the spec
- `supervibe:executing-plans` / `supervibe:subagent-driven-development` — execution skills
- `docs/templates/plan-template.md` — plan format
