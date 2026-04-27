---
name: brainstorming
namespace: process
description: "Use BEFORE any creative work (new feature, component, behavior change) to explore user intent, requirements, and design through collaborative dialogue, ending with an approved spec — gates implementation behind explicit design approval"
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: brainstorm
prerequisites: []
emits-artifact: requirements-spec
confidence-rubric: confidence-rubrics/requirements.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Brainstorming

## When to invoke

BEFORE any creative work — creating features, building components, adding functionality, or modifying behavior. Triggered when user says: "let's add X", "I want to build Y", "how should we approach Z", "design a feature for...".

NOT for: bug fixes (use systematic-debugging), routine refactors (skip to writing-plans), documentation tweaks.

## Step 0 — Read source of truth (MANDATORY)

Before asking any question, read:
- Project's `CLAUDE.md` (architecture, conventions, scope boundaries)
- Most recent commits (`git log -10 --oneline`) for active context
- Any related existing specs in `docs/specs/`
- `MEMORY.md` if exists

Do NOT skip this — uninformed questions waste user time.

## HARD GATE

Do NOT invoke any implementation skill, write any code, scaffold anything until design is approved AND requirements-spec scores ≥9.

## Decision tree

```
Is this multiple independent subsystems?
├─ YES → flag scope; propose decomposition into sub-projects; brainstorm first sub-project only
└─ NO → continue with single brainstorm

Is the user request clear and small (<3 acceptance criteria, single file area)?
├─ YES → minimal brainstorm (1-2 clarifying questions, design in 1 message)
└─ NO → full brainstorm (multiple questions, multi-section design)
```

## Procedure

1. **Context scan** (Step 0)
2. **Scope check** — multi-subsystem? Decompose first.
3. **Clarifying questions** — one at a time, multiple-choice preferred when applicable. Focus: purpose, constraints, success criteria, edge cases.
4. **Stack-aware question loading** — if `questionnaires/*.yaml` matches detected stack, pull relevant questions.
5. **Propose 2-3 approaches** with tradeoffs and your recommendation.
6. **Present design** in sections scaled to complexity (architecture, components, data flow, error handling, testing). Get approval per section.
7. **Write spec** to `docs/specs/YYYY-MM-DD-<topic>-design.md` with: locked decisions, sections, accepted limitations, out-of-scope list.
8. **Self-review spec** — placeholder scan, internal consistency, scope check, ambiguity check. Fix inline.
9. **Score** — invoke `evolve:confidence-scoring` with artifact-type=requirements-spec; gap remediation if <9.
10. **User review of written spec** — explicit approval required.
11. **Handoff** to `evolve:writing-plans`.

## Output contract

Returns: path to approved spec at `docs/specs/YYYY-MM-DD-<topic>-design.md` with confidence score ≥9 and explicit user approval recorded in conversation.

## Guard rails

- DO NOT: implement, scaffold, write code before design approved
- DO NOT: ask multi-part questions (one at a time)
- DO NOT: assume the user agrees if they say "ok" — get explicit approval per section
- DO NOT: rubber-stamp confidence ≥9; honestly assess each dimension
- ALWAYS: scale design depth to complexity (3 sentences for trivial, 200-300 words for nuanced)
- ALWAYS: decompose multi-subsystem requests before deep-diving any one

## Verification

This skill's correct application is verifiable by:
- A spec file exists at the documented path
- Spec frontmatter contains date and topic
- User approval is quoted in the conversation immediately before transition to writing-plans
- Confidence-scoring result ≥9 is recorded

## Related

- `evolve:requirements-intake` — entry-gate that decides if brainstorming is needed
- `evolve:writing-plans` — the only skill invoked AFTER brainstorming completes
