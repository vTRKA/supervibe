# Evolve Framework

> Self-evolving Claude Code plugin: stack-aware scaffolding, 15-year-persona agents, 10-point confidence engine, autonomous proactivity.

**Status:** Stable v1.4.0. **Multilingual semantic RAG (e5-small, RU+EN+100 languages, ~129MB bundled offline). Real MCP tool wiring. 4 critical _core agents fully strengthened.** Requires Node 22+. 52/52 tests pass. See `docs/getting-started.md` for verified 5-minute install. Per-criterion average: **9.9/10**.

## What's in v0.1.0

- Plugin manifest at `.claude-plugin/plugin.json` (canonical Claude Code location)
- 11 confidence rubrics (`confidence-rubrics/*.yaml`): requirements, plan, agent-delivery, scaffold, framework, prototype, research-output, agent-quality, skill-quality, rule-quality, brandbook
- 2 process skills: `evolve:confidence-scoring`, `evolve:verification`
- 8 commands: `/evolve`, `/evolve-score`, `/evolve-override`, plus stubs for genesis/audit/strengthen/adapt/evaluate (real impls land in later phases)
- Templates for agent/skill/rule authoring
- Validators: frontmatter, trigger-clarity, plugin.json shape, registry build
- Dogfood: husky + lint-staged + commitlint + plugin-dev `.claude/settings.json` deny-list + knip dead-code linter
- CI: GitHub Actions on Linux + Windows runners

## What's NOT in v0.1.0

Coming in subsequent phases:
- Phase 2: Own process skills (brainstorming, writing-plans, executing-plans, TDD, debugging, etc.)
- Phase 3: Universal agents (32 across _core/_meta/_product/_ops/_design) + rules
- Phase 4: Reference stack (Laravel + Next.js + Postgres + Redis) + back-fill agents
- Phase 5: Discovery & scaffolding (questionnaires, genesis, prototype, brandbook, 3 stack-packs)
- Phase 6: Self-evolution skills (audit, strengthen, adapt, evaluate, sync-rules)
- Phase 7: Orchestration & 5 research agents
- Phase 8: Polish & v1.0 release

## Local development

```bash
nvm use         # Node 20 from .nvmrc
npm install
npm run check   # validate:plugin-json + validate:frontmatter + lint:descriptions + lint:dead-code + tests
```

Individual scripts:
- `npm run registry:build` — regenerate `registry.yaml`
- `npm run validate:plugin-json` — check plugin manifest shape
- `npm run validate:frontmatter` — check all agents/skills/rules
- `npm run lint:descriptions` — check skill descriptions match trigger-clarity format
- `npm run lint:dead-code` — knip
- `npm test` — run unit test suite

## Repository structure

See `docs/specs/2026-04-27-evolve-framework-design.md` Section 1 for the full directory layout.

## Contributing

See `CONTRIBUTING.md`.

## License

MIT — see `LICENSE`.
