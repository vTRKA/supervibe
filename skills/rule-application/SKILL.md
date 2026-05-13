---
name: rule-application
namespace: process
description: "Use WHEN validating, applying, or dry-running Supervibe project rules against a codebase or host artifact set TO prove the rules load, match intended files, produce actionable findings, and do not generate broad false positives."
allowed-tools: [Read, Grep, Glob, Bash]
phase: review
prerequisites: [ruleset]
emits-artifact: rule-application-report
confidence-rubric: confidence-rubrics/rule-quality.yaml
gate-on-exit: true
version: 1.1
last-verified: 2026-05-02
---

# Rule Application

Dry-run a Supervibe ruleset against a project and report whether the rules are
loadable, scoped, and useful. This skill is read-only unless the user explicitly
asks to update rules after the report.

## When to invoke

Use when validating, applying, or dry-running Supervibe project rules against a
codebase or host artifact set. Prefer this before claiming a rule is useful,
safe, missing, stale, overbroad, or ready for host adaptation.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 - Read Source Of Truth

1. Read the target rules from `rules/` or the selected host adapter rules
   folder.
2. Read `registry.yaml` when available to confirm each rule id, file path,
   `applies-to`, `mandatory`, `version`, and `last-verified`.
3. Read the project stack fingerprint or manifest files so rule scope is judged
   against the actual project, not generic expectations.
4. Read prior rule/audit findings if `.supervibe/memory/` exists.

## Decision Tree

```
What is being checked?
|- New or changed rule -> validate frontmatter, examples, scope, and dry-run hits
|- Existing project rules -> detect stale, duplicate, missing, or overbroad rules
|- Host adaptation -> compare upstream rules to selected host adapter copies
|- False-positive review -> isolate the smallest rule text causing noisy matches
```

## Procedure

1. Build the candidate ruleset from the selected scope.
2. Verify each rule has frontmatter with `name`, `description`, `applies-to`,
   `mandatory`, `version`, and `last-verified` when this project expects them.
3. For each rule, identify intended target files from `applies-to`, stack tags,
   and path globs.
4. Use grep/search over representative target files to estimate hit behavior.
5. Classify each rule:
   - `active`: applicable and produces useful guidance.
   - `silent`: applicable but no evidence it can affect this project.
   - `overbroad`: likely to match unrelated work or cause noisy advice.
   - `missing`: expected from stack/profile but absent.
   - `stale`: references paths, tooling, or agents no longer present.
6. Report only actionable findings. Avoid restating every passing rule.
7. If changes are needed, produce a dry-run plan first and require approval
   before editing rules.

## Output Contract

```
RULE_APPLICATION_REPORT
Rules checked: <count>
Target scope: <paths or stack tags>
Confidence: <N>/10

Findings:
- <severity> <rule-id> - <issue>
  Evidence: <file:line, grep result, or registry path>
  Action: <keep | update | add | defer | retire>
```

## Guard Rails

- Do not apply rules to user-owned host instruction text outside managed blocks.
- Do not mark a rule useful without evidence from project files or registry data.
- Do not delete or retire rules automatically.
- Do not add broad mandatory rules for niche project concerns.
- Do not hide missing rules; missing expected rules are explicit findings.

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

## Verification

- Confirm every emitted artifact exists and matches the Output contract.
- Run the validator, test, dry-run, or audit command named by this skill when one exists.
- Include concrete command/output evidence before claiming the skill completed successfully.
- If verification cannot run, state the blocker and keep confidence below the passing gate.

## Related

- `agents/_meta/rules-curator` - owns rule creation and maintenance.
- `supervibe:adapt` - uses rule application during project-fit updates.
- `supervibe:rule-audit` - audits contradictions, redundancy, and gaps.
- `supervibe:verification` - provides evidence discipline for final claims.
