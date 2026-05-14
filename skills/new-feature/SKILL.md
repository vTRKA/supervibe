---
name: new-feature
namespace: process
description: 'Use WHEN starting any new user-facing feature to orchestrate end-to-end flow from requirements to merge with all gates enforced. Triggers: ''новая фича'', ''feature scaffold'', ''давай новую фичу'', ''начни фичу''.'
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
phase: brainstorm
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.1
last-verified: 2026-05-02T00:00:00.000Z
---

# New Feature

## Overview

New Feature provides a reusable Supervibe operating method for Use WHEN starting any new user-facing feature to orchestrate end-to-end flow from requirements to merge with all gates enforced. Triggers: 'новая фича', 'feature scaffold', 'давай новую фичу', 'начни фичу'.
It keeps the work evidence-first, scope-bounded, confidence-scored, and verified before completion claims.
## When to Use

WHEN user says "let's build feature X" and X is non-trivial (estimated complexity ≥4). This is the orchestrator that chains the entire feature workflow.

NOT for: bug fixes (use systematic-debugging), refactors (use refactoring-specialist), config-only changes.

## Continuation Contract

Do not stop after PRD, brainstorm, prototype, plan, first task, or review if
the feature workflow still has a clear next gate and no blocker. Each stage
must either hand off to the next stage with artifact path, confidence, and stop
condition, or stop with the exact missing approval/evidence.

Intermediate stage approval is not a feature completion signal. The feature is
complete only when the approved scope is implemented, verified, reviewed, scored
at least 9/10, and either merged/released or explicitly parked with a saved
state and next command.

## Workflow Question And Reviewer Gates

The feature chain must preserve the plan/pre-plan question gate at every stage. Brainstorm-to-plan, plan-to-review, review-to-atomization, atomization-to-execution, execution-to-review, and finish/merge handoffs each require a visible Step N/M question and a current explicit user answer after the question is shown.

Plan-derived execution also requires the mandatory plan-review loop with reviewer coverage and a Next User Decision before atomic tasks, epics, autonomous loops, subagent waves, version bumps, commits, pushes, or cleanup. Do not let this orchestration skill skip those gates just because the user requested an end-to-end feature.

## Feature Definition Of Ready

Start execution only after the product outcome, approved scope, acceptance
criteria, design/prototype need, plan path, verification commands, rollback,
and release path are known. If any of these are unknown, route to the owning
skill instead of improvising in implementation.

## Feature Definition Of Done

A feature is done only when user-facing behavior meets acceptance criteria,
tests/verification pass, security/privacy/observability/release gates are
handled for the risk level, code review and quality gate evidence exist, and no
deferred optional scope is hidden inside the delivered work.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 — Read source of truth (required)

1. Read project state (stack, conventions, existing patterns)
2. Read recent PRDs / specs / plans for context
3. Read `MEMORY.md` for prior preferences

## Decision tree

```
Feature has clear product framing?
├─ NO → start with supervibe:prd (product-manager agent)
└─ YES → skip PRD

Feature visual / UI?
├─ YES → after design phase, supervibe:prototype + brandbook check
└─ NO → straight to plan + execute

Feature backend-heavy?
├─ Yes → involve appropriate stack-specific architect early
└─ NO → skip architect involvement
```

## Procedure (orchestration chain)

1. **PRD** (optional): `supervibe:prd` if no clear product framing
2. **Requirements intake**: `supervibe:requirements-intake` to set complexity routing
3. **Brainstorming**: `supervibe:brainstorming` if complexity ≥7 (else skip)
4. **Design (UI features)**: `supervibe:brandbook` if no brandbook exists, then `supervibe:prototype`
5. **Plan**: `supervibe:writing-plans`
6. **Worktree**: `supervibe:using-git-worktrees` for isolation
7. **Execute**: `supervibe:executing-plans` (or `supervibe:subagent-driven-development`)
8. **Pre-PR**: `supervibe:pre-pr-check`
9. **Review**: `supervibe:requesting-code-review` → `code-reviewer` agent → `supervibe:receiving-code-review`
10. **Quality gate**: `quality-gate-reviewer` agent
11. **Finish**: `supervibe:finishing-a-development-branch`
12. **Score** — `supervibe:confidence-scoring` agent-output for entire feature; ≥9 required to mark done

## When not to use

- Do not use this skill to bypass the command or workflow that owns durable artifacts.
- Do not use it when source evidence, RAG/CodeGraph, or required verification is missing.
- Do not use it to replace a specialist producer, worker, or reviewer that must issue runtime evidence.

## Common rationalizations

- "This is small, so no source check is needed" - reject when the skill changes code, config, or durable artifacts.
- "The user asked for speed, so skip receipts" - reject when durable work, delegation, or review is claimed.
- "Existing prose is enough evidence" - reject when validators or command output are required.

## Red flags

- A durable artifact changes without a command, receipt, or verification path.
- The skill is used outside its phase without an explicit handoff.
- Claims of completion appear before evidence and confidence scoring.

## Checklist

- Source of truth read.
- Scope and owner confirmed.
- RAG/CodeGraph/memory requirement decided.
- Evidence artifact or command recorded.
- Stop condition and next handoff clear.

## Failure modes

- Inline emulation replaces a required producer or reviewer.
- Broad use of the skill slows delivery without improving evidence.
- Missing verification lets stale assumptions pass as production-ready.

## Output contract

Returns:
- Feature delivered (commits / PR / merged code)
- Per-stage confidence scores
- Final aggregate score
- Effectiveness signals for `supervibe:evaluate` (Phase 6)

## Guard rails

- DO NOT: skip PRD for user-facing features without explicit user opt-out
- DO NOT: skip brainstorming for complex features (complexity ≥7)
- DO NOT: skip prototype for UI features (causes implementation-without-design)
- DO NOT: merge without code-review + quality-gate
- ALWAYS: enforce confidence-gates between stages
- ALWAYS: respect HARD BLOCK — no done claim at <9 without override

## Verification

- All required stages invoked in order
- Per-stage confidence scores recorded
- Final delivery has evidence (PR URL, commit hash)
- No stage skipped without documented reason

## Related

- All Phase 2 process skills (this orchestrates them)
- All Phase 3 agents (this involves them)
