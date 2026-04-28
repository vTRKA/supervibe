# Skill Authoring Guide

Skills are methodology — they describe HOW to do something. Agents USE skills; multiple agents can attach the same skill.

## Quick start

1. Copy template:
   ```bash
   mkdir -p skills/<your-skill>
   cp templates/skill.md.tpl skills/<your-skill>/SKILL.md
   ```
2. Fill in placeholders
3. Validate: `npm run validate:frontmatter && npm run lint:descriptions`
4. Score: `/supervibe-score skill-quality skills/<your-skill>/SKILL.md` — must be ≥9

## Required frontmatter fields

```yaml
---
name: <slug>                              # required, lowercase + hyphens
namespace: process                        # required (process | capability | evolution)
description: "Use WHEN <trigger> TO <verb-led purpose> GATES <scoring>"  # MUST match trigger-clarity regex
allowed-tools: [Read, Grep, Bash, ...]    # required, scoped down where possible
phase: brainstorm | plan | exec | review  # required
prerequisites: []                          # other artifacts required first
emits-artifact: <type>                    # what this skill produces
confidence-rubric: confidence-rubrics/<name>.yaml  # which rubric to score against
gate-on-exit: true                        # MUST invoke confidence-scoring before exit
version: 1.0
last-verified: 2026-04-27
---
```

## Required body sections

### `# <Skill Name>`

### `## When to invoke`
Concrete trigger conditions. NOT vague "when needed" — specific user phrases or system events.

### `## Step 0 — Read source of truth (MANDATORY)`
Before doing ANYTHING, read:
- Project's CLAUDE.md
- Related artifacts
- Relevant data sources

Without Step 0 you act on assumption — that's hallucination risk.

### `## Decision tree`
Branching logic for non-trivial cases. Use ASCII tree or if/then table.

### `## Procedure`
Numbered steps. Include the confidence-scoring step before exit.

### `## Output contract`
Exact format of what this skill returns. Future agents depend on this format.

### `## Guard rails`
What NOT to do. Each prefixed with `DO NOT:` or `ALWAYS:`.

### `## Verification`
What proves this skill ran correctly.

### `## Related`
Cross-links to other skills/agents this works with.

## Quality bar (skill-quality rubric)

Each dimension scored 0/1/2:

1. **trigger-clarity** — description matches `Use\s+(WHEN|BEFORE|AFTER|when|before|after).*?(TO|to)\s/i`
2. **step-zero** — body contains "Step 0" OR "Read source of truth" section
3. **decision-tree** — non-trivial branching documented
4. **output-contract** — explicit format spec
5. **gate-on-exit** — frontmatter `gate-on-exit:true` OR procedure step calling confidence-scoring

5 × 2 = 10 max. Threshold: ≥9 to ship.

## Anti-patterns

- **Vague description** — "Helps with stuff" ≠ trigger-clarity
- **Missing Step 0** — skill acts on assumption
- **No decision tree** — branching logic hidden in prose
- **No output contract** — consumers can't parse output reliably
- **No gate-on-exit** — claims done without scoring

## Examples to study

- `skills/verification/SKILL.md` — clean structure, mandatory Step 0
- `skills/confidence-scoring/SKILL.md` — meta-skill with decision tree
- `skills/brainstorming/SKILL.md` — full workflow with HARD-GATE
- `skills/writing-plans/SKILL.md` — produces structured artifact

## Trigger-clarity examples

### Good
- `Use WHEN encountering any bug TO enforce hypothesis-evidence-isolation method GATES no fix without verified root cause`
- `Use BEFORE any claim of works/fixed/complete TO run verification command and show output as evidence`
- `Use AFTER an approved spec exists TO produce a phased implementation plan with confidence gates`

### Bad
- `Helps with debugging` (no trigger word, no purpose verb)
- `Use when needed` (no specific trigger, no purpose)
- `Skill for testing` (no trigger structure at all)

## Adding a confidence rubric for new artifact type

If your skill emits a new artifact type not covered by existing rubrics:

1. Create `confidence-rubrics/<artifact-type>.yaml`
2. Validate against `_schema.json`
3. Dimensions × weights must sum to 10
4. Test: `npm test -- tests/rubric-schema.test.mjs`

## Strengthen pass

When `supervibe:audit` flags your skill as weak:
- Add more decision tree branches
- Expand examples
- Sharpen guard rails
- Bump `version` (1.0 → 1.1)
- Update `last-verified`
