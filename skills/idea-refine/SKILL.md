---
name: idea-refine
namespace: product
description: "Use WHEN a raw idea, feature request, or vague product direction needs to become a decision-ready concept before PRD or planning."
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: brainstorm
prerequisites: []
emits-artifact: concept-brief
confidence-rubric: confidence-rubrics/requirements.yaml
gate-on-exit: true
version: 1
last-verified: 2026-05-18T00:00:00.000Z
---

# Idea Refine

## Overview

Idea Refine turns a rough request into a small decision-ready concept: problem, user, outcome, constraints, alternatives, MVP boundary, risks, and next workflow. It is lighter than a PRD and more convergent than open brainstorming.

Use it to avoid building a solution in search of a problem.

## When to Use

Use when the user brings a vague idea, maybe-we-should-build request, feature request without a clear problem, or broad direction that is not ready for PRD, design, or implementation.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

1. Read the user request and identify whether it states a user, problem, outcome, and success metric.
2. Search project memory for related product decisions, rejected ideas, prior incidents, and constraints.
3. Use Code RAG only when local implementation constraints materially affect the concept.
4. Use domain evidence for regulated, trust-sensitive, legal, health, finance, security, or government concepts before accepting defaults.
5. If one blocking question prevents refinement, use `supervibe:interview-me` first.

## When not to use

- Do not use when an approved PRD or requirements package already exists; route to planning.
- Do not use for pure implementation tasks with clear acceptance criteria.
- Do not invent user research, metrics, or stakeholder approvals.
- Do not turn the concept into a durable spec without the owning workflow.

## Decision tree

```text
Does the idea name a real user problem?
  NO  -> ask/refine problem before solution.
  YES -> continue.

Is success measurable?
  NO  -> define a proxy metric or mark concept not ready.
  YES -> continue.

Can a thin MVP prove the idea?
  YES -> define MVP and out-of-scope.
  NO  -> route to research, prototype, or discovery.
```

## Procedure

1. State the idea in one sentence without implementation detail.
2. Reframe it as a problem: persona, job-to-be-done, obstacle, and impact.
3. Define success metric with baseline, target, and timeframe when available; otherwise mark measurement gap.
4. List constraints: technical, user trust, compliance, design, release, support, cost, and dependencies.
5. Generate at least two alternatives: do nothing/status quo, smallest MVP, and larger solution when useful.
6. Choose the smallest valuable version that can prove or falsify the idea.
7. Write explicit non-goals and deferred decisions.
8. Identify risks and what evidence would reduce them.
9. Decide next skill: `prd`, `requirements-intake`, `brainstorming`, `prototype`, `writing-plans`, or stop.
10. Score with `supervibe:confidence-scoring`; below the gate, output open questions instead of a ready concept.

## Common rationalizations

- "The solution is obvious" fails when no user, problem, metric, or non-goal is stated.
- "We can define scope during implementation" fails because scope creep becomes invisible once code starts.
- "This is only a quick idea" fails when a quick idea can still create durable product or technical debt.

## Red flags

- Concept starts with technology choice instead of user outcome.
- No measurable success or kill criterion.
- MVP includes every nice-to-have from the initial request.
- Alternatives are absent or straw-man choices.
- Regulated/trust domain defaults are accepted without evidence.

## Checklist

- User, problem, outcome, and success signal are stated.
- At least two alternatives are compared.
- MVP and out-of-scope are explicit.
- Risks and evidence gaps are listed.
- Next skill and stop condition are named.

## Failure modes

- Refined idea becomes a PRD without stakeholder or evidence gates.
- Agent asks many questions instead of the one blocking question.
- Scope is expanded to make the idea feel impressive.
- Risks are softened instead of named.

## Output contract

- `concept`: one-sentence refined idea.
- `problem`: persona, job, obstacle, impact.
- `successMetric`: baseline, target, timeframe, or measurement gap.
- `alternatives`: options considered with tradeoffs.
- `mvpBoundary`: in-scope and out-of-scope.
- `risks`: risk, evidence needed, owner.
- `openQuestions`: blocking and non-blocking.
- `nextSkill`: recommended next Supervibe skill or command.
- `confidence`: score and reason.

## Guard rails

- Keep it lightweight; do not create command-owned artifacts unless the command owns the flow.
- Do not claim research evidence that was not read.
- Do not skip memory for ideas in an existing project or product area.
- Preserve user language but make assumptions explicit.

## Verification

- Concept brief contains user, problem, MVP, non-goals, risks, and next skill.
- `npm run validate:skill-content-quality` when this skill changes.
- For durable PRD handoff, run the owning PRD or requirements validator instead of treating this concept as final.

## Related

- `supervibe:interview-me`
- `supervibe:brainstorming`
- `supervibe:explore-alternatives`
- `supervibe:prd`
- `supervibe:requirements-intake`