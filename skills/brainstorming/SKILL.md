---
name: brainstorming
namespace: process
description: >-
  Use BEFORE creative or feature work, or when the user asks to brainstorm,
  clarify intent, produce an approved requirements spec, and hand off to
  /supervibe-plan without implementing early. Triggers: 'brainstorm',
  'next step', 'брейншторм', 'брейншторм готов', 'я сделал брейншторм', 'план'.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
phase: brainstorm
prerequisites: []
emits-artifact: requirements-spec
confidence-rubric: confidence-rubrics/requirements.yaml
gate-on-exit: true
version: 1.3
last-verified: 2026-05-14T00:00:00.000Z
---

# Brainstorming

## Overview

This skill turns an ambiguous idea into an approved requirements spec before
planning or implementation. It is a gate, not a shortcut to code: it clarifies
purpose, scope, options, risks, kill criteria, production readiness, and
verification evidence, then hands off to `supervibe:writing-plans`.

For design-heavy brainstorms, use this skill for requirements and then route
brand/prototype specifics through `supervibe:brandbook` and `supervibe:prototype`.
Their reusable design examples live in `references/skills/brandbook-examples.md`
and `references/skills/prototype-examples.md`.

## When to Use

Use this skill when the user says they want to brainstorm, add a feature, design
a new capability, explore approaches, or decide what to build next.

Use a minimal brainstorm for clear, small work with fewer than three acceptance
criteria and a narrow file area. Use the full workflow for multi-step products,
design systems, migrations, integrations, user-facing workflows, or anything
with meaningful uncertainty.

Do not use it for bug fixes, incident response, routine refactors, or requests
that already point at an approved implementation plan.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source
of truth, preserve retrieval evidence, apply scope safety, use real producers
with runtime receipts for durable delegated outputs, verify before completion
claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

Before asking questions:
1. Read the active host instruction file for project rules and write scope.
2. Read the most recent commits with `git log -10 --oneline`.
3. Inspect related specs under `.supervibe/artifacts/specs/`.
4. Check project memory under `.supervibe/memory/` and legacy `MEMORY.md` when
   present.
5. Read `docs/references/scope-safety-standard.md`.
6. For work that will later change code, record which Code RAG, CodeGraph, or
   `supervibe-context-pack` query the planner must run.

Do not write a durable spec until the Documentation Approval Gate is answered.

## Continuation Contract

Do not stop after individual brainstorm sections. Continue until you complete the full requirements package, then show a durable pre-spec summary, Documentation Approval Gate, and source-bound Post-documentation summary / Post-spec summary. The user-facing recap must be a text-first summary and a human-first Decision Card with recommendation, `Step N/M` question, choices, resume cursor, and next command. It must expose `NEXT_USER_ACTIONS[]` with choices including approve spec and write plan and revise idea/spec. Emit the raw `NEXT_STEP_HANDOFF` only after the Documentation Approval Gate is answered and only after the Decision Card.

Do not write the spec until the user explicitly approves the documentation gate.

## Topic Drift / Resume Contract

If a saved brainstorm, `NEXT_STEP_HANDOFF`, or workflow state exists and the user changes topic, surface the saved phase and ask whether to continue, skip/delegate safe non-final decisions, pause and switch topic, or stop/archive.

## Decision tree

- User request spans multiple independent subsystems -> decompose and
  brainstorm one bounded sub-project first.
- Request is clear and small -> run a minimal brainstorm with one or two
  questions, explicit assumptions, and a compact spec.
- Request is unclear, cross-team, user-facing, risky, or creative -> run the full
  workflow.
- User shifts topic while a brainstorm or `NEXT_STEP_HANDOFF` exists -> surface
  saved phase and ask whether to continue, delegate safe decisions, pause and
  switch, or stop/archive.
- User asks to implement before spec approval -> stop and explain that
  requirements approval and plan handoff are still required.

## Procedure

1. Restate the request and identify the actual problem behind it.
2. List constraints, success criteria, failure modes, and explicit non-goals.
3. Ask one clarifying question at a time, preferring multiple-choice questions
   that explain what decision they unlock and what assumption applies if skipped.
4. Generate two or three viable approaches, including "do nothing" or "minimal
   patch" when useful, and document tradeoffs.
5. Map product readiness: MVP/production/migration/experiment/refactor,
   launch model, owner, support path, and what production-ready means.
6. Run the Scope Safety Gate: include, defer, reject, or spike candidate
   additions with concrete why-not rationale.
7. Enumerate at least three non-obvious risks and at least two kill criteria.
8. Build a decision matrix with weights set before scoring.
9. Present a pre-documentation summary: problem, recommended option, included
   scope, deferred/rejected scope, key risks, evidence plan, and visual
   explanation mode.
10. Ask the Documentation Approval Gate and wait. Visible choices must include
    create documentation, revise first, show visual preview first, compare or
    research deeper, and keep summary/stop.
11. After approval, write
    `.supervibe/artifacts/specs/YYYY-MM-DD-<topic>-brainstorm.md` using
    `docs/templates/brainstorm-output-template.md`.
12. Self-review for placeholders, consistency, scope creep, ambiguity, MVP
    readiness, and production-readiness gaps.
13. Run
    `node scripts/validate-spec-artifacts.mjs --file <spec-path>` and fix
    reported gaps.
14. Score with the requirements confidence rubric; do not claim 10/10 unless
    every scorecard row has evidence or an explicit blocker.
15. Print a source-bound post-spec summary built with `scripts/lib/supervibe-post-stage-actions.mjs`; it must include the spec path, source hash, markdown table, ASCII lifecycle map, added-and-why, deferred-and-why, validation result, and next actions. Then print the Decision Card and secondary raw `NEXT_STEP_HANDOFF` to `supervibe:writing-plans`; wait for the user's next-action choice.

## Examples

- New feature: decompose the problem, compare minimal/standard/ambitious
  options, pick an MVP path, write the spec after approval, validate it, then
  hand off to `/supervibe-plan --from-brainstorm <spec>`.
- Design workflow: clarify audience, trust posture, information density,
  reference borrow/avoid, and acceptance evidence, then route visual-system
  material to `supervibe:brandbook` after the spec is approved.
- Existing-system refactor: emphasize callers, migration windows, rollback,
  regression risk, and the smallest production-safe change.

## When not to use

- Do not implement, scaffold, or modify behavior before requirements approval.
- Do not replace `/supervibe-plan` with an inline implementation plan after the
  brainstorm.
- Do not use this skill when source evidence, RAG/CodeGraph expectations, or
  required validation are missing and the output would claim certainty.
- Do not treat "ok" as approval for durable documentation or next-stage work.

## Common rationalizations

- "There is only one viable option." Reject; include at least one minimal,
  deferred, or do-nothing comparator so tradeoffs are visible.
- "The user wants speed." Reject premature implementation; use a minimal
  brainstorm but keep approval and handoff gates.
- "Open questions can be empty." Reject; every real idea has unknowns, accepted
  assumptions, or evidence still needed.
- "Competitive examples are enough." Reject cargo-culting; record borrow,
  avoid, and fit rationale.

## Red flags

- The spec lacks non-goals, kill criteria, or Scope Safety Gate decisions.
- Optional extras enter accepted scope without owner, tradeoff, rollout, and
  verification.
- Production readiness omits security/privacy, observability, rollback, or
  release verification.
- The handoff does not name the next command, next skill, artifact path, and
  stop condition.
- The conversation moves from brainstorm to implementation without an approved
  spec and plan.

## Checklist

- Source of truth checked before questions.
- One question at a time.
- First-principle decomposition completed.
- Scope Safety Gate included.
- Non-obvious risks and kill criteria documented.
- Decision matrix weights set before scoring.
- Documentation Approval Gate answered before file write.
- Spec validator passed.
- Confidence score and evidence recorded.
- `NEXT_STEP_HANDOFF` printed and next user action awaited.

## Failure modes

- The brainstorm becomes a feature buffet instead of a scoped decision.
- The spec records conclusions without evidence or accepted assumptions.
- A partial brainstorm is silently abandoned when topic drift occurs.
- Planning starts without user approval of the spec.
- The handoff omits RAG/CodeGraph evidence requirements for future code work.

## Output contract

Return these fields:
- `artifact`: approved spec path.
- `recommendation`: selected option and rationale.
- `scope`: included, deferred, rejected, and spike items.
- `evidencePlan`: memory, Code RAG, CodeGraph, and external sources needed for
  planning.
- `readiness`: MVP/production model, owner, support, rollout, rollback, and
  verification.
- `validation`: spec validator command and result.
- `confidence`: numeric score, override flag, and requirements rubric.
- `decisionCard`: human-first recommendation, `Step N/M` question, choices, resume cursor, and next command.
- `handoff`: secondary `NEXT_STEP_HANDOFF` with next command, next skill, stop condition, and visible next-action choices.

## Guard rails

- Ask one question per message.
- Do not write durable brainstorm documentation before explicit approval.
- Do not continue to planning until the user chooses a next action.
- Do not add broad optional scope just because it is related or modern.
- Always decompose multi-subsystem work before deep-diving.
- Always preserve accepted assumptions and unresolved blockers in the spec.
- Always hand off to `supervibe:writing-plans` rather than implementing.

## Verification

- Spec exists at `.supervibe/artifacts/specs/YYYY-MM-DD-<topic>-brainstorm.md`.
- `node scripts/validate-spec-artifacts.mjs --file <spec-path>` exits 0.
- Spec contains problem statement, decomposition, options, readiness,
  non-obvious risks, kill criteria, decision matrix, Scope Safety Gate,
  recommendation, production readiness, scorecard, and open questions.
- Documentation approval source is recorded.
- Confidence score is at least 9 or blockers are explicit.
- `NEXT_STEP_HANDOFF` names the next command and stop condition.

## Supporting references

- `docs/templates/brainstorm-output-template.md`
- `docs/references/scope-safety-standard.md`
- `docs/references/visual-explanation-standard.md`
- `references/skills/brandbook-examples.md`
- `references/skills/prototype-examples.md`

## Related

- `supervibe:requirements-intake` decides whether brainstorming is needed.
- `supervibe:writing-plans` is the next stage after spec approval.
- `supervibe:explore-alternatives` can support decision matrix exploration.
- `supervibe:prd` handles long-term architectural/product decisions.
- `supervibe:mcp-discovery` checks available tools for reference scans.
