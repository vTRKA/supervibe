---
name: evaluate
namespace: process
description: >-
  Use AFTER each agent task completion to track effectiveness (outcome,
  iterations, blockers, confidence-score, user-corrections) into
  effectiveness.jsonl. Triggers: 'оцени артефакт', 'log outcome', 'запиши
  результат', 'evaluate'.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
phase: review
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: false
version: 1
last-verified: 2026-04-27T00:00:00.000Z
---

# Evaluate

## When to invoke

- After agent claims task complete
- After user corrects agent output (signal of partial success)
- User runs `/supervibe-score --record`

## Step 0 — Read source of truth (required)

1. Read `.supervibe/memory/effectiveness.jsonl` for prior entries
2. Read agent's `effectiveness:` frontmatter section
3. Read recent confidence-log entries

## Procedure

1. Determine outcome:
   - `success` — task complete, no corrections, score ≥9
   - `partial` — task complete with corrections OR score 7-8
   - `failed` — task abandoned OR score <7
2. Identify blockers if any:
   - `none` / `stale-context` / `missing-skill` / `wrong-approach` / `user-correction`
3. Append entry to `.supervibe/memory/effectiveness.jsonl`:
   ```json
   {"ts":"<ISO>","agent":"<id>","task":"<text>","outcome":"...","iterations":N,"blockers":[...],"confidence":N,"user-corrections":N}
   ```
4. Update agent's frontmatter `effectiveness:` block with most recent
5. **Pattern detection**:
   - 2+ failed with `stale-context` → suggest `/supervibe-audit`
   - 2+ failed with `missing-skill` → suggest `/supervibe-strengthen`
   - 2+ failed with `wrong-approach` → flag for Persona review
6. Output: log entry + pattern detection

## Decision tree

```
Was the task verified with command output?
  yes -> success is possible if confidence >=9 and user made no correction
  no  -> classify as partial unless the task was explicitly read-only/advisory

Did the user correct the agent?
  yes -> record user-correction and classify success only if correction was optional polish
  no  -> continue

Did the agent skip required memory/RAG/codegraph?
  yes -> blocker includes stale-context or missing-context
  no  -> continue

Did the final output omit confidence footer?
  yes -> blocker includes missing-confidence-footer
  no  -> continue
```

## Effectiveness schema

Each JSONL row must include:
- `ts`: ISO timestamp.
- `agent`: stable agent id or skill id.
- `task`: short task summary.
- `outcome`: `success`, `partial`, or `failed`.
- `iterations`: count of meaningful correction loops.
- `blockers`: array of normalized blocker tags.
- `confidence`: numeric confidence or null.
- `userCorrections`: count of user corrections.
- `verification`: command names or `read-only`.
- `notes`: short explanation when outcome is not success.

## Blocker taxonomy

- `stale-context`: memory, RAG, graph, or docs were stale.
- `missing-skill`: correct skill was absent or not invoked.
- `wrong-approach`: agent chose an approach that did not fit the task.
- `missing-verification`: agent claimed done without evidence.
- `missing-artifact`: required spec, plan, diff, screenshot, or test output was absent.
- `user-correction`: user corrected scope, quality, or behavior.
- `tool-failure`: tool or environment prevented completion.
- `scope-creep`: agent expanded task without explicit approval.

## Verification

- `.supervibe/memory/effectiveness.jsonl` exists or is created append-only.
- New row is valid JSON.
- Agent frontmatter was updated only for the targeted agent.
- Prior JSONL rows are unchanged.
- Pattern detection ran after the append.

## Output contract

Returns:
- effectiveness.jsonl entry written
- Agent frontmatter updated
- Pattern detection (if any)
- Recommended action (if any)

## Guard rails

- DO NOT: edit prior entries (append-only)
- DO NOT: classify as success without confidence ≥9
- ALWAYS: include user-corrections count
- ALWAYS: pattern-check after write

## Related

- `supervibe:audit` — consumes effectiveness data
- `supervibe:strengthen` — consumes failure patterns
