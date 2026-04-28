# Contributing to Evolve

## Adding an agent

1. Copy `templates/agent.md.tpl` to `agents/<namespace>/<name>.md`
2. Fill in all `{{...}}` placeholders with concrete values from your stack/role
3. Frontmatter must include all fields listed in `scripts/lib/parse-frontmatter.mjs::REQUIRED_AGENT_FIELDS`
4. Body must include: Persona, Project Context, Skills, Procedure, Anti-patterns, Verification, Out of scope
5. Run `npm run validate:frontmatter` — must show OK for your file
6. Run `npm run registry:build` — agent should appear in `registry.yaml`
7. Score with `/supervibe-score agent-quality agents/<namespace>/<name>.md` — must be ≥9

## Adding a skill

1. Copy `templates/skill.md.tpl` to `skills/<name>/SKILL.md`
2. Fill in all placeholders
3. Frontmatter must include all fields in `REQUIRED_SKILL_FIELDS`
4. Description MUST follow format: `Use {WHEN|BEFORE|AFTER} <trigger> TO <verb-led purpose> [GATES <scoring>]`
5. Body must include: When to invoke, Step 0 (mandatory), Decision tree, Procedure, Output contract, Guard rails, Verification
6. Run `npm run lint:descriptions` — must show OK
7. Score with `/supervibe-score skill-quality skills/<name>/SKILL.md` — must be ≥9

## Adding a rule

1. Copy `templates/rule.md.tpl` to `rules/<name>.md`
2. Fill in all placeholders
3. Frontmatter must include all fields in `REQUIRED_RULE_FIELDS`
4. Body must include: Why this rule exists, When this rule applies, What to do, Examples (good and bad), Enforcement, Related rules
5. Score with `/supervibe-score rule-quality rules/<name>.md` — must be ≥9

## Adding a confidence rubric

1. Create `confidence-rubrics/<artifact-type>.yaml`
2. Must validate against `confidence-rubrics/_schema.json`
3. Dimension weights must sum to `max-score` (always 10 in v1.0)
4. Run `npm test` — `tests/rubric-schema.test.mjs` will validate

## Commit discipline

- Conventional commits: `<type>(<scope>): <message>`
- Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`, `build`, `revert`
- Never use `git stash` (banned in deny-list)
- Never force-push to main
- Frequent small commits over large bundles

## Quality gate

Before opening a PR:
- `npm run check` passes
- New artifacts score ≥9 against their respective `*-quality` rubric
- New rules cross-link to related rules where applicable
