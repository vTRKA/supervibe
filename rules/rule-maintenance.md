---
name: rule-maintenance
description: "Defines lifecycle of rules in .claude/rules/: when to add, when to retire, how rules-curator agent maintains them. RU: Правила пересматриваются раз в квартал; last-verified держится свежим; rules-curator поддерживает lifecycle. Trigger phrases: 'rules audit', 'аудит правил', 'rule maintenance'."
applies-to: [any]
mandatory: true
version: 1.0
last-verified: 2026-04-27
related-rules: [confidence-discipline, anti-hallucination]
---

# Rule Maintenance

## Why this rule exists

Rules accumulate. Without curation, they become contradictory, outdated, or forgotten. The `rules-curator` agent prevents rule rot — but only if invoked.

Concrete consequence of NOT following: contradictory rules ("always commit per task" vs "batch commits weekly"); stale rules referencing tools no longer used; rule violations going unflagged.

## When this rule applies

- Adding a new rule
- Modifying an existing rule
- Retiring a rule
- Periodic audit (every 90 days)

## What to do

### Adding a new rule

1. Use template `templates/rule.md.tpl`
2. Fill ALL sections (Why / When / What / Examples / Enforcement / Related)
3. `rule-quality.yaml` rubric ≥9
4. If `mandatory: true`, reference in `CLAUDE.md` mandatory section
5. If introduces ban, add to `.claude/settings.json` deny-list
6. Cross-link from related rules
7. `supervibe:sync-rules` if multi-project setup

### Modifying

- Bump `version` (1.0 → 1.1 for content; 2.0 for breaking change)
- Update `last-verified` to today
- Document change in commit message body

### Retiring

- Don't delete (history matters)
- Set `applies-to: [retired]`
- Add `retired-on: YYYY-MM-DD` field
- Add `retirement-reason` field
- Move to `.claude/rules/_archive/` if many retired rules accumulate

### Periodic audit (every 90 days)

`supervibe:audit` flags:
- Rules with `last-verified` >90d → require re-verify
- Rules referenced in code that don't exist (broken)
- Code violating mandatory rules (Grep evidence)

`supervibe:strengthen` consults `best-practices-researcher` for stale `best-practices-*` rules; updates content + sources.

## Examples

### Bad

```
# adding rule
Adds rule "no foo without bar" with one bad example, no good example, no enforcement section.
```

Why this is bad: incomplete; rule-curator agent rejects.

### Good

```
# adding rule
Uses template. Fills:
- Why: cites past incident X
- When: scopes to backend code only
- What: 4 concrete directives
- Examples: bad + good with code
- Enforcement: pre-commit hook + code review checklist
- Related: links 2 related rules
- rule-quality.yaml score: 10/10
```

Why this is good: complete, scored, enforced.

## Enforcement

- `rules-curator` agent owns this rule's enforcement
- `supervibe:rule-audit` skill detects contradictions / staleness
- `validate-frontmatter.mjs` enforces required fields
- Code review checks rule additions against `rule-quality.yaml`

## Related rules

- `confidence-discipline` — rules are scored too
- `anti-hallucination` — every rule example must be grep-verifiable

## See also

- `agents/_meta/rules-curator.md`
- `skills/rule-audit/SKILL.md` (Phase 6)
- `confidence-rubrics/rule-quality.yaml`
