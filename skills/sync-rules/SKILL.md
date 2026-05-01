---
name: sync-rules
namespace: process
description: "Use WHEN rules-curator updated rule in one project to propagate change to other projects of same stack (opt-in, with diff confirm). RU: Используется КОГДА rules-curator обновил правило в одном проекте — распространяет изменение на другие проекты того же стека (opt-in, с подтверждением diff). Trigger phrases: 'синхронизируй правила', 'rules sync', 'разнеси правило', 'sync rules'."
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: exec
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-04-27
---

# Sync Rules

## When to invoke

WHEN `rules-curator` updated a rule in one project AND multi-project sync is configured (opt-in via `.supervibe/sync-config.yaml`).

## Step 0 — Read source of truth (required)

1. Read `.supervibe/sync-config.yaml` for sibling project paths
2. Read updated rule file
3. Read sibling projects' versions of same rule (diff source)

## Procedure

1. Identify changed rule
2. For each sibling project (per sync-config):
   a. Read sibling's version of the rule
   b. Compute diff
   c. If sibling has divergent customization → ASK user (merge / skip / overwrite)
   d. If clean → propose patch
3. Show user the planned changes per sibling
4. User confirms each
5. Apply confirmed changes
6. Each sibling's rules-curator validates the patched rule (rule-quality ≥9)

## Output contract

Returns:
- Per-sibling: change applied / skipped / customized
- Audit log entry per sync

## Guard rails

- DO NOT: auto-apply without user confirm per sibling
- DO NOT: overwrite divergent customization (merge requires explicit user choice)
- ALWAYS: validate rule-quality after sync

## Related

- `agents/_meta/rules-curator` — triggers this
- `supervibe:rule-audit` — verifies each sibling's rules post-sync
