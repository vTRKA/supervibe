# Validation & checks

> Relocated from CLAUDE.md as part of Phase 1 token-economy plan. Content byte-identical.

Run before claiming work complete:

```bash
npm run check
```

This composes:
1. `validate:plugin-json` — manifest shape + agents:[] paths exist
2. `validate:frontmatter` — every agent / skill / rule has required fields
3. `lint:descriptions` — trigger-clarity format on skills
4. `validate:agent-footers` — every agent's `## Output contract` has Confidence + Rubric lines
5. `validate:design-skills` — every design skill body has feedback prompt + required anti-patterns
6. `validate:question-discipline` — every interactive agent has `## User dialogue discipline` + `asking-multiple-questions-at-once` anti-pattern
7. `validate:no-deep-refs` — skill `references/` files are 1-deep (no transitive nesting)
8. `validate:agent-section-order` — agents have cache-friendly section order (Persona before Project Context)
9. `lint:dead-code` — knip clean
10. `test` — 258+ tests in `tests/*.test.mjs`

Individual scripts:
- `npm run code:index` — full code index rebuild
- `npm run code:search -- --query "..."` / `--callers` / `--top-symbols` — graph queries
- `npm run evolve:status` — comprehensive index health
- `npm run evolve:upgrade` — git pull + lfs + install + check; refreshes upstream-check cache
- `npm run evolve:upgrade-check` — manually query upstream for newer commits (normally runs in background)
- `npm run memory:watch` — start file-watcher daemon
- `npm run registry:build` — regenerate `registry.yaml`
- `npm run migrate:prototype-configs` — backfill `config.json` for legacy prototypes (auto-runs on SessionStart)
- `npm run memory:preflight -- --query "<topic>"` — find prior similar work in memory before producing new artifact (per `docs/confidence-gates-spec.md`)
- `npm run measure:tokens` — advisory token-footprint report against budgets
- `npm run regression:run -- <phase>` — run 5×8 regression task suite (manual paste workflow)
- `npm run regression:diff -- --baseline baseline --current <phase>` — diff phase outputs vs baseline

See `docs/confidence-gates-spec.md` for unified gate semantics (block-below=9, warn-below=10) across all commands + skills.
