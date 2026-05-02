---
name: requesting-code-review
namespace: process
description: >-
  Use BEFORE code-reviewer, PR, or AFTER a plan is written TO run a review loop
  with evidence, changed-file scope, plan risks, and next handoff. Triggers:
  'pre-PR review', 'request review', 'готов к ревью', 'сделай ревью плана',
  'review loop'.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
phase: review
prerequisites:
  - agent-output
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-04-27T00:00:00.000Z
---

# Requesting Code Review

## When to invoke

BEFORE invoking `code-reviewer` agent OR before opening a PR for external review. After implementation completes but before claiming done.

Also invoke this as the mandatory **plan-review loop** immediately after `supervibe:writing-plans` saves a plan. In plan-review mode, review the plan artifact itself before atomization, epic creation, or execution.

## Step 0 — Read source of truth (required)

1. Read the spec/plan that motivated the change
2. Read all modified/created/deleted files (`git diff`)
3. Run full check (`npm run check` or project equivalent) — capture output
4. Take screenshots if UI change
5. Include wave status and assignment explanation when the change came from `/supervibe-loop --assign-ready` or a multi-agent wave

## Decision tree

```
What's the review surface?
├─ Single small change (≤3 files, ≤100 lines) → minimal package (diff + test output)
├─ Feature (multiple files, new concept) → full PR description with What/Why/Test plan
└─ Refactor (preserve-behavior change, broad scope) → full + behavioral evidence (before/after)
```

## Procedure

1. **Collect change scope** — list every file changed with one-line description
2. **Write PR description**:
   ```markdown
   ## What
   <one sentence>

   ## Why
   <one sentence + spec link>

   ## Test plan
   - [ ] <verification step 1>
   - [ ] <verification step 2>
   ```
3. **Attach evidence**:
   - Test output (verbatim, not summarized)
   - Screenshots for UI
   - Performance numbers (before/after) for perf changes
   - Evidence ledger status for required memory, RAG and codegraph citations
   - Assignment explanation, reviewer independence, and wave/block reasons for multi-agent work
4. **Identify reviewer agent** — `code-reviewer` for general, `security-auditor` for security-sensitive, `db-reviewer` for DB
5. **Score** — `supervibe:confidence-scoring` artifact-type=agent-output (the prepared package)
6. **Invoke reviewer** with the prepared package

## Output contract

### Plan-review mode

When the input artifact is a plan, produce a review package with:
- Spec coverage and unresolved questions
- Dependency graph and critical-path sanity
- Task size and atomicity
- Verification coverage, including UI/browser evidence where applicable
- Rollback coverage and risky side effects
- Parallel write-set conflicts
- Worktree suitability for long autonomous runs
- Capability assignment, reviewer independence, and wave serialization/blocker reasons
- Provider-policy safety: no bypass defaults, no hidden background automation, explicit stop/resume/status

If the plan passes, print:

```text
NEXT_STEP_HANDOFF
Current phase: plan-review
Artifact: .supervibe/artifacts/plans/YYYY-MM-DD-<slug>.md
Next phase: work-item-atomization
Next command: /supervibe-loop --from-plan --atomize .supervibe/artifacts/plans/YYYY-MM-DD-<slug>.md
Next skill: supervibe:writing-plans
Stop condition: ask-before-work-item-atomization
Why: A reviewed plan can become durable atomic work items and an epic.
Question: Step 1/1: atomizing the plan into an epic and child work items?
END_NEXT_STEP_HANDOFF
```

If the plan fails review, do not atomize or execute. Return findings and route back to `/supervibe-plan <plan-path>` for repair.

Returns:
- PR description (Markdown)
- File changes list
- Evidence bundle (test output + screenshots + benchmarks)
- Reviewer agent identified

## Guard rails

- DO NOT: open PR without running full project checks
- DO NOT: paraphrase test output ("all tests pass" without showing the output)
- DO NOT: attach incomplete evidence (e.g., one screenshot when feature has 3 states)
- ALWAYS: link to spec/plan in PR description
- ALWAYS: include verification commands user can re-run

## Verification

- PR description has What + Why + Test plan
- Test output is verbatim
- All claims in description are supported by evidence

## Related

- `supervibe:code-review` — methodology consumed by reviewer
- `supervibe:receiving-code-review` — how to handle the resulting feedback
- `supervibe:pre-pr-check` — runs comprehensive checks before this
