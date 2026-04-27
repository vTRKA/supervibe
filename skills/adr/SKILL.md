---
name: adr
namespace: process
description: "Use WHEN making a non-trivial architectural decision (technology choice, pattern adoption, structural change) BEFORE implementation to record context, decision, consequences, alternatives"
allowed-tools: [Read, Grep, Glob, Write, Edit, Bash]
phase: plan
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Architecture Decision Record (ADR)

## When to invoke

WHEN about to make a decision that:
- Picks one technology over alternatives (e.g., Postgres vs MongoDB)
- Adopts a pattern that constrains future code (e.g., FSD, hexagonal)
- Changes a system boundary (e.g., split service, merge modules)
- Reverses or amends a previous ADR

NOT for: tactical code changes, bug fixes, routine refactors.

## Step 0 — Read source of truth (MANDATORY)

1. List existing ADRs in `docs/adr/` to find the next number
2. Read related code to ground the decision in current state
3. Read related rules in `.claude/rules/` for constraints
4. Find latest ADR template version

## Decision tree

```
What status?
├─ Proposed (still discussing) → write as PROPOSED
├─ Accepted (decision made, implementing) → write as ACCEPTED
├─ Superseded (replaced by newer ADR) → mark old as SUPERSEDED, link to new
└─ Deprecated (no longer relevant) → mark as DEPRECATED, keep for history
```

## Procedure

1. **Find next number**: `ls docs/adr/ | sort | tail -1` → increment
2. **Create file**: `docs/adr/NNNN-<short-title>.md`
3. **Fill template**:
   ```markdown
   # ADR-NNNN: <Title>

   **Status:** PROPOSED | ACCEPTED | SUPERSEDED | DEPRECATED
   **Date:** YYYY-MM-DD
   **Deciders:** <names/roles>

   ## Context
   <2-4 paragraphs: what's the situation, what forces are at play, what triggered this decision>

   ## Decision
   <1-2 paragraphs: what we decided>

   ## Consequences
   ### Positive
   - <consequence 1>
   ### Negative / Tradeoffs
   - <consequence 1>
   ### Neutral
   - <consequence 1>

   ## Alternatives Considered
   ### <Alt 1>
   - Why rejected: ...
   ### <Alt 2>
   - Why rejected: ...

   ## Related
   - ADR-NNNN: ...
   - Spec: docs/specs/...
   ```
4. **Score** — `evolve:confidence-scoring` artifact-type=agent-output
5. **Cross-link** — update related ADRs / rules / CLAUDE.md
6. **User approval** — explicit before transitioning status to ACCEPTED

## Output contract

Returns: ADR file path with all sections filled, status declared, alternatives documented.

## Guard rails

- DO NOT: write Decision before Context (forces backwards justification)
- DO NOT: skip Alternatives Considered (the value of an ADR is comparing options)
- DO NOT: amend an ACCEPTED ADR — supersede with new ADR instead
- DO NOT: invent ADRs for trivial decisions
- ALWAYS: number sequentially, never reuse numbers
- ALWAYS: link related ADRs

## Verification

- ADR file exists at `docs/adr/NNNN-<title>.md`
- All sections present
- Status field set
- Cross-links updated

## Related

- `evolve:brainstorming` — may produce an ADR as part of design
- `evolve:writing-plans` — may reference ADR as design rationale
- `evolve:strengthen` (Phase 6) — strengthens stale ADRs via researcher consultation
