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

## Overview

Use this skill to turn completed implementation work, a PR candidate, or a
plan-review artifact into a reviewer-ready package. The package must give the
reviewer enough context to judge the change without rediscovering the task:
scope packet, diff summary, verification evidence, known risks, and reviewer
selection. The output is an evidence-backed handoff, not a short command alias
or a substitute for the reviewer.

## When to Use

BEFORE invoking `code-reviewer` agent OR before opening a PR for external review. After implementation completes but before claiming done.

Also invoke this as the mandatory **plan-review loop** immediately after `supervibe:writing-plans` saves a plan. In plan-review mode, review the plan artifact itself before atomization, epic creation, or execution.

Use the full review packet when:

- A diff touches more than one behavioral concern, workflow state, public API,
  durable artifact, security boundary, data contract, or release gate.
- A reviewer needs source evidence, verification output, or explicit risk
  context to avoid rereading the whole repository.
- The work item, PR, or plan has known tradeoffs, deferred scope, degraded
  evidence, or parallel write-set risk.
- A specialist reviewer must be selected because the diff touches security,
  database, API, UI, performance, infrastructure, provider, memory, RAG, or
  CodeGraph behavior.

## Plan Review User Gate

Plan-review mode is a mandatory reviewer gate, not a controller-only reread. It must include Reviewer Coverage for the baseline reviewers `supervibe-orchestrator`, `systems-analyst`, `architect-reviewer`, and `quality-gate-reviewer`, plus any risk-triggered specialist reviewers. A plan cannot pass review with open critical or major findings, missing reviewer coverage, missing durable review artifact, or missing Next User Decision.

After a pass, ask the user whether to atomize, revise, rerun specialist review, inspect readiness, or stop. Do not atomize, create an epic, execute, bump versions, commit, push, or clean up until the current explicit user answer is recorded after that question.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 — Read source of truth (required)

1. Read the spec/plan that motivated the change
2. Read all modified/created/deleted files (`git diff`)
3. Check project memory, Code RAG/code search, and CodeGraph readiness when the
   change is non-trivial; record stale or unavailable retrieval explicitly
4. Run the verification command required by the task; run full check
   (`npm run check` or project equivalent) before PR/release claims and capture
   output
5. Take screenshots if UI change
6. Include wave status and assignment explanation when the change came from `/supervibe-loop --assign-ready` or a multi-agent wave

## Review packet contract

Every request must define these five fields before a reviewer is invoked:

| Field | Required content |
| --- | --- |
| Scope packet | Work item or PR id, user outcome, in-scope files, out-of-scope files, owned write set, source plan/spec, related receipts or artifacts, and any parallel-worker conflict notes. |
| Diff summary | One row per changed file with change type, behavioral intent, public contract impact, and whether the change is additive, modifying, deleting, moving, or refactoring. |
| Verification evidence | Exact commands, exit codes, relevant output snippets, screenshots, manual inspections, and explicit gaps when a required check is deferred or unavailable. |
| Known risks | Open risks, degraded evidence, stale memory/RAG/CodeGraph state, migration or rollback concerns, security/privacy considerations, and accepted tradeoffs. |
| Reviewer selection | Chosen reviewer role or agent, selection rationale, specialist triggers considered, reviewers intentionally not selected, and independence from the implementer. |

If any field is missing, stop and collect it or state why the request is
blocked. A thin "please review" message is not a valid review request.

## Decision tree

```
What's the review surface?
|-- Single small change (<=3 files, <=100 lines)
|   `-- Minimal package: scope packet, concise diff summary, targeted verification output
|-- Feature, workflow, command, or durable artifact
|   `-- Full package: What/Why/Test plan, risks, rollback, reviewer selection
|-- Refactor, move, delete, rename, extraction, or public symbol change
|   `-- Full package plus before/after behavior and CodeGraph caller evidence
|-- Security, privacy, secrets, auth, filesystem, network, provider, or release risk
|   `-- Add security reviewer and threat/risk evidence
|-- Database, migration, cache, queue, API, or compatibility risk
|   `-- Add domain reviewer and contract/rollback evidence
`-- Plan-review artifact
    `-- Use plan-review mode with required baseline reviewers and Next User Decision
```

Reviewer selection:

```
General code correctness/readability/test coverage -> code-reviewer
Security/privacy/secrets/permissions/release trust -> security-auditor
Database/migration/storage topology -> db-reviewer or data specialist
API/schema/compatibility/idempotency -> API contract reviewer
UI/browser/accessibility/visual regression -> frontend or UX reviewer
Performance/resource usage -> performance reviewer
Plan/workflow/readiness gate -> quality-gate-reviewer plus risk specialists
```

## Procedure

1. **Collect change scope** - list every changed, created, deleted, or moved
   file with owner, intent, and in-scope/out-of-scope boundary.
2. **Build the scope packet** - include work item or PR id, source plan/spec,
   user outcome, non-goals, owned write set, relevant memory/RAG/CodeGraph
   status, and parallel-worker conflict notes.
3. **Write the diff summary** - one row per changed file with behavior impact,
   contract impact, test impact, and whether the reviewer should inspect a
   specific line range.
4. **Write PR description**:
   ```markdown
   ## What
   <one sentence>

   ## Why
   <one sentence + spec link>

   ## Test plan
   - [ ] <verification step 1>
   - [ ] <verification step 2>
   ```
5. **Attach verification evidence**:
   - Test output (verbatim, not summarized)
   - Screenshots for UI
   - Performance numbers (before/after) for perf changes
   - Evidence ledger status for required memory, RAG and codegraph citations
   - Assignment explanation, reviewer independence, and wave/block reasons for multi-agent work
6. **Record known risks** - name blockers, residual risks, stale retrieval,
   skipped checks, migration/rollback concerns, security/privacy impact, and
   tradeoffs accepted by the implementer.
7. **Select reviewer** - choose `code-reviewer` for general code,
   `security-auditor` for security-sensitive changes, `db-reviewer` for
   database/storage changes, and risk-triggered specialists for API, frontend,
   performance, infrastructure, provider, memory, RAG, or CodeGraph changes.
   Record why each selected reviewer is necessary and why omitted specialists
   are not needed.
8. **Format reviewer prompt** - ask the reviewer to use
   `references/templates/reviewer-output.md` and require severity, file line,
   impact, suggested fix, evidence, and verdict for every finding.
9. **Score** - `supervibe:confidence-scoring` artifact-type=agent-output (the prepared package)
10. **Invoke reviewer** with the prepared package

## When not to use

- Do not use this skill to bypass the command or workflow that owns durable artifacts.
- Do not use it when source evidence, RAG/CodeGraph, or required verification is missing.
- Do not use it to replace a specialist producer, worker, or reviewer that must issue runtime evidence.

## Common rationalizations

- "This is small, so no source check is needed" - reject when the skill changes code, config, or durable artifacts.
- "The user asked for speed, so skip receipts" - reject when durable work, delegation, or review is claimed.
- "Existing prose is enough evidence" - reject when validators or command output are required.
- "The diff is self-explanatory" - reject when the reviewer still needs scope,
  non-goals, verification, or known risk context to avoid guessing.
- "One general reviewer can cover every risk" - reject when security,
  database, API, UI, performance, infrastructure, or provider risk is present.
- "Failed or skipped verification can be mentioned later" - reject; include
  the exact gap in the request before the reviewer starts.

## Red flags

- A durable artifact changes without a command, receipt, or verification path.
- The skill is used outside its phase without an explicit handoff.
- Claims of completion appear before evidence and confidence scoring.
- The review request has no file-level diff summary or hides deleted/moved
  files behind a generic summary.
- Known risks are described as "none" while retrieval is stale, checks were
  skipped, reviewers are missing, or rollback is unclear.
- Reviewer selection has no rationale or sends regulated/security work to a
  general reviewer only.

## Checklist

- Source of truth read.
- Scope and owner confirmed.
- RAG/CodeGraph/memory requirement decided.
- Evidence artifact or command recorded.
- Stop condition and next handoff clear.
- Scope packet includes in-scope files, out-of-scope files, source artifact,
  write ownership, user outcome, and non-goals.
- Diff summary covers every changed/created/deleted/moved file.
- Verification evidence includes command, exit code, and relevant output or a
  named blocker.
- Known risks and tradeoffs have owner, impact, and next safe action.
- Reviewer selection records chosen reviewer, rationale, omitted specialists,
  and independence.

## Failure modes

- Inline emulation replaces a required producer or reviewer.
- Broad use of the skill slows delivery without improving evidence.
- Missing verification lets stale assumptions pass as production-ready.
- Reviewer receives only a command or vague request and spends review capacity
  reconstructing scope instead of finding defects.
- Diff summary omits generated, deleted, moved, or durable artifact changes,
  causing reviewers to miss contract or rollback risk.
- Verification evidence is paraphrased, so failures, warnings, and skipped
  checks cannot be independently interpreted.
- Specialist selection is based on title instead of touched surfaces, leaving a
  security, data, API, UI, or performance issue unreviewed.

## Examples

- Use after a targeted skill edit: include the three owned files, the exact task
  id, `npm run validate:skill-content-quality`, `npm run validate:artifact-links`,
  stale index status from `npm run supervibe:status`, and `code-reviewer` plus
  `quality-gate-reviewer` if the task is a review gate.
- Use before a refactor review: include before/after behavior, public symbols
  touched, CodeGraph caller command output, rollback path, and a reviewer
  prompt that asks for file-line findings.
- Do not ask "review this" with only a diff link when tests were skipped,
  security risk exists, or the reviewer cannot see the source plan.

## Output contract

### Plan-review mode

When the input artifact is a plan, produce a review package with:
- Spec coverage and unresolved questions
- MVP value, anti-bloat check, and explicit approved/deferred/rejected scope
- Architecture fit, PRD decision section need, and unresolved architecture decisions
- Risk-triggered specialist coverage for database, cache, queue, security, API, infrastructure, and frontend areas
- Data storage topology, migration safety, backup, restore, and scaling posture when database risk is triggered
- Cache and queue topology, retry, idempotency, and dead-letter behavior when cache or queue risk is triggered
- API contract readiness, error envelope, compatibility, and idempotency when API risk is triggered
- Security and privacy review for threat model, PII, secrets, permission model, and audit logging
- Observability, release, support, rollback, and incident visibility
- Dependency graph and critical-path sanity
- Task size and atomicity
- Verification coverage, including UI/browser evidence where applicable
- Rollback coverage and risky side effects
- Parallel write-set conflicts
- Worktree suitability for long autonomous runs
- Capability assignment, reviewer independence, and wave serialization/blocker reasons
- Provider-policy safety: no bypass defaults, no hidden background automation, explicit stop/resume/status

Plan-review mode must write a durable artifact using `docs/templates/plan-review-template.md`, validate it with `node scripts/validate-plan-review-artifacts.mjs --file <review-artifact>`, and score against `confidence-rubrics/plan-review.yaml`. Inline notes are diagnostic only. The loop can stop with pass only when the Convergence Ledger shows at least one iteration, zero open critical findings, zero open major findings, an explicit stop reason, and a Next User Decision.

If the plan passes, print:

```text
NEXT_STEP_HANDOFF
Current phase: plan-review
Artifact: .supervibe/artifacts/plans/YYYY-MM-DD-<slug>.md
Next phase: work-item-atomization
Next command: /supervibe-loop --atomize-plan .supervibe/artifacts/plans/YYYY-MM-DD-<slug>.md --plan-review-passed
Next skill: supervibe:writing-plans
Stop condition: ask-before-work-item-atomization
Why: A reviewed plan can become durable atomic work items and an epic.
Question: Step 1/1: atomizing the plan into an epic and child work items?
Choices:
- Continue to atomization - uses the reviewed plan path and `--plan-review-passed`; no execution starts yet.
- Revise the reviewed plan first - returns to `/supervibe-plan <plan-path>` with the review findings.
- Ask for another specialist review - reruns review for the unresolved risk area before atomization.
- Keep reviewed plan and stop - records the passed review without creating work items.
END_NEXT_STEP_HANDOFF
```

Also print `NEXT_USER_ACTIONS[]`: continue to atomization, revise reviewed plan first, ask for another specialist review, inspect readiness/blockers, or keep reviewed plan and stop. Do not atomize, create an epic, or execute until the user chooses one action.

If the plan fails review, do not atomize or execute. Return findings and route back to `/supervibe-plan <plan-path>` for repair.

Returns:
- `status`: ready-for-review, blocked, or needs-evidence.
- `scopePacket`: work item or PR id, source plan/spec, user outcome, non-goals,
  in-scope files, out-of-scope files, owned write set, receipts/artifacts, and
  retrieval status.
- `diffSummary`: file-by-file summary with change type, behavior impact,
  contract impact, and review focus.
- `verificationEvidence`: commands, exit codes, output snippets, screenshots,
  manual checks, skipped checks, and evidence gaps.
- `knownRisks`: blockers, residual risks, degraded evidence, rollback concerns,
  tradeoffs, owner, and next safe action.
- `reviewerSelection`: selected reviewers, rationale, specialist triggers,
  omitted reviewers with reason, and independence statement.
- `reviewerPrompt`: instruction to use `references/templates/reviewer-output.md`
  and return severity, file line, impact, suggested fix, evidence, and verdict.

## Guard rails

- DO NOT: open PR without running full project checks
- DO NOT: paraphrase test output ("all tests pass" without showing the output)
- DO NOT: attach incomplete evidence (e.g., one screenshot when feature has 3 states)
- DO NOT: send a review request without scope packet, diff summary,
  verification evidence, known risks, and reviewer selection.
- DO NOT: hide stale memory/RAG/CodeGraph status or skipped verification behind
  a positive summary.
- DO NOT: select a reviewer by convenience when touched surfaces require a
  specialist.
- ALWAYS: link to spec/plan in PR description
- ALWAYS: include verification commands user can re-run
- ALWAYS: state out-of-scope files and non-goals so the reviewer can distinguish
  defects from deferred work.
- ALWAYS: use file paths and line references when directing reviewer attention.

## Verification

- PR description has What + Why + Test plan
- Test output is verbatim
- All claims in description are supported by evidence
- Scope packet, diff summary, verification evidence, known risks, and reviewer
  selection are all present.
- Every changed file appears in the diff summary or is explicitly excluded with
  reason.
- Verification evidence records exact command names, exit codes, and output or
  a blocker reason.
- Reviewer selection matches touched surfaces and records specialist omissions.

## Related

- `supervibe:code-review` — methodology consumed by reviewer
- `supervibe:receiving-code-review` — how to handle the resulting feedback
- `supervibe:pre-pr-check` — runs comprehensive checks before this
