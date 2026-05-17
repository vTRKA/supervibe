---
name: interview-me
namespace: process
description: >-
  Use BEFORE requirements, PRD, or implementation work when the request is underspecified to ask one question at a time until the goal, constraints, confidence, and next owner are clear.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: brainstorm
prerequisites: []
emits-artifact: interview-brief
confidence-rubric: confidence-rubrics/requirements.yaml
gate-on-exit: true
version: 1
last-verified: 2026-05-18T00:00:00.000Z
---

# Interview Me

## Overview

Interview Me turns vague intent into a compact brief. Ask exactly one question, record the answer, update confidence, and stop when the next safe skill is clear.

## When to Use

- The user asks to be interviewed, grilled, or clarified before work starts.
- Outcome, user, scope, acceptance criteria, risk, data, or deadline is missing.
- Two plausible interpretations would route to different skills or artifacts.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## When not to use

- Do not use for fully specified, low-risk edits.
- Do not ask question batches or generic questionnaires.
- Do not replace `requirements-intake`, `prd`, legal/security review, or an implementation plan.

## Step 0 - Source-of-truth preflight

1. Read the exact request and active instructions.
2. Search memory or local artifacts only if prior decisions could change the question.
3. Name the blocked decision: build, plan, PRD, design, review, release, or stop.
4. Write the current hypothesis and rank unknowns by risk.

## Decision tree

```text
One safe interpretation? -> route without interview
Missing outcome/scope? -> ask product question
Missing boundary/data/security? -> ask contract question
Missing delivery/verification? -> ask execution question
Answer changes route? -> update hypothesis and ask next question
Confidence >= 9/10? -> emit brief and hand off
```

## Procedure

1. Record request, hypothesis, blocked decision, and unknowns.
2. Ask the single highest-impact question in the user's language.
3. Prefer 2-3 real options when choices are mutually exclusive.
4. Record the answer, update hypothesis, unknowns, and confidence.
5. Repeat until confidence reaches gate or a blocker is explicit.
6. Emit the brief and name the next skill or stop condition.

## Common rationalizations

- "I can infer it" fails when the inference changes scope or risk.
- "More questions are thorough" fails because batches hide the real blocker.
- "The PRD can decide later" fails when the first fact decides whether PRD is right.

## Red flags

- Multiple unrelated questions in one message.
- Solution ideas appear before problem, user, and success bar are clear.
- Confidence is high while scope or acceptance criteria remain unknown.

## Checklist

- Request as stated is preserved.
- One question was asked this turn.
- Each answer changed brief, confidence, or next action.
- Next owner skill or blocker is named.

## Failure modes

- Interview drift after routing is clear.
- False certainty from invented constraints.
- Scope creep from optional ideas accepted without confirmation.
- Weak handoff that omits hypothesis or residual unknowns.

## Output contract

Returns `interview-brief` with:

- `requestAsStated`
- `hypothesis`
- `questionsAsked`
- `answers`
- `knownFacts`
- `assumptions`
- `openQuestions`
- `confidenceScore`
- `nextSkillOrBlocker`
- `verificationPlan`

## Guard rails

- DO NOT ask more than one question per turn.
- DO NOT ask decorative questions that cannot change the next action.
- DO NOT invent answers to pass the gate.
- ALWAYS hand off to `requirements-intake`, `prd`, `brainstorming`, or a blocker.

## Verification

- Run `npm run validate:skill-content-quality`.
- Run `npm run validate:agent-skill-coverage` after owner wiring.
- Valid use shows question log, confidence score, and next owner.

## Related

- `supervibe:requirements-intake`
- `supervibe:prd`
- `supervibe:brainstorming`
