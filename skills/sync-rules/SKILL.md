---
name: sync-rules
namespace: process
description: 'Use WHEN rules-curator updated rule in one project to propagate change to other projects of same stack (opt-in, with diff confirm). Triggers: ''синхронизируй правила'', ''rules sync'', ''разнеси правило'', ''sync rules''.'
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Edit
phase: exec
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-04-27T00:00:00.000Z
---

# Sync Rules

## Overview

Sync Rules provides a reusable Supervibe operating method for Use WHEN rules-curator updated rule in one project to propagate change to other projects of same stack (opt-in, with diff confirm). Triggers: 'синхронизируй правила', 'rules sync', 'разнеси правило', 'sync rules'.
It keeps the work evidence-first, scope-bounded, confidence-scored, and verified before completion claims.
## When to Use

WHEN `rules-curator` updated a rule in one project AND multi-project sync is configured (opt-in via `.supervibe/sync-config.yaml`).

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 — Read source of truth (required)

1. Read `.supervibe/sync-config.yaml` for sibling project paths
2. Read updated rule file
3. Read sibling projects' versions of same rule (diff source)

## Decision tree

```
No opt-in sync config exists
  -> STOP and report that no sibling project is authorized.

Target rule is identical except for the source update
  -> Propose a clean apply patch in dry-run output.

Target rule has local customization
  -> Ask whether to merge, skip, or send to manual curator review.

Target project lacks the rule or uses a different host adapter
  -> Ask whether this stack should receive a translated host-neutral rule.

Target has a newer version or mandatory enforcement differs
  -> STOP and require manual rule-audit before sync.
```

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

## When not to use

- Do not use this skill to bypass the command or workflow that owns durable artifacts.
- Do not use it when source evidence, RAG/CodeGraph, or required verification is missing.
- Do not use it to replace a specialist producer, worker, or reviewer that must issue runtime evidence.

## Common rationalizations

- "This is small, so no source check is needed" - reject when the skill changes code, config, or durable artifacts.
- "The user asked for speed, so skip receipts" - reject when durable work, delegation, or review is claimed.
- "Existing prose is enough evidence" - reject when validators or command output are required.

## Red flags

- A durable artifact changes without a command, receipt, or verification path.
- The skill is used outside its phase without an explicit handoff.
- Claims of completion appear before evidence and confidence scoring.

## Checklist

- Source of truth read.
- Scope and owner confirmed.
- RAG/CodeGraph/memory requirement decided.
- Evidence artifact or command recorded.
- Stop condition and next handoff clear.

## Failure modes

- Inline emulation replaces a required producer or reviewer.
- Broad use of the skill slows delivery without improving evidence.
- Missing verification lets stale assumptions pass as production-ready.

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
