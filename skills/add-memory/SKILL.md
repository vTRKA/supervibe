---
name: add-memory
namespace: process
description: "Use AFTER completing significant work (feature shipped, bug fixed, decision made, incident resolved) to add a memory entry capturing the learning for future agents. RU: Используется ПОСЛЕ завершения значимой работы (релиз фичи, фикс бага, принятое решение, разбор инцидента) — сохраняет запись в память для будущих агентов. Trigger phrases: 'добавь в память', 'save decision', 'сохрани решение', 'запиши learning'."
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: review
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/memory-entry.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Add Memory

## When to invoke

AFTER:
- Non-trivial decision made (architecture choice, library choice, pattern adoption) → `decisions/`
- Reusable pattern established (extracted/refactored to standard form) → `patterns/`
- Incident resolved (with postmortem) → `incidents/`
- Cross-cutting learning emerged (gotcha, surprise, team agreement) → `learnings/`
- Tricky problem solved with non-obvious approach → `solutions/`

NOT for: routine commits, doc edits, trivial bug fixes.

## Step 0 — Read source of truth (MANDATORY)

1. Read existing entries in target category to avoid duplication
2. Read project's `.claude/memory/index.json` for tag conventions (use existing tags where possible)
3. Read `confidence-rubrics/memory-entry.yaml` for quality bar

## Decision tree

```
Category selection:
├─ "Why we chose X over Y" → decisions/
├─ "How we always do Z" → patterns/
├─ "What broke and how we fixed" → incidents/
├─ "Surprising thing about project/stack" → learnings/
└─ "Specific problem + specific solution" → solutions/

Confidence self-assessment:
├─ Verified through testing + review → 9-10
├─ Worked but not deeply tested → 7-8
├─ Hypothetical / one-off → ≤6 (don't add to memory)
```

## Procedure

1. **Step 0** — read existing entries
2. **Choose category** (decision tree)
3. **Generate slug** from topic (kebab-case, ≤50 chars)
4. **Create file** at `.claude/memory/<category>/[<date>-]<slug>.md` (date prefix for time-sensitive types)
5. **Fill frontmatter**:
   ```yaml
   ---
   id: <slug>
   type: <category-singular>
   date: YYYY-MM-DD
   tags: [<3-7 tags from project vocabulary>]
   related: [<other entry IDs if applicable>]
   agent: <which agent or "user">
   confidence: <0-10 self-score>
   ---
   ```
6. **Write body** with mandatory sections:
   - **Context** (what situation led to this)
   - **What** (the decision/pattern/incident/learning/solution)
   - **Why** (rationale)
   - **How to apply** (concrete usage / when to invoke this knowledge)
   - **References** (links to specs, ADRs, code, PRs)
7. **Score** with `evolve:confidence-scoring` (memory-entry rubric ≥9 required)
8. **Trigger `scripts/build-memory-index.mjs`** to update `index.json`
9. **Cross-link** — update `related:` in any related entries (bidirectional)

## Output contract

Returns:
- Path to created memory file
- Index updated confirmation
- Cross-links updated count
- Confidence score

## Guard rails

- DO NOT: add memory for trivial things (lowers signal-to-noise)
- DO NOT: duplicate existing entries — search first via `evolve:project-memory`
- DO NOT: use ad-hoc tags — reuse project vocabulary (read index.json tags)
- DO NOT: add memory with confidence <9 (hallucination/noise risk)
- ALWAYS: add memory at end of significant tasks (otherwise lost)
- ALWAYS: rebuild index after add

## Verification

- File exists at expected path
- Frontmatter complete and valid
- Memory-entry rubric score ≥9
- Index regenerated

## Related

- `evolve:project-memory` — search/read companion
- `agents/_meta/memory-curator` — maintains hygiene
- `evolve:_core:quality-gate-reviewer` — invokes this at end of significant tasks
