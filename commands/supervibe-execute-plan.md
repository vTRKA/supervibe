---
description: >-
  Use WHEN an approved implementation plan has passed review and atomic tasks
  are ready TO execute the plan with explicit readiness and completion gates.
  Triggers: 'execute plan', 'сделай по плану', 'review passed', 'atomic tasks
  ready', 'epic ready', '/supervibe-execute-plan'.
---

# /supervibe-execute-plan

Direct trigger for plan execution with two **mandatory 10/10 confidence gates** — one BEFORE execution (readiness) and one AFTER (completion). Wraps `supervibe:executing-plans` (or `supervibe:subagent-driven-development` for parallelisable plans) with structured pre/post audits.

This is the safety-critical sibling of `/supervibe-plan` — that one writes the plan, this one runs it without quality compromise.

## Continuation Contract

Do not stop after the first phase, task, or green check while the reviewed plan
still has ready work, budget, and no blocker. A review gate, readiness audit,
or phase verification is a checkpoint unless it fails or requires explicit user
approval. If execution pauses, report the exact stop reason, last completed
task, next ready task, saved state path, and resume command.

Resume mode must continue from the first pending or blocked task after
re-running readiness on the remaining work. It must not restart from the top or
silently skip failed tasks.

## Invocation forms

### `/supervibe-execute-plan <plan-path>`

Examples:
- `/supervibe-execute-plan .supervibe/artifacts/plans/2026-04-28-token-economy-safe-mode.md`
- `/supervibe-execute-plan .supervibe/artifacts/plans/2026-04-27-codegraph-phase-d.md`

### `/supervibe-execute-plan` (no args)

Auto-detects most recent plan in `.supervibe/artifacts/plans/`. If multiple recent or ambiguous, lists them and asks user to pick.

If no plans exist -> redirect: "No plans found in `.supervibe/artifacts/plans/`. Run `/supervibe-plan <spec>` first."

### `/supervibe-execute-plan --resume <plan-path>`

Resume a partially-executed plan: scans the plan for `- [x]` (done) vs `- [ ]` (pending) checkboxes, picks up at the first pending task. Re-runs the readiness audit on remaining tasks only.

### `/supervibe-execute-plan --dry-run <plan-path>`

Run readiness audit ONLY. Don't execute. Reports the 10-dimension confidence score + gaps. Use to vet a plan before committing to execution.

---

## Two-stage confidence model

This command does NOT trust a plan blindly. Both stages must score **10/10** OR receive an explicit user override.

### Stage A — Readiness audit (BEFORE execution)

First run `node scripts/validate-plan-artifacts.mjs --file <plan>`. If it fails, Stage A cannot exceed 8/10 until every machine-detected gap is fixed. Then score the plan against 10 readiness dimensions. Each is binary (1 if pass, 0 if fail). Sum = readiness score.

| # | Dimension | Pass criteria |
|---|---|---|
| 1 | **Plan format valid** | Has `# <title> Implementation Plan` header, `**Goal:**`, `**Architecture:**`, `**Tech Stack:**` |
| 2 | **File structure mapped** | Has `## File Structure` section listing every file to create/modify with paths |
| 3 | **Tasks bite-sized** | Every task has explicit steps; no "TBD"/"add appropriate"/"similar to"; code blocks for code steps |
| 4 | **Verification per step** | Code-creation steps have a "Run X, expect Y" verification command |
| 5 | **Hard constraints listed** | Has explicit `**Hard constraints (do not violate):**` block (or equivalent quality guard) |
| 6 | **Risk mitigation per phase** | Each phase has stated quality risk + mitigation; phases ordered by risk/impact, not random |
| 7 | **Reversibility documented** | Each phase commit-isolated; rollback procedure named (e.g., `git revert <sha>`) |
| 8 | **Dependencies clear** | Critical path / phase ordering / parallel batches documented |
| 9 | **Self-review pass** | Has `## Self-Review` section confirming spec coverage, no placeholders, type consistency |
| 10 | **Quality gates per phase** | Each phase has explicit pass/fail acceptance criteria, not just "looks good" |

If score < 10:
- Print the failing dimensions with file:line of the gap
- Offer 3 paths:
  - **A) Fix the gap** — propose specific edits to bring plan to 10/10
  - **B) Override** — proceed at current score, log to `.supervibe/memory/incidents/<id>-plan-override.md` with rationale
  - **C) Cancel** — exit, user can iterate on plan

Default: A. Override requires explicit user typed confirmation.

### Stage B — Completion audit (AFTER execution)

Score the executed work against 10 completion dimensions. Each is binary.

| # | Dimension | Pass criteria |
|---|---|---|
| 1 | **All checkboxes ticked** | Every `- [ ]` in plan now `- [x]` (or unchanged tasks explicitly marked WONT-DO with rationale) |
| 2 | **All verifications ran** | Every "Run X, expect Y" step shows actual output matching expected |
| 3 | **All tests pass** | If plan added tests → `npm test` (or stack equivalent) green; pre-existing tests unchanged or improved |
| 4 | **No regressions** | If plan has Phase 7 / regression suite → diff against baseline shows no degradation |
| 5 | **Memory updated** | Decisions / learnings / patterns captured in `.supervibe/memory/` per plan's intent |
| 6 | **Files created exist** | Every "Create: <path>" file exists on disk |
| 7 | **Files modified are minimal** | Modified files only changed sections plan declared; no scope creep |
| 8 | **Confidence rubric scored** | Final delivery scored against the right rubric (`agent-delivery` / `framework` / per plan); ≥9 |
| 9 | **No half-finished code** | No commented-out blocks; no orphan TODOs; no skipped error handling per plan |
| 10 | **Documentation in sync** | If plan touches host instruction files / README.md / agent-authoring.md → updated; if not, no surprise edits |

If score < 10:
- Print the failing dimensions
- Offer 3 paths:
  - **A) Fix the gap** — go back, complete missing pieces; re-audit
  - **B) Document partial completion** — write `.supervibe/memory/learnings/<id>-partial-execution.md` with what was/wasn't done; user accepts partial state
  - **C) Revert** — `git reset` / `git revert` everything from this execution

Default: A.

---

## Procedure

### 0a. Mandatory workflow gates before readiness

Before any execution audit, confirm the plan has:
- A passed plan-review artifact or explicit `planReviewPassed` state
- Atomic work items or an epic generated from the reviewed plan
- Execution mode selected (`dry-run`, `guided`, `manual`, or `fresh-context`)
- Stop, status, resume, and cleanup controls for long or worktree-backed runs
- Worktree session selected or created when `--worktree`, `--worktree-existing`, or `--resume-session` is used

If review has not passed, route to `/supervibe-plan --review <plan-path>` and stop. If atomic work items or an epic do not exist, route to `/supervibe-loop --from-plan --atomize <plan-path>` after review passes.

For long autonomous execution, prefer `/supervibe-loop --epic <epic-id> --worktree --max-duration 3h` so the run has an active session registry, heartbeat, and cleanup-safe worktree path.
For atomized epics, use `/supervibe-loop --status --epic <epic-id>`, `/supervibe-loop --resume .supervibe/memory/loops/<run-id>/state.json`, and `/supervibe-loop --stop <run-id>` for visibility and cancellation before any further execution.

### 0. Resolve plan path

a. If `<plan-path>` given → use it.
b. If `--resume <path>` → use it; mark as resume mode.
c. If `--dry-run <path>` → use it; mark as readiness-only.
d. If no args → glob `.supervibe/artifacts/plans/*.md`, sort by mtime desc, pick top 1 (or list and ask if multiple created today).
e. If no plans exist → redirect to `/supervibe-plan`, exit.

### 1. Read plan + context

- Read full plan file
- Read `supervibe:project-memory --query <topic-from-plan-title>` for prior similar executions
- Read related rules from `rules/` (per applies-to globs)
- Read any spec referenced by the plan (links to `.supervibe/artifacts/specs/`)

### 2. Stage A — Readiness audit (10/10 gate)

For each of the 10 dimensions above, compute pass/fail with file:line evidence:

```
=== Stage A — Readiness audit ===
Plan: .supervibe/artifacts/plans/<file>.md

[1/10] Plan format valid                  ✓
[2/10] File structure mapped              ✓
[3/10] Tasks bite-sized                   ✗ (line 451: 'similar to Task 4' is forbidden placeholder)
[4/10] Verification per step              ✓
[5/10] Hard constraints listed            ✓
[6/10] Risk mitigation per phase          ✓
[7/10] Reversibility documented           ✓
[8/10] Dependencies clear                 ✓
[9/10] Self-review pass                   ✓
[10/10] Quality gates per phase           ✗ (Phase 5 lacks explicit pass criteria)

Readiness score: 8/10
Machine validator: FAIL (`validate-plan-artifacts`)

Failures:
  • [3] line 451: 'similar to Task 4' — placeholder forbidden
  • [10] Phase 5 (lines 1849-1992): no explicit pass criteria for stack-pack auto-detect

Options:
  A) Fix gaps inline (recommended)
  B) Override and proceed at 8/10 (logged)
  C) Cancel
```

If score = 10 → proceed to step 3.
If score < 10 → present options, wait for user choice.

### 3. Choose execution mode

Based on plan structure (parallelisable batches, task count):

- **Subagent-driven** (recommended for ≥3 independent tasks): one fresh subagent per task; two-stage review between
- **Inline** (recommended for ≤3 tasks OR sequential dependencies): execute in current session with checkpoints

Print recommendation + ask user.

### 4. Execute

Dispatch the chosen execution skill:
- Subagent-driven → `supervibe:subagent-driven-development`
- Inline → `supervibe:executing-plans`

Pass the plan path + readiness audit log + override note (if any).

For each phase:
- Run all tasks
- Run phase-level verification (e.g., `npm run check` if plan calls for it)
- Run regression suite if plan has Phase 7 / explicit regression gate
- Update memory entries per plan's intent
- Tick checkboxes in plan file

### 5. Stage B — Completion audit (10/10 gate)

After all phases done, score against 10 completion dimensions:

```
=== Stage B — Completion audit ===

[1/10] All checkboxes ticked              ✓ (147/147)
[2/10] All verifications ran              ✓
[3/10] All tests pass                     ✓ (320/320 + 10 validators + knip)
[4/10] No regressions                     ✓ (Phase 7 baseline diff clean)
[5/10] Memory updated                     ✓ (3 decisions, 2 learnings added)
[6/10] Files created exist                ✓ (87/87)
[7/10] Files modified are minimal         ✓ (no scope creep)
[8/10] Confidence rubric scored           ✓ (final delivery: 9.4/10 against agent-delivery)
[9/10] No half-finished code              ✓ (knip clean)
[10/10] Documentation in sync             ✓ (host instruction file + README.md updated)

Completion score: 10/10 ✓
```

If 10/10 → done. Print summary + offer to `/schedule` follow-up if natural cleanup task is implied by the active host instruction file.

If <10 → present options A/B/C.

### 6. Optional: persist execution record

Write `.supervibe/memory/solutions/<plan-slug>-executed-<ISO-date>.md` with:
- Plan path
- Readiness score (Stage A)
- Completion score (Stage B)
- Notable decisions made during execution
- Files changed (git stat)
- Tests/validators state

This becomes searchable context for future similar plans.

---

## Output contract

### Dry-run mode

```
=== Supervibe Execute Plan — DRY RUN ===
Plan:        .supervibe/artifacts/plans/<file>.md
Tasks:       <N> across <M> phases
Readiness:   <X>/10  ✓ or ✗

[Per-dimension breakdown with file:line gaps if any]

Recommendation: <fix gaps | proceed | cancel>
```

### Full execution mode

```
=== Supervibe Execute Plan ===
Plan:        <path>
Mode:        <subagent-driven | inline>
Phases:      <N>
Tasks:       <total> (<parallel>) batches: <P>

[Stage A — Readiness audit results]
[Per-phase progress + verifications]
[Stage B — Completion audit results]

Memory entries created: <list>
Files changed: <stat>
Tests:       <pass/fail>
Regression:  <baseline-diff status>

Final score: <X>/10  Rubric: <rubric-id>
Status:      ✓ COMPLETE | ⚠ PARTIAL | ✗ REVERTED
Confidence:  <N>.<dd>/10
Override:    <true|false>
Rubric:      execute-plan
```

---

## Confidence rubric

This command emits a final score against a NEW rubric `execute-plan.yaml` (added by this command's introduction). 

**Scoring dimensions** (~Phase 6 work to add the rubric file):
- readiness-audit-thoroughness (weight 3) — did Stage A truly check all 10 dims with evidence?
- execution-fidelity (weight 3) — did execution follow plan exactly?
- completion-audit-thoroughness (weight 2) — did Stage B truly verify all 10 dims?
- regression-prevention (weight 1) — was Phase 7 / regression suite respected?
- evidence-trail (weight 1) — are memory entries + audit logs in place?

Sum = 10. Gate at ≥9 for non-blocking; override allowed once-per-plan.

---

## When NOT to invoke

- Plan doesn't exist → run `/supervibe-plan` first
- Plan readiness < 5/10 → fix the plan, don't execute a broken plan
- Plan executes irreversible side-effects (prod migrations, mass external API calls) → use a wrapper that adds confirmation per side-effect, this command doesn't add per-action confirmations
- One-line trivial change → just implement, no plan needed

---

## Related

- `supervibe:executing-plans` skill — inline execution methodology
- `supervibe:subagent-driven-development` skill — fan-out execution
- `supervibe:writing-plans` skill — produces what this consumes
- `supervibe:confidence-scoring` skill — applies the rubric
- `/supervibe-plan` — what produces the plan input
- `/supervibe-brainstorm` — what produces the spec input to /supervibe-plan
- `/supervibe-score` — score a single artifact (this command auto-scores final delivery)
- `supervibe:executing-plans` — inline execution methodology
- `docs/templates/plan-template.md` — the plan format this command parses
- `confidence-rubrics/execute-plan.yaml` — scoring rubric (created when this command ships)
