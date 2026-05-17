# Plan Task Patterns

This reference is the one-hop detail pack for `skills/writing-plans/SKILL.md`.
Use it when the planner needs examples, templates, or matrices that would make
the skill entrypoint too large. The skill file remains authoritative for gates
and stop conditions.

## Phase Size Patterns

| Situation | Plan shape | Gate style |
| --- | --- | --- |
| One coherent change, up to 10 tasks | Single phase | Task verification plus final self-review |
| Two to four phases, 20-60 tasks | Multi-phase plan | Phase review gates plus final acceptance |
| Five or more phases or broad production path | Mega-plan | Master phase index, compact late phases, release gate |
| High-regression refactor | Risk-heavy plan | Review gate after every small batch |

## Plan Scope Approval Preview

Before writing the durable plan, show a compact preview with:

- Proposed phases and task groups.
- Files/modules expected to change.
- Included, deferred, rejected, and explicitly excluded scope.
- Major risks and rollback posture.
- Verification strategy and commands.
- What the plan will not implement.
- One visible question asking for approve, revise, exclude/defer, audit deeper,
  or keep draft.

Free-form exclusions such as "defer analytics" or "split mobile later" update
the preview and become scope-safety records.

## Required Plan Sections

```markdown
# <Feature> Implementation Plan

**Goal:** <one sentence>
**Architecture:** <two or three sentences>
**Tech Stack:** <key libraries and runtime>
**Constraints:** <hard limits, gates, and non-goals>

## File Structure
## Retrieval, CodeGraph, And Visual Evidence
## Critical Path
## Scope Safety Gate
## Delivery Strategy
## Production Readiness
## Phase 1: <name>
### Task 1: <name>
## Final Acceptance Gate
## Self-Review
## Review Handoff
## Post-Review Atomic/Epic Handoff
```

## Retrieval, CodeGraph, And Visual Evidence

Each plan must tell executors to collect and preserve:

- Project-memory command/query and result status.
- Code RAG query or code search citations with file/line anchors.
- CodeGraph mode, structural expectation, warnings, and fallback handling.
- Relevant source citations for each major task group.
- One text-first visual summary for critical path, state flow, architecture, or
  release gate. Use a stage map, compact table, or ASCII diagram. Mermaid is a
  fallback/export format and needs accessible title and description.

## Task Template

```markdown
### Task N: <name>

**Goal:** <one bounded outcome>
**Scope mapping:** <approved spec section or scope-change receipt>
**Files:** Create/Modify/Test paths with one-line responsibility
**Estimated time:** 5min | 15min | 1h | half-day
**Estimate confidence:** high | medium | low
**If estimate doubles:** plan still works | escalate
**Risks:** <only for public contracts, schema, APIs, migrations, launch>
**Rollback:** `git revert <commit-sha>` or explicit file rollback path

Steps:
1. Write the failing test or record why TDD does not apply.
2. Make the smallest implementation change.
3. Run `<verification command>` and expect `<observable signal>`.
4. Commit or record why commits are suppressed.
```

## TDD Applicability Matrix

| Task type | Required pattern |
| --- | --- |
| Logic, parser, transformation, data contract | Red-green-refactor |
| API or schema behavior | Failing contract/integration test first |
| Config, scaffolding, docs-only metadata | Write plus validator or grep evidence |
| UI prototype | Browser/runtime evidence plus accessibility/performance checks |
| Migration | Extra review, rollback/forward plan, fixture or dry-run evidence |

## Scope Safety Gate Matrix

| Scope bucket | Required evidence |
| --- | --- |
| Approved | Spec section, user answer, acceptance criteria, verification |
| Deferred | Reason, owner, future trigger, no hidden task in current plan |
| Rejected | Reason and risk/tradeoff |
| Scope expansion | User outcome, cost, tradeoff, owner, rollout, rollback, verification |
| Spike | Timebox, question answered, decision path, no production claim |

## Critical Path Example

```text
Critical path: T1 -> T3 -> T5 -> T8 -> T-FINAL
Sequential length: 5 tasks
Parallelizable: T2 || T4 after T1; T6 || T7 after T5
Release blocker: T-FINAL cannot start until reviewer receipts and all phase
gates are green.
```

Mark critical-path tasks with `[CRITICAL-PATH]`. Off-path tasks are candidates
for parallelization only when write sets and verification are independent.

## Real-Agent Wave Pattern

```markdown
Real host-agent invocation waves:
- Wave 1 (foundation, sequential): T1, T2
- Wave 2 (parallel, disjoint write sets): T3, T4, T5
- Wave 3 (final sweep, reviewer-owned): T-FINAL

Receipt requirement: each durable worker/reviewer output must be bound to a real
host invocation id and runtime-issued workflow receipt. Inline controller notes
are diagnostic only.
```

## Rollback Patterns

- Normal code task: rollback via the task commit and re-run the task validator.
- Docs or metadata task: rollback the specific file and re-run link/content
  validators.
- Migration: mark irreversible or forward-only, add extra review and restore
  plan, and never hide the risk under generic rollback text.
- Generated artifact: preserve source snapshot, producer command, receipt, and
  regeneration command.

## Risk Register Pattern

```markdown
**Risks:**
- **R1 (severity: high):** <public contract could break>; mitigation:
  <contract test, release gate, rollback>.
- **R2 (severity: medium):** <secondary regression>; mitigation:
  <targeted test, reviewer check, observability>.
```

Skip risk registers for purely internal trivial edits, but include them for
public APIs, schemas, command surfaces, migrations, auth, security, payments,
data retention, and launch paths.

## Phase Review Gate Pattern

```markdown
---
### REVIEW GATE 1 (after Phase A)

Before starting Phase B:
- [ ] All Phase A tasks are complete and verified.
- [ ] Required commits or artifact receipts exist.
- [ ] No unrelated regression is introduced.
- [ ] User approval is recorded if this gate affects product scope.

If the gate fails: STOP and repair or escalate before Phase B.
---
```

## NEXT_STEP_HANDOFF Pattern

```text
NEXT_STEP_HANDOFF
Current phase: plan
Artifact: .supervibe/artifacts/plans/YYYY-MM-DD-<slug>.md
Next phase: atomize
Next command: /supervibe-loop --atomize-plan .supervibe/artifacts/plans/YYYY-MM-DD-<slug>.md --user-approved-plan
Next skill: supervibe:autonomous-agent-loop
Stop condition: ask-before-graph-creation
Why: A user-approved loop-ready plan can become the active work graph without another planning or review ritual.
Question: Step 1/1: create the work graph from this plan?
Choices:
- Create graph from this plan
- Revise plan first
- Run deeper review
- Exclude/defer items
- Keep plan draft and stop
END_NEXT_STEP_HANDOFF
```

Do not expose raw `NEXT_USER_ACTIONS[]` outside command-output mode. In normal
conversation, translate the same choices into one short next-step sentence.

## Self-Review Checklist

- No placeholders or "similar to Task N" shortcuts remain.
- Every approved spec section maps to at least one task.
- Every task has files, steps, verification, rollback, and stop condition.
- Scope Safety Gate records approved, deferred, rejected, spiked, and expanded
  scope as applicable.
- Delivery Strategy reaches a production-ready MVP, not just partial code.
- Production Readiness covers test, security/privacy, performance, observability,
  rollback, release notes, migration/runbook, and support owner.
- Critical path and parallelization opportunities are marked.
- Graph creation handoff is present; deeper review handoff appears only when explicitly requested or risk-gated.

## Anti-Patterns

- "Implement the feature" as a task step.
- Behavioral task without failing-test-first or explicit non-TDD reason.
- Verification described as "should work".
- Hidden optional polish in implementation tasks.
- Estimates with false precision.
- No rollback plan.
- Empty self-review.
- Execution offered before a user-approved work graph exists, or before an explicit strict review gate is resolved when one was requested.
