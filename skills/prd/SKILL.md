---
name: prd
namespace: process
description: "Use BEFORE building any user-facing feature to write a Product Requirements Document framing problem, users, solution, success metrics, and out-of-scope"
allowed-tools: [Read, Grep, Glob, Write, Edit]
phase: brainstorm
prerequisites: []
emits-artifact: requirements-spec
confidence-rubric: confidence-rubrics/requirements.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Product Requirements Document (PRD)

## When to invoke

BEFORE building any user-facing feature with explicit business value. Use when product-manager or systems-analyst agent is involved.

NOT for: internal refactors, infra changes, dev tooling.

## Step 0 — Read source of truth (MANDATORY)

1. Read project's `docs/prd/` for prior PRDs (numbering, format)
2. Read existing user docs / marketing pages (vocabulary, positioning)
3. Read analytics if available (current behavior baseline)
4. Read related specs in `docs/specs/`

## Decision tree

```
Feature scope?
├─ Single user-facing change → lightweight PRD (1 page)
├─ Multi-screen flow → full PRD (2-4 pages) with user journey diagram
└─ New product area → comprehensive PRD with market context, competitive analysis
```

## Procedure

1. **Find next PRD number** in `docs/prd/`
2. **Write PRD** at `docs/prd/NNNN-<feature>.md`:
   ```markdown
   # PRD-NNNN: <Feature Name>

   **Status:** DRAFT | REVIEW | APPROVED | IMPLEMENTED
   **Date:** YYYY-MM-DD
   **Author:** <product-manager>
   **Stakeholders:** <list>

   ## Problem
   <whose problem, when, what's the cost of inaction>

   ## Users
   - Primary persona: <who, JTBD>
   - Secondary personas: <if any>

   ## Solution
   <what we're building, key flows>

   ## Success metrics
   - Quantitative: <metric + target + timeframe>
   - Qualitative: <user feedback signals>

   ## Out-of-scope
   - <explicitly NOT building this>

   ## Risks
   - <risk + mitigation>

   ## Dependencies
   - <other teams / systems / decisions>

   ## Open questions
   - <unresolved items, owner>
   ```
3. **Score** — `evolve:confidence-scoring` artifact-type=requirements-spec
4. **Stakeholder review** — explicit approval before status → APPROVED
5. **Handoff** — to `evolve:brainstorming` (technical design) once APPROVED

## Output contract

Returns: PRD file with all sections filled, success metrics measurable, out-of-scope explicit.

## Guard rails

- DO NOT: write Solution before Problem (avoids solution-in-search-of-problem)
- DO NOT: vague success metrics ("users will love it")
- DO NOT: skip Out-of-scope (causes scope creep)
- DO NOT: gold-plate (single-flow features don't need 5-page PRDs)
- ALWAYS: state who's affected and how
- ALWAYS: include measurable success criteria

## Verification

- PRD file at `docs/prd/NNNN-<feature>.md`
- All required sections present
- Success metrics include target + timeframe
- Stakeholder approval recorded

## Related

- `evolve:brainstorming` — technical design after PRD approved
- Phase 3 `product-manager` agent — primary author
- `evolve:adr` — for technical decisions referenced in Solution
