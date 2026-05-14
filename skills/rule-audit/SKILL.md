---
name: rule-audit
namespace: process
description: 'Use WHEN rules-curator needs to detect contradictions/redundancy/gaps across host adapter rules OR after sync-rules. Triggers: ''аудит правил'', ''rules check'', ''проверь правила'', ''rule audit''.'
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: review
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1
last-verified: 2026-04-27T00:00:00.000Z
---

# Rule Audit

## Overview

Rule Audit provides a reusable Supervibe operating method for Use WHEN rules-curator needs to detect contradictions/redundancy/gaps across host adapter rules OR after sync-rules. Triggers: 'аудит правил', 'rules check', 'проверь правила', 'rule audit'.
It keeps the work evidence-first, scope-bounded, confidence-scored, and verified before completion claims.
## When to Use

- After adding/modifying any rule
- After `supervibe:sync-rules` completes
- Periodic (every 90 days as part of `supervibe:audit`)

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 — Read source of truth (required)

1. Read all selected host adapter rule files, e.g. `.codex/rules/*.md` in Codex or `selected host rules files` in Claude Code
2. Read MEMORY.md for prior incidents
3. Read the active host instruction file for mandatory rule references

## Decision tree

```
Two rules require incompatible behavior in the same context
  -> CRITICAL contradiction; recommend one canonical rule or an explicit precedence note.

Rules repeat the same broad section or checklist
  -> Run validate:rule-content-quality and recommend linking to the canonical rule instead of copying filler.

Mandatory rule lacks rationale, scope, examples, enforcement, or related rules
  -> MAJOR content gap; route to rules-curator with the missing section list.

Rule references a deleted path, old command, or old host surface
  -> STALE reference; route to supervibe:adapt or a narrow rule update.

Fix would delete, merge, or change mandatory enforcement
  -> Require explicit approval before mutation.
```

## Procedure

1. **Contradictions**: grep across rules for conflicting directives (e.g., "always X" vs "never X" for similar context)
2. **Redundancy**: detect rules saying same thing differently
3. **Gaps**: known anti-patterns from MEMORY.md not covered by any rule
4. **Mandatory consistency**: every rule with `mandatory: true` referenced in the active host instruction file
5. **Settings.json deny consistency**: every "ban" rule has corresponding deny entry
6. **Cross-link integrity**: every `related-rules` reference exists
7. Output ranked findings (CRITICAL contradictions → MAJOR redundancy → MINOR gap)
8. Score with confidence-scoring

## Audit dimensions

| Dimension | What to inspect | Evidence |
|-----------|-----------------|----------|
| Contradiction | Two rules require incompatible behavior for the same context | rule path, heading, quoted short phrase |
| Redundancy | Rules repeat the same requirement with different wording | canonical rule candidate |
| Coverage gap | Known incident or anti-pattern lacks a rule | memory entry or incident id |
| Host drift | Host instruction file omits mandatory rule | host file path and missing rule |
| Deny mismatch | Rule bans an action but settings do not enforce it | rule path and settings path |
| Link integrity | `related-rules` points nowhere | missing rule id |
| Severity mismatch | rule severity does not match risk | proposed severity and rationale |
| Staleness | rule references deleted paths, old commands, or old host names | grep evidence |

## Finding format

Each finding must include:
- severity: `CRITICAL`, `MAJOR`, or `MINOR`;
- category: contradiction, redundancy, gap, drift, deny-mismatch, link, severity, stale;
- affected files;
- direct evidence;
- recommended remediation;
- whether the remediation is safe to automate.

## Safety policy

This skill audits and recommends. It does not merge, delete, or rewrite rules by default.
Escalate to `rules-curator` for edits and require explicit approval before:
- deleting a rule,
- merging two rules,
- propagating through `sync-rules`,
- changing a mandatory rule,
- changing deny settings.

## Verification

- All selected rule files were read.
- Active host instruction file was checked for mandatory references.
- `related-rules` were resolved.
- Findings cite concrete files and sections.
- False-positive risk is stated when wording is similar but not contradictory.
- Recommended follow-up owner is named.
- Audit scope and skipped files are stated.
- Confidence score reflects evidence quality.
- Remediation risk is stated.
- Re-audit command is named.

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
- Findings table per category
- Recommended remediation per finding (merge / split / extract / link / add)

## Guard rails

- DO NOT: auto-merge or auto-split (suggest only)
- DO NOT: flag false positives (every contradiction has actual conflict)
- ALWAYS: cite specific rule:section per finding

## Related

- `agents/_meta/rules-curator` — primary user
- `supervibe:audit` — periodic invocation
