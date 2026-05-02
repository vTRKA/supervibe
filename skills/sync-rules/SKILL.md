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

## Diff decision tree

```
Sibling rule is identical except source change applies cleanly
  -> propose apply

Sibling rule has local customization
  -> ask user: merge, skip, or open manual review

Sibling lacks the rule
  -> ask user whether this stack should receive the rule

Sibling has a newer version
  -> stop and require manual curator review

Sibling host adapter differs
  -> translate wording only after host-specific rule audit
```

## Safety policy

- Default mode is dry-run.
- Every target project is opt-in through `.supervibe/sync-config.yaml`.
- Show diff per target before writing.
- Never overwrite local customization without explicit user choice.
- Never sync secrets, generated state, or project-specific paths blindly.
- Preserve host-neutral wording unless the target rule is adapter-specific.

## Audit log

For each target write, record:
- source project;
- target project;
- rule id;
- old version;
- new version;
- decision: applied, skipped, merged, blocked;
- user confirmation;
- validation command and result.

## Verification

- Sync config was read.
- Source and target rule versions were compared.
- Dry-run diff was shown.
- User confirmed each write.
- `supervibe:rule-audit` or equivalent validation ran after changes.
- Divergent local customization was preserved unless explicitly merged.
- Audit log entry was produced for every target.
- Rollback note is included for applied patches.

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
