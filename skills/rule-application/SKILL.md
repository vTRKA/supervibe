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
version: 1.0
last-verified: 2026-05-01
---

# Rule Application

Dry-run a Supervibe ruleset against a project and report whether the rules are
loadable, scoped, and useful. This skill is read-only unless the user explicitly
asks to update rules after the report.

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

## Related

- `agents/_meta/rules-curator` - owns rule creation and maintenance.
- `supervibe:adapt` - uses rule application during project-fit updates.
- `supervibe:rule-audit` - audits contradictions, redundancy, and gaps.
- `supervibe:verification` - provides evidence discipline for final claims.
