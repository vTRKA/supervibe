---
name: evaluate
namespace: process
description: "Use AFTER each agent task completion to track effectiveness (outcome, iterations, blockers, confidence-score, user-corrections) into effectiveness.jsonl. RU: Используется ПОСЛЕ завершения задачи агента — фиксирует эффективность (исход, итерации, блокеры, confidence, правки пользователя) в effectiveness.jsonl. Trigger phrases: 'оцени артефакт', 'log outcome', 'запиши результат', 'evaluate'."
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: review
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: false
version: 1.0
last-verified: 2026-04-27
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
