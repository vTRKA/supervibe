# Plugin development workflow

> Relocated from CLAUDE.md as part of Phase 1 token-economy plan. Content byte-identical.

When adding to this plugin (not to a user's project):

## Adding a new agent

1. Read `agents/_core/code-reviewer.md` as the structural reference
2. Create `agents/<namespace>/<name>.md` with full frontmatter
3. Body must have all 11 sections: Persona / Project Context / Skills / Decision tree / Procedure / Output contract / Anti-patterns / Verification / Common workflows / Out of scope / Related
4. ≥250 lines; persona is 3–4 paragraphs (deep-domain background with concrete past-systems, core principle, priorities, mental model)
5. Add to `.claude-plugin/plugin.json` `agents:[]` array
6. Run `npm run validate:frontmatter` and `npm run check`

## Adding a new skill

1. Create `skills/<name>/SKILL.md` with frontmatter:
   ```yaml
   name, namespace, description (trigger-clarity format), allowed-tools,
   phase, prerequisites, emits-artifact, confidence-rubric, gate-on-exit,
   version, last-verified
   ```
2. Description MUST start with `Use BEFORE/AFTER/WHEN/ON/WHILE` and contain a `TO <purpose>` clause
3. Body sections: When to invoke / Step 0 — Read source of truth / Decision tree / Procedure / Output contract / Guard rails / Verification / Related
4. Run `npm run lint:descriptions` (validates trigger-clarity)

## Adding a new rule

1. Create `rules/<name>.md` with frontmatter (`name`, `description`, `applies-to`, `severity`, `version`, `last-verified`, `mandatory: true/false`, `related-rules: [...]`)
2. Sections: What / Why / How to apply / When NOT to apply / Discipline / Override / Related
3. Run `npm run validate:frontmatter`

## Adding a new rubric

1. Create `confidence-rubrics/<name>.yaml` matching `confidence-rubrics/_schema.json` (flat dimensions list)
2. Each dimension: `id`, `weight`, `question`, `evidence-required`
3. Sum of weights MUST equal `max-score: 10`
4. Test enforces this — `tests/rubric-schema.test.mjs`
