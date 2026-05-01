# Rule Authoring Guide

Rules are project-level standards. They explain WHY a constraint exists, WHEN it applies, WHAT to do, with examples.

## Quick start

1. Copy template:
   ```bash
   cp templates/rule.md.tpl rules/<your-rule>.md
   ```
2. Fill in placeholders
3. Validate: `npm run validate:frontmatter`
4. Score: `/supervibe-score rule-quality rules/<your-rule>.md` — must be ≥9

## Required frontmatter fields

```yaml
---
name: <slug>                              # required, lowercase + hyphens
description: "<one-line summary>"         # required
applies-to: [<stack> | any]               # required (stack scoping)
mandatory: true | false                   # required (true = enforced via tooling)
version: 1.0
last-verified: 2026-04-27
related-rules: [<rule1>, <rule2>]         # required (≥1, can be [])
---
```

## Required body sections

### `# <Human-Readable Title>`

### `## Why this rule exists`
- Concrete reason (not "best practice for clarity")
- Past incident OR principle motivating it
- "Concrete consequence of NOT following: <specific pain>"

### `## When this rule applies`
- Specific contexts (stacks, file types, scenarios)
- Explicit "This rule does NOT apply when: <X>"

### `## What to do`
- Concrete directives, not platitudes
- Numbered or bulleted

### `## Examples`
- ≥1 BAD example with code block + "Why this is bad: <reason>"
- ≥1 GOOD example with code block + "Why this is good: <reason>"

### `## Enforcement`
- How is this rule enforced? (linter, CI step, settings.json deny, agent skill, code review checklist)
- Without enforcement, rules are wishes

### `## Related rules`
- Cross-links with one-line relationship

### `## See also`
- External references (specs, books, articles)

## Quality bar (rule-quality rubric)

5 dimensions × 2 weight = 10 max:

1. **rationale** — Why section explains motivation (≥2 sentences)
2. **examples-good-bad** — ≥1 good + ≥1 bad example with code
3. **how-to-apply** — When-applies section enumerates contexts
4. **cross-links** — Related rules / See also (≥1 link)
5. **size-and-shape** — ≥200 lines, frontmatter complete

Threshold: ≥9 to ship.

## Mandatory vs advisory rules

### Mandatory (`mandatory: true`)
- Referenced in CLAUDE.md mandatory section
- Enforced via tooling (deny-list, hook, CI)
- Examples: `git-discipline`, `commit-discipline`, `confidence-discipline`, `anti-hallucination`, `no-dead-code`

### Advisory (`mandatory: false`)
- Best practice, recommended
- Code review checks, not blocked at commit
- Examples: `best-practices-2026`, `infrastructure-patterns`, `prototype-to-production`

## Examples to study

- `rules/git-discipline.md` — mandatory rule with deny-list enforcement
- `rules/no-dead-code.md` — mandatory with linter enforcement
- `rules/best-practices-2026.md` — advisory, cross-stack guidance
- `rules/infrastructure-patterns.md` — advisory, decision tables
- `rules/fsd.md` — stack-scoped (`applies-to: [react, nextjs, vue, svelte]`)

## Anti-patterns

- **No "Why"** — readers don't follow rules they don't understand
- **No examples** — rule without example is wish
- **Vague "applies-to"** — "everywhere" ≠ helpful
- **No enforcement** — rules-curator agent flags this
- **Contradicts another rule** — rules-curator agent flags this (use `supervibe:rule-audit`)

## After authoring

1. If `mandatory: true` -> reference it from the selected host instruction file (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, or host rule file)
2. If it introduces a command ban -> add it to the selected host adapter settings file when supported
3. Run `supervibe:rule-audit` to check for contradictions with existing rules
4. Run `npm run registry:build` — rule should appear in `registry.yaml`

## Strengthen pass

`supervibe:strengthen` periodically (or on-demand) deepens rules:
- For stale rules: invokes `best-practices-researcher` for current state
- Adds examples from real project usage
- Updates cross-links as related rules change
