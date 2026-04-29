---
name: audit
namespace: process
description: "Use WHEN session starts in existing project OR WHEN agent reports stale-context to health-check artifacts: stale references, coverage gaps, weak artifacts, agent-freshness, override-rate, effectiveness signals. RU: Используется КОГДА начинается сессия в существующем проекте ИЛИ агент сигнализирует устаревший контекст — health-check артефактов: устаревшие ссылки, пробелы покрытия, слабые артефакты, override-rate, эффективность. Trigger phrases: 'health check', 'audit плагина', 'stale agents', 'аудит проекта'."
allowed-tools: [Read, Grep, Glob, Bash]
phase: review
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Audit

## When to invoke

- AT SESSION START if `last-verified` of any artifact >30 days
- After ≥10 files changed in session
- Agent reports `stale-context` blocker
- User runs `/supervibe-audit`

## Step 0 — Read source of truth (required)

1. Read `registry.yaml` for current artifact list
2. Read `.claude/effectiveness.jsonl` (if exists)
3. Read `.claude/confidence-log.jsonl` (if exists)
4. Read recent commits for context

## Procedure

1. **Stale references** — for each artifact, grep paths/funcs/cmds it mentions; flag MISSING
2. **Coverage gaps** — Glob source dirs vs registry; flag uncovered modules
3. **Weak artifacts** — agents <250 lines, skills <80 lines, rules <200 lines, missing Persona/Step 0/decision-tree
4. **Agent-freshness** — every agent's `last-verified` >90d → STALE
5. **Rule-freshness** — every rule's `last-verified` >90d → STALE
6. **Override-rate** — compute over last 100 entries; >5% → flag systemic
7. **Effectiveness signals** — agents with `failed/partial` outcome 2+ times → flag
8. Output structured health report
9. Recommend: `/supervibe-strengthen` for weak, `/supervibe-adapt` for stale refs, `/supervibe-score --record` for effectiveness

## Output contract

```markdown
## Health Report
### Stale References (N)
- ...
### Coverage Gaps (N)
- ...
### Weak Artifacts (N)
- ...
### Stale Verifications (N)
- ...
### Override Rate
- X% over last N (threshold: 5%)
### Effectiveness Concerns (N)
- ...
### Recommended Actions
- /supervibe-strengthen
- /supervibe-adapt
```

## Guard rails

- DO NOT: auto-execute remediation (suggest only; user runs)
- DO NOT: flag false positives (verify each finding has evidence)
- ALWAYS: emit reproducible report (same inputs = same report)

## Related

- `supervibe:strengthen` — fix weak
- `supervibe:adapt` — fix stale references
- `supervibe:evaluate` — track effectiveness
