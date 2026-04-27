---
name: explore-alternatives
namespace: process
description: "Use BEFORE committing to any non-trivial decision (complexity ≥5) to enumerate ≥2 alternatives with tradeoffs and explicit chosen-rationale"
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: plan
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Explore Alternatives

## When to invoke

BEFORE committing to ANY decision with complexity ≥5 (per `evolve:requirements-intake` complexity score). Specifically:
- Library / framework choice
- Pattern adoption (when ≥2 patterns plausibly fit)
- Architecture decision
- Performance optimization approach (always profile-then-explore)
- Bug fix when root cause has ≥2 possible interventions

NOT for: trivial fixes, single-obvious-solution tasks.

This skill bans "first idea wins" thinking. Forces comparison.

## Step 0 — Read source of truth (MANDATORY)

1. Read task context (spec / plan / bug report)
2. Read `evolve:project-memory` for prior decisions in this area
3. Check if existing ADR or pattern already addresses (don't reinvent)

## Decision tree

```
How many alternatives realistic?
├─ 0 (no alternatives possible) → STOP, this skill not needed; document why single path
├─ 1 (only one viable path) → document why others rejected; this skill done
└─ ≥2 → continue with full procedure

Source of alternatives:
├─ Domain knowledge (agent's training)
├─ Project memory (evolve:project-memory)
├─ Research (best-practices-researcher / infra-pattern-researcher / dependency-researcher)
└─ User suggestion
```

## Procedure

1. **Step 0** — context + memory check
2. **Brainstorm alternatives** — minimum 2, ideally 3
3. **For EACH alternative**:
   - **Description** (1-2 sentences what it is)
   - **Pros** (3+ concrete advantages)
   - **Cons** (3+ concrete disadvantages)
   - **Cost** (effort to implement, ongoing maintenance, runtime cost)
   - **Reversibility** (easy to change later? expensive lock-in?)
   - **When-to-use** (which condition makes this best)
4. **Comparison table**:
   ```
   | Criterion | Alt A | Alt B | Alt C |
   |-----------|-------|-------|-------|
   | Effort    | High  | Low   | Med   |
   | Lock-in   | Low   | High  | Med   |
   | Perf      | Best  | OK    | Best  |
   | DX        | OK    | Best  | OK    |
   ```
5. **Recommendation** — explicit choice with rationale citing project context (constraints, prior decisions, team skills)
6. **Score** with `evolve:confidence-scoring` (agent-output ≥9)
7. **If decision is structural** → propose `evolve:adr` to record permanently
8. **If user-facing decision** → seek user approval before implementing

## Output contract

```markdown
## Alternatives Considered: <decision topic>

### Alt A: <name>
- Description: ...
- Pros: 1) ... 2) ... 3) ...
- Cons: 1) ... 2) ... 3) ...
- Cost: ...
- Reversibility: easy | medium | locked-in
- When best: ...

### Alt B: <name>
...

### Alt C: <name>
...

### Comparison
<table>

### Recommendation
**Chose: <Alt X>**
Rationale: <2-3 sentences citing project context>

### Next step
- ADR: <link to docs/adr/NNNN.md if structural>
- OR: continue to writing-plans with chosen alternative
```

## Guard rails

- DO NOT: skip this skill on complexity ≥5 decisions
- DO NOT: present 2 alternatives where one is obviously inferior (straw man)
- DO NOT: choose without explicit rationale citing context
- DO NOT: ignore project memory of prior similar decisions (consistency matters)
- ALWAYS: cite which constraint/context drove the choice
- ALWAYS: document when reversal would be cheap vs expensive

## Verification

- ≥2 alternatives with all required fields
- Comparison table present
- Recommendation has explicit rationale
- Confidence ≥9

## Related

- `evolve:project-memory` — for prior similar decisions
- `evolve:adr` — to record structural decisions
- `evolve:brainstorming` — already includes "propose 2-3 approaches"; this skill is for tactical decisions DURING execution where brainstorming is overkill
- `agents/_core/architect-reviewer` — invokes this skill for architectural decisions
