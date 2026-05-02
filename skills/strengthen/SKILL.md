---
name: strengthen
namespace: process
description: "Use WHEN audit flagged weak/stale artifacts to deepen them from project context AND fresh research (consults research-agents for stale best-practices/dependency/security/infra/design). RU: Используется КОГДА audit пометил артефакты слабыми/устаревшими — углубляет их из контекста проекта И свежего ресёрча (best-practices/dependency/security/infra/design). Trigger phrases: 'усиль агента', 'strengthen <agent>', 'докрути артефакт', 'усилить'."
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: exec
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Strengthen

## When to invoke

WHEN `supervibe:audit` flagged weak or stale artifacts, OR user runs `/supervibe-strengthen`. Loops over each flagged artifact.

## Shared Dialogue Contract

Lifecycle: `intake -> plan -> review -> approved -> applied -> verified`. Persist state in `.supervibe/memory/strengthen/state.json` before every lifecycle transition.

Every interactive step asks one question at a time using `Step N/M` or `Шаг N/M`. Each question lists the recommended/default option first, gives a one-line tradeoff summary for every option, allows a free-form answer, and names the stop condition.

Default behavior: produce a dry-run diff and do not edit artifacts until approval. Free-form path: the user can name exact artifacts, agents, rules, or research constraints to include or exclude.

After every material delivery, ask one explicit next-step question about the strengthening diff. Use language-matched, domain-specific labels; keep internal action ids only in saved state.
- Apply strengthening / Применить усиление - recommended when the dry-run artifact diff looks right; apply the selected updates.
- Adjust strengthening diff / Изменить diff усиления - user gives one focused artifact, section, rule or research constraint; rebuild the dry-run diff without writing files.
- Compare another approach / Сравнить другой подход - produce another strengthening approach with explicit tradeoffs.
- Review strengthening deeper / Проверить усиление глубже - run confidence scoring, audit, or specialist review before applying.
- Stop without strengthening / Остановиться без усиления - persist current state and exit without changing artifacts.

## Step 0 — Read source of truth (required)

1. Read MEMORY.md for prior feedback
2. Read selected host adapter rules for project standards
3. Read recent commits for active patterns
4. Read `.supervibe/confidence-log.jsonl` for override patterns
5. Read `.supervibe/memory/effectiveness.jsonl` for agent failure patterns
6. If audit flagged code index health, run `node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --list-missing`, then `node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --resume --source-only --max-files 200 --max-seconds 120 --health --json-progress` for source-readiness repair or `node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --resume --graph --max-files 200 --health` for graph repair, and re-check with `node <resolved-supervibe-plugin-root>/scripts/supervibe-status.mjs --index-health --no-gc-hints`
7. Run or consult `node <resolved-supervibe-plugin-root>/scripts/supervibe-status.mjs --capabilities` before editing agents, rules, commands or skills so every strengthened artifact stays linked to a capability and verification hook.

## Decision tree (researcher consultation)

```
Artifact is stale (last-verified >90d)?
├─ YES:
│   ├─ References "best practices" / current patterns?
│   │   → MUST invoke supervibe:_ops:best-practices-researcher first
│   ├─ References dependencies / library versions?
│   │   → MUST invoke supervibe:_ops:dependency-researcher first
│   ├─ References security patterns / CVEs?
│   │   → MUST invoke supervibe:_ops:security-researcher first
│   ├─ References infrastructure topology?
│   │   → MUST invoke supervibe:_ops:infra-pattern-researcher first
│   ├─ References competitive design / UX patterns?
│   │   → MUST invoke supervibe:_ops:competitive-design-researcher first
│   └─ Otherwise → strengthen from project context only
└─ NO (just weak, not stale): strengthen from project context only
```

## Procedure

1. For each weak/stale artifact:
   a. Apply researcher decision tree
   b. Deepen Persona (concrete priorities, mental model)
   c. Add real paths (grep-verified from current project)
   d. Expand anti-patterns from feedback
   e. Add concrete verification commands
   f. Add decision trees for non-trivial branches
   g. Bump `version` (1.0 → 1.1)
   h. Update `last-verified` to today
   i. Update `verified-against` (current commit hash)
   j. If researcher consulted: cite source in artifact footer
2. For code-index health findings:
   a. Repair partial source coverage with `node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --resume --source-only --max-files 200 --max-seconds 120 --health --json-progress`; use `--force --health` only for a deliberate full rebuild
   b. Confirm `SUPERVIBE_INDEX_GATE READY: true`
   c. If generated leakage or stale rows remain, inspect `--explain-policy` before editing source rules
3. Score each strengthened artifact with confidence-scoring (≥9 required)
4. Re-run capability registry validation when an artifact link changes and fix missing command, agent, skill, rule or verification references before presenting the diff.
5. Show diff to user; await approval
6. NEVER delete content — only add/deepen

## Output contract

Returns:
- List of strengthened artifacts (paths)
- Per-artifact diff
- Per-artifact new score
- Researcher citations footer (if applicable)

## Guard rails

- DO NOT: delete existing content
- DO NOT: skip researcher consultation for stale
- DO NOT: bump version without actual changes
- ALWAYS: grep-verify any path/function/command added
- ALWAYS: cite researcher findings if consulted

## Related

- `supervibe:audit` — produces input list
- `agents/_ops/*-researcher` — consulted for stale artifacts
