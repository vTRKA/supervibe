---
name: rule-audit
namespace: process
description: "Use WHEN rules-curator needs to detect contradictions/redundancy/gaps across host adapter rules OR after sync-rules. RU: Используется КОГДА rules-curator должен найти противоречия/избыточность/пробелы среди правил host adapter ИЛИ после sync-rules. Trigger phrases: 'аудит правил', 'rules check', 'проверь правила', 'rule audit'."
allowed-tools: [Read, Grep, Glob, Bash]
phase: review
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Rule Audit

## When to invoke

- After adding/modifying any rule
- After `supervibe:sync-rules` completes
- Periodic (every 90 days as part of `supervibe:audit`)

## Step 0 — Read source of truth (required)

1. Read all selected host adapter rule files, e.g. `.codex/rules/*.md` in Codex or `selected host rules files` in Claude Code
2. Read MEMORY.md for prior incidents
3. Read the active host instruction file for mandatory rule references

## Procedure

1. **Contradictions**: grep across rules for conflicting directives (e.g., "always X" vs "never X" for similar context)
2. **Redundancy**: detect rules saying same thing differently
3. **Gaps**: known anti-patterns from MEMORY.md not covered by any rule
4. **Mandatory consistency**: every rule with `mandatory: true` referenced in the active host instruction file
5. **Settings.json deny consistency**: every "ban" rule has corresponding deny entry
6. **Cross-link integrity**: every `related-rules` reference exists
7. Output ranked findings (CRITICAL contradictions → MAJOR redundancy → MINOR gap)
8. Score with confidence-scoring

## Output contract

Returns:
- Findings table per category
- Recommended remediation per finding (merge / split / extract / link / add)

## Guard rails

- DO NOT: auto-merge or auto-split (suggest only)
- DO NOT: flag false positives (every contradiction has actual conflict)
- ALWAYS: cite specific rule:section per finding

## Related

- `agents/_meta/rules-curator` — primary user
- `supervibe:audit` — periodic invocation
