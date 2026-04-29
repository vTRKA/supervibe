---
description: >-
  Explicit entry-point for the writing-plans skill — turns an approved spec into
  a phased implementation plan with bite-sized TDD tasks.
---

# /supervibe-plan

Direct trigger for the `supervibe:writing-plans` skill. Use after `/supervibe-brainstorm` (or any other producer of an approved spec) to lay out exactly how the work gets done.

## Invocation forms

### `/supervibe-plan <spec-path>`

Examples:
- `/supervibe-plan docs/specs/2026-04-28-payment-idempotency-design.md`
- `/supervibe-plan docs/specs/2026-04-28-mocks-preview-server-design.md`

### `/supervibe-plan` (no args)

Auto-detect the most recent spec in `docs/specs/` and use it. If none, fall back to:
- Show user the list of recent specs and ask which to plan
- If no specs exist at all → tell user to run `/supervibe-brainstorm` first and stop

## Procedure

1. **Resolve the spec.** Either explicit path, the freshest file in `docs/specs/`, or stop with a redirect to `/supervibe-brainstorm`.

2. **Validate the spec.** Read it. Check for:
   - Approved status (frontmatter or first H2 indicating user signed off)
   - Goals / non-goals / success criteria sections
   If gaps → ask user to confirm before planning incomplete requirements.

3. **Search project memory** for similar past plans (`supervibe:project-memory --query <topic>`). If a near-identical implementation exists, propose adapting it instead of re-planning from scratch.

4. **Invoke `supervibe:writing-plans` skill.** It produces:
   - File structure (which files to create / modify, with paths)
   - Critical path
   - Phased tasks (≤5 minutes each, with verification commands)
   - Per-phase confidence gates
   - Parallelization batches (which tasks can run concurrently)
   - Risk register + rollback plan per phase
   - Self-review checklist

5. **Save the plan.** Output goes to `docs/plans/YYYY-MM-DD-<topic-slug>.md`.

6. **Machine-validate the plan.** Run `node scripts/validate-plan-artifacts.mjs --file <plan>`. Any failure blocks execution handoff.

7. **Score against `plan.yaml` rubric.** Gate ≥9. <9 → iterate.

8. **Hand off with execution choice.** Print:
   ```
   Plan saved to <path>. Two execution paths:

   1. Subagent-driven (recommended for ≥3 tasks)
      - I dispatch a fresh subagent per task with two-stage review
   2. Inline execution (faster for <3 tasks)
      - Walk tasks sequentially with checkpoint between each

   Which?
   ```

## Output contract

```
=== Supervibe Plan ===
Spec:        <path>
Plan:        docs/plans/YYYY-MM-DD-<slug>.md
Phases:      <count>
Tasks:       <count>  (parallelizable batches: <count>)
Critical path: <N> tasks
Score:       <N>/10  Rubric: plan
Validator:   validate-plan-artifacts PASS

Next:        choose execution path (subagent-driven | inline)
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
