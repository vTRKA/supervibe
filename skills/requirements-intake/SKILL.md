---
name: requirements-intake
namespace: process
description: "Use BEFORE any new feature, bug fix, or refactor request to capture requirements with stack-aware questions and decide complexity routing (brainstorm vs plan vs exec)"
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: brainstorm
prerequisites: []
emits-artifact: requirements-spec
confidence-rubric: confidence-rubrics/requirements.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Requirements Intake

## When to invoke

BEFORE any new feature/bug/refactor request enters the workflow. This is the entry-gate that decides what skill chain to invoke next.

Triggered when user says: "add X", "fix Y", "refactor Z", "let's build N".

## Step 0 — Read source of truth (MANDATORY)

1. Read project state (Glob package.json/composer.json/Cargo.toml — detect stack)
2. Read `CLAUDE.md` for project conventions
3. Read `MEMORY.md` for prior preferences/feedback
4. Identify which `questionnaires/*.yaml` apply to detected stack

## Decision tree (output: which skill to invoke next)

```
Estimated complexity (1-10 scale):
├─ ≥7 → invoke evolve:brainstorming (full design exploration)
├─ 3-6 → invoke evolve:writing-plans directly (skip brainstorm)
└─ ≤2 → invoke evolve:executing-plans directly with single-task plan
                  (only after triviality confirmed via verification)

Complexity signals:
├─ Multi-subsystem touch              → +3
├─ New domain concept                 → +3
├─ External integration               → +2
├─ Schema/migration change            → +2
├─ Crosses ≥3 files                   → +1
├─ Behavior change (vs additive)      → +1
└─ Unknowns / spike                   → +2
```

## Procedure

1. **Stack discovery** (Step 0)
2. **Initial scope reading** — what is the user actually asking?
3. **Load questionnaires** — pull questions matching detected stack and request type
4. **Ask one question at a time** — multiple-choice when possible
5. **Build requirements-spec** with: objective, scope (in/out), acceptance criteria, edge cases, stakeholders, complexity score
6. **Confidence-score** the spec (`evolve:confidence-scoring` artifact-type=requirements-spec)
7. **If <9** → continue questioning to fill gaps; loop until ≥9
8. **Compute complexity** using signals table above
9. **Decide handoff**: brainstorming / writing-plans / executing-plans
10. **Announce decision** to user with reasoning

## Output contract

Returns:
- requirements-spec saved to `docs/specs/YYYY-MM-DD-<topic>-intake.md`
- complexity-score (1-10) with justification
- next-skill recommendation with reason
- list of asked questions and answers

## Guard rails

- DO NOT: ask multiple questions in one message
- DO NOT: assume complexity is low to skip brainstorm — be honest
- DO NOT: invent acceptance criteria the user didn't agree to
- DO NOT: route to executing-plans without verifying triviality (re-read change scope)
- ALWAYS: stack-aware (load relevant questionnaires)
- ALWAYS: gate ≥9 before handoff

## Verification

- Spec file exists with complexity score
- Score ≥9 recorded
- Next-skill recommendation is one of: brainstorming, writing-plans, executing-plans

## Related

- `evolve:brainstorming` — invoked when complexity ≥7
- `evolve:writing-plans` — invoked when complexity 3-6
- `evolve:executing-plans` — invoked when complexity ≤2
- `questionnaires/` (Phase 5) — source of stack-aware questions
