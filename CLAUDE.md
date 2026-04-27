# CLAUDE.md — Project Context for Agents

> **Audience:** Claude Code agents (and the orchestrator) loading this file as system context. Humans should read `README.md` first.

This is the **Evolve Framework** — a self-evolving Claude Code plugin: stack-aware scaffolding, 15-year-persona agents, 10-point confidence engine, autonomous proactivity. **Node 22+. Pure JS. No Docker. No native compilation.** See `README.md` and `docs/specs/2026-04-27-evolve-framework-design.md` for full design.

---

## Core philosophy (read first — orients every decision)

These six principles override defaults whenever they conflict with general practice:

1. **Persona over generic agents.** Every agent is a 15-year specialist with explicit decision tree, procedure, output contract, and anti-patterns. Generic helpfulness is what training data already gives — agents earn their place by being specific.
2. **Evidence over assertion.** Every claim — "X works", "Y is safe", "Z is the right approach" — must cite file:line, test output, graph evidence, or memory entry. No "trust me" outputs.
3. **Confidence-gated delivery.** Work isn't done when you stop typing — work is done when an applicable rubric scores ≥9/10. Below threshold: iterate. Override: log and explain.
4. **Memory beats re-derivation.** If a decision was made before, find it in `.claude/memory/decisions/` and cite. Re-deriving silently wastes tokens and risks contradicting past resolutions.
5. **Graph before refactor.** Public-surface changes (rename / move / extract / delete) require `--callers` evidence FIRST. The semantic RAG won't catch cross-file callers — only the graph does.
6. **Anti-half-finished discipline.** No commented-out code, no TODOs without owners, no half-applied refactors. Either complete a change or revert it cleanly.

---

## Repository layout

```
evolve/
├── .claude-plugin/plugin.json     Manifest — agents:[] array (canonical Claude Code location)
├── agents/                        46 agents organized by namespace
│   ├── _core/                       6 — code-reviewer, refactoring-specialist, repo-researcher, ...
│   ├── _meta/                       3 — evolve-orchestrator, memory-curator, rules-curator
│   ├── _design/                     6 — creative-director, ux-ui-designer, ui-polish-reviewer, ...
│   ├── _ops/                        12 — devops-sre, infrastructure-architect, db-reviewer, ...
│   ├── _product/                    6 — product-manager, qa-test-engineer, systems-analyst, ...
│   └── stacks/                      12 across laravel/nextjs/fastapi/react/postgres/redis
├── skills/                        40 process skills (TDD, debugging, brainstorming, code-search, ...)
├── commands/                      Slash commands (/evolve, /evolve-genesis, /evolve-score, ...)
├── rules/                         19 project rules (anti-hallucination, no-hardcode, ...)
├── confidence-rubrics/            12 YAML rubrics (agent-delivery, plan, scaffold, ...)
├── grammars/                      Bundled WASM tree-sitter grammars (9 languages, ~10MB via LFS)
│   └── queries/                     8 S-expression query files for symbol/edge extraction
├── models/Xenova/multilingual-e5-small/   Embedding model (~129MB via LFS, fallback: HF download)
├── scripts/                       Build / index / search / validate (Node ESM)
│   └── lib/                         Reusable libs: code-store, code-graph, embeddings, watcher
├── tests/                         103 tests (node:test) — covers all libs + validation
├── docs/                          specs/, plans/, getting-started.md, agent-authoring.md, ...
├── hooks.json                     SessionStart, PostToolUse, Stop hooks
└── .claude/memory/                (gitignored) SQLite stores: code.db + memory.db
```

---

## Memory system (`.claude/memory/`)

Five categories, each markdown with frontmatter (`id`, `type`, `date`, `tags`, `agent`, `confidence`):

| Category | When to write | Tag examples |
|----------|---------------|--------------|
| `decisions/` | Architecture / library / pattern choice with rationale + alternatives considered | `auth`, `db`, `queue` |
| `patterns/` | Reusable pattern established across ≥2 places (idempotency, error envelope, ...) | `idempotency`, `pagination` |
| `incidents/` | Postmortem with root cause, blast radius, and prevention measures | `outage`, `data-loss` |
| `learnings/` | Project-specific insight not obvious from code (gotchas, vendor quirks) | `stripe`, `redis-cluster` |
| `solutions/` | "How we solved X" catalog — searchable recipes | `n+1`, `auth-flow` |

**Indexing:** `memory.db` (SQLite FTS5 + e5 embeddings + per-chunk semantic). Hash-based incremental updates via `chokidar` watcher. **No truncation** — every word of every entry reachable by semantic search.

**Skill:** `evolve:project-memory` — invoke BEFORE any non-trivial task. Returns ≤5 most-relevant prior entries with file:line refs.

**Adding entries:** `evolve:add-memory` skill — writes markdown + auto-rebuilds index.

---

## Code Search (semantic + FTS5)

Hybrid **Code RAG** index at `.claude/memory/code.db`:

- **Semantic**: `Xenova/multilingual-e5-small` (RU+EN+100 langs, ~129 MB bundled offline)
- **Keyword**: SQLite FTS5 BM25 over function-aware code chunks
- **Hybrid ranking**: Reciprocal Rank Fusion (k=60) over BM25 + cosine similarity
- **Incremental**: chokidar file-watcher keeps index fresh
- **Languages**: TS, TSX, JS, JSX, Python, PHP, Rust, Go, Java, Ruby, Vue, Svelte (whole-file chunking for last two)

Skill: `evolve:code-search` — invoke **BEFORE** any non-trivial code change.

| Question | Command |
|----------|---------|
| "How does X work?" (concept) | `node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --query "<topic>"` |
| Files matching a phrase | `... --query "<phrase>" --limit 10` |
| By language | `... --query "<topic>" --lang typescript` |

Rebuild: `npm run code:index`. SessionStart hook auto-refreshes a missing index.

---

## Code Graph (structural relationships)

Beyond semantic, the same `code.db` has a **code graph** with symbols + edges:

- **Symbols**: function / class / method / type / interface / enum (per language, tree-sitter S-expression queries)
- **Edges**: `calls`, `imports`, `extends`, `implements`, `references`

| Question | Command |
|----------|---------|
| Who calls X? | `node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --callers "X"` |
| What does X depend on? | `... --callees "X"` |
| Neighborhood of X | `... --neighbors "X" --depth 2` |
| Refactor blast-radius | `--callers "X"` then `--neighbors "X" --depth 2` |
| Most-connected symbols (orientation) | `... --top-symbols 20` |
| Same-name disambiguation | pass full ID `path:kind:name:line` instead of bare name |

**Discipline (enforced by rule `use-codegraph-before-refactor`):**

- BEFORE rename / extract method / move / inline: ALWAYS run `--callers` first — caller count is your blast radius
- BEFORE deleting a public symbol: confirm `--callers <symbol>` returns 0 in addition to running tests
- Cite graph evidence in agent output via 3-case template (Case A: callers found / Case B: zero callers verified / Case C: N/A with reason). Skipping the section on a structural change FAILS the agent-delivery rubric.

**Auto-startup:** SessionStart hook prints index status as the first 3 lines of every session. If you see `code graph ✗` or `WARN`, run `npm run code:index` before depending on graph queries.

**Languages covered:** TypeScript, JavaScript, TSX, JSX, Python, PHP, Go, Rust, Java, Ruby. Vue/Svelte deferred (need multi-grammar stitching for `<script>` + `<template>`).

**Coverage realism:** ~80% cross-file edge resolution baseline (industry standard for non-LSP graph extractors). Unresolved targets surface with `to_name` and `kind=external` — useful for "imports from third-party X".

---

## Confidence Engine

Every agent output is scored against an applicable rubric (0–10). Gate threshold: **≥9** for non-blocking acceptance, **≥8** with override allowed once-per-task with logged rationale.

**12 rubrics** (in `confidence-rubrics/*.yaml`):

| Rubric | Applies to |
|--------|-----------|
| `agent-delivery` | Any agent's task output (most common) |
| `agent-quality` | Newly authored / strengthened agent files |
| `skill-quality` | Skill markdown files |
| `rule-quality` | Rule markdown files |
| `requirements` | Requirements docs from systems-analyst |
| `plan` | Implementation plans from writing-plans skill |
| `scaffold` | Output of /evolve-genesis or stack-pack apply |
| `framework` | Foundational framework changes |
| `prototype` | Prototype-builder outputs |
| `research-output` | Research notes from *-researcher agents |
| `memory-entry` | Memory entries before persistence |
| `brandbook` | Brandbook deliverables |

**Override flow:** when a justified result scores 8.x, agent may override with `evolve:_core:quality-gate-reviewer` reviewing the rationale. Override is logged to `.claude/confidence-log.jsonl`. Override rate >5% in a 100-entry window triggers SessionStart warning.

**Skill:** `evolve:confidence-scoring` — applies the rubric and emits structured score + evidence.

---

## Agent system (46 agents)

Routing by `namespace` in frontmatter:

| Namespace | Count | Examples | When to invoke |
|-----------|-------|----------|----------------|
| `_core` | 6 | `code-reviewer`, `refactoring-specialist`, `repo-researcher`, `architect-reviewer`, `root-cause-debugger`, `security-auditor`, `quality-gate-reviewer` | Cross-cutting reviews and analyses |
| `_meta` | 3 | `evolve-orchestrator`, `memory-curator`, `rules-curator` | Maintenance + dispatch |
| `_design` | 6 | `ux-ui-designer`, `creative-director`, `ui-polish-reviewer`, `accessibility-reviewer`, `copywriter`, `prototype-builder` | Design surface |
| `_ops` | 12 | `devops-sre`, `infrastructure-architect`, `db-reviewer`, `ai-integration-architect`, plus 5 researchers | Ops + research |
| `_product` | 6 | `product-manager`, `systems-analyst`, `qa-test-engineer`, `analytics-implementation`, `seo-specialist`, `email-lifecycle` | Product surface |
| `stacks/laravel` | 4 | `laravel-architect`, `laravel-developer`, `eloquent-modeler`, `queue-worker-architect` | Laravel projects |
| `stacks/nextjs` | 3 | `nextjs-architect`, `nextjs-developer`, `server-actions-specialist` | Next.js projects |
| `stacks/fastapi` | 2 | `fastapi-architect`, `fastapi-developer` | FastAPI projects |
| `stacks/react` | 1 | `react-implementer` | Standalone React/Vite |
| `stacks/postgres` | 1 | `postgres-architect` | Postgres-heavy projects |
| `stacks/redis` | 1 | `redis-architect` | Redis-heavy projects |

**All agents:** ≥250 lines, full Persona / Project Context / Skills / Decision tree / Procedure / Output contract / Anti-patterns / Verification / Common workflows / Out of scope / Related.

**Reference template:** `agents/_core/code-reviewer.md` (260 lines) — canonical structure for new agents.

---

## Skill system (40 skills)

Skills are **methodologies** — invokable from any agent. Frontmatter `description` follows trigger-clarity format ("Use BEFORE / AFTER / WHEN ... TO ...").

Key skills by phase:

| Phase | Skill | Purpose |
|-------|-------|---------|
| Discover | `evolve:stack-discovery` | Detect tech stack from repo |
| Discover | `evolve:requirements-intake` | Elicit requirements from user |
| Brainstorm | `evolve:brainstorming` | Multi-option exploration |
| Brainstorm | `evolve:explore-alternatives` | Decision matrices |
| Plan | `evolve:writing-plans` | Bite-sized TDD plan documents |
| Plan | `evolve:adr` | Architectural decision records |
| Plan | `evolve:prd` | Product requirements docs |
| Execute | `evolve:executing-plans` | Sequential plan execution |
| Execute | `evolve:subagent-driven-development` | Parallel subagent dispatch |
| Execute | `evolve:tdd` | Red-green-refactor discipline |
| Search | `evolve:code-search` | Semantic + graph code lookup |
| Search | `evolve:project-memory` | Past decisions/patterns search |
| Search | `evolve:mcp-discovery` | Find MCP tools for a task |
| Verify | `evolve:verification` | Cite tests/build/lint as evidence |
| Verify | `evolve:code-review` | 8-dim review with structural change check |
| Verify | `evolve:pre-pr-check` | Pre-PR gate |
| Score | `evolve:confidence-scoring` | Apply rubric to artifact |
| Debug | `evolve:systematic-debugging` | Root-cause methodology |
| Debug | `evolve:incident-response` | Postmortem template |
| Maintain | `evolve:strengthen` | Bring weak artifact to spec |
| Maintain | `evolve:adapt` | Adapt artifact to new context |
| Maintain | `evolve:audit` | Health check of artifacts |
| Maintain | `evolve:evaluate` | Test artifact against rubric |
| Maintain | `evolve:rule-audit` | Audit rule compliance |
| Maintain | `evolve:sync-rules` | Sync rules across sibling repos |
| Memory | `evolve:add-memory` | Persist new memory entry |
| Design | `evolve:brandbook` | Brand guidelines |
| Design | `evolve:tokens-export` | Design tokens to code |
| Design | `evolve:landing-page` | Landing page from brief |
| Design | `evolve:interaction-design-patterns` | Interaction patterns |
| Design | `evolve:prototype` | HTML/CSS prototypes |
| Design | `evolve:experiment` | A/B test scaffolding |
| Genesis | `evolve:genesis` | Initial scaffold |
| Genesis | `evolve:new-feature` | Per-feature scaffold |
| SEO | `evolve:seo-audit` | SEO checklist |
| Misc | `evolve:dispatching-parallel-agents` | Subagent fan-out helper |
| Misc | `evolve:using-git-worktrees` | Git worktree workflow |
| Misc | `evolve:requesting-code-review` | Open code review |
| Misc | `evolve:receiving-code-review` | Process review feedback |
| Misc | `evolve:finishing-a-development-branch` | Wrap-up checklist |

Total: 40. **Every skill** has `name`, `namespace`, `description`, `allowed-tools`, `phase`, `prerequisites`, `emits-artifact`, `confidence-rubric`, `gate-on-exit`, `version`, `last-verified` in frontmatter.

---

## Rules / discipline (19 rules)

Files in `rules/`. Each enforced by `evolve:rule-audit` skill and applies-when frontmatter.

| Rule | Severity | What it enforces |
|------|----------|------------------|
| `anti-hallucination` | critical | Cite file:line for every claim; never invent function signatures |
| `confidence-discipline` | critical | Score work; gate at ≥9; log overrides |
| `no-half-finished` | critical | No commented code, no orphan TODOs, no half-applied refactors |
| `no-dead-code` | high | Knip-clean; remove unused exports + functions |
| `no-hardcode` | high | Tokens / config / strings via config or env, not literals |
| `use-codegraph-before-refactor` | critical | --callers MUST run before rename/move/extract/delete |
| `commit-discipline` | high | Conventional Commits via commitlint |
| `git-discipline` | high | No force-push to main; no skip hooks |
| `pre-commit-discipline` | high | Husky pre-commit hooks must pass |
| `rule-maintenance` | medium | Rules quarterly reviewed; `last-verified` kept fresh |
| `best-practices-2026` | medium | Apply 2026-current patterns; no 2018 idioms |
| `infrastructure-patterns` | medium | Sentinel/Cluster decision, replication, queue topology |
| `modular-backend` | medium | Bounded contexts, no god-services |
| `routing` | medium | Routing conventions (REST / GraphQL / Server Actions) |
| `i18n` | medium | Externalized strings, locale fallback chain |
| `privacy-pii` | high | No PII in logs, masked outputs, GDPR-compliant retention |
| `observability` | medium | Logs / metrics / traces wired for new services |
| `prototype-to-production` | medium | Hardening checklist before promote |
| `fsd` | medium | Feature-Sliced Design for frontend (when stack matches) |

---

## MCP integrations (real wiring)

Tools wired into agents via `tools:` array in frontmatter:

| MCP | Purpose | Used by |
|-----|---------|---------|
| `mcp-server-context7` | Current library docs (FS / npm / etc.) | All stack-developer agents, best-practices-researcher |
| `playwright` | Browser automation | competitive-design-researcher, e2e tests |
| `mcp-server-figma` | Read Figma designs | ux-ui-designer, prototype-builder |
| `mcp-server-firecrawl` | Web crawling / extraction | competitive-design-researcher, security-researcher |

Skill `evolve:mcp-discovery` — when user task seems to need an external tool, check if an MCP exists before resorting to WebFetch.

---

## Common workflows (orchestrator routing)

When user asks X, route as follows:

| User intent | First action |
|-------------|--------------|
| "Set up a new project" / no `.claude/` exists | `/evolve-genesis` (auto via `/evolve`) |
| "Add feature X" / "implement Y" | `evolve:project-memory` → `evolve:code-search` → relevant stack-developer |
| "Refactor X" / "rename Y" | `evolve:code-search --callers` → `refactoring-specialist` |
| "Why does X happen?" / debug | `root-cause-debugger` (uses `evolve:systematic-debugging`) |
| "Review this code" / "is it safe?" | `code-reviewer` + `security-auditor` |
| "Design X" / "what should the UI look like?" | `ux-ui-designer` then `prototype-builder` |
| "Brand for X" / new product | `creative-director` then `ux-ui-designer` |
| "Architecture for X" / system design | `architect-reviewer` (or stack-architect for known stack) |
| "Performance issue" / "slow X" | `performance-reviewer` (uses profile-first methodology) |
| "DB migration" / "schema change" | `db-reviewer` then `postgres-architect` (or stack-equivalent) |
| "Deploy X" / "infrastructure" | `infrastructure-architect` then `devops-sre` |
| "Plan for X" / specs | `systems-analyst` then `evolve:writing-plans` |
| "Research best X" | relevant `*-researcher` agent (uses context7 MCP) |

Default rule: if user intent isn't clear, invoke `evolve:brainstorming` skill BEFORE picking an agent.

---

## Plugin development workflow

When adding to this plugin (not to a user's project):

### Adding a new agent

1. Read `agents/_core/code-reviewer.md` as the structural reference
2. Create `agents/<namespace>/<name>.md` with full frontmatter
3. Body must have all 11 sections: Persona / Project Context / Skills / Decision tree / Procedure / Output contract / Anti-patterns / Verification / Common workflows / Out of scope / Related
4. ≥250 lines; persona is 3–4 paragraphs (15-yr background, principle, priorities, mental model)
5. Add to `.claude-plugin/plugin.json` `agents:[]` array
6. Run `npm run validate:frontmatter` and `npm run check`

### Adding a new skill

1. Create `skills/<name>/SKILL.md` with frontmatter:
   ```yaml
   name, namespace, description (trigger-clarity format), allowed-tools,
   phase, prerequisites, emits-artifact, confidence-rubric, gate-on-exit,
   version, last-verified
   ```
2. Description MUST start with `Use BEFORE/AFTER/WHEN/ON/WHILE` and contain a `TO <purpose>` clause
3. Body sections: When to invoke / Step 0 — Read source of truth / Decision tree / Procedure / Output contract / Guard rails / Verification / Related
4. Run `npm run lint:descriptions` (validates trigger-clarity)

### Adding a new rule

1. Create `rules/<name>.md` with frontmatter (`name`, `description`, `applies-to`, `severity`, `version`, `last-verified`, `mandatory: true/false`, `related-rules: [...]`)
2. Sections: What / Why / How to apply / When NOT to apply / Discipline / Override / Related
3. Run `npm run validate:frontmatter`

### Adding a new rubric

1. Create `confidence-rubrics/<name>.yaml` matching `confidence-rubrics/_schema.json` (flat dimensions list)
2. Each dimension: `id`, `weight`, `question`, `evidence-required`
3. Sum of weights MUST equal `max-score: 10`
4. Test enforces this — `tests/rubric-schema.test.mjs`

---

## Validation & checks

Run before claiming work complete:

```bash
npm run check
```

This composes:
1. `validate:plugin-json` — manifest shape + agents:[] paths exist
2. `validate:frontmatter` — every agent / skill / rule has required fields
3. `lint:descriptions` — trigger-clarity format on skills
4. `lint:dead-code` — knip clean
5. `test` — all 103 tests in `tests/*.test.mjs`

Individual scripts:
- `npm run code:index` — full code index rebuild
- `npm run code:search -- --query "..."` / `--callers` / `--top-symbols` — graph queries
- `npm run evolve:status` — comprehensive index health
- `npm run memory:watch` — start file-watcher daemon
- `npm run registry:build` — regenerate `registry.yaml`

---

## Conventions

- **Commits**: Conventional Commits (enforced by commitlint via Husky `commit-msg` hook)
- **Pre-commit**: Husky + lint-staged run frontmatter / pint / eslint on staged files
- **Pre-push**: Husky + Git LFS pre-push + `npm run check` (all 103 tests)
- **Imports**: ESM only (`type: "module"` in package.json); use `node:sqlite`, `node:crypto`, etc.
- **File naming**: kebab-case for files; PascalCase for classes inside files
- **Frontmatter**: every agent / skill / rule / rubric file requires it
- **Agents**: ≥250 lines with all 11 standard sections
- **Skills**: trigger-clarity description; phase tag; emits-artifact tag
- **Tests**: `node:test` runner; `*.test.mjs` in `tests/` flat
- **No native deps**: pure JS / WASM / SQLite (built into Node 22+)
- **No Docker**: anywhere in user-facing flow
- **No external services**: all in-process

---

## Anti-patterns (specific to THIS codebase — incidents fixed once, do not regress)

- **Truncating before embedding** — v1.4.0 incident. Memory was sliced to 800 chars before embedding. Fixed by `chunker.mjs` + `entry_chunks` table. Always embed full chunks, never first-N-chars.
- **Single-language embedding** — pre-1.4.0 used English-only model; broke RU semantic search. multilingual-e5-small is mandatory.
- **`Parser.getLanguage()` on web-tree-sitter v0.26+** — that method was removed. Use `getLanguage(lang)` from grammar-loader and pass to `new Query(language, text)`.
- **`COALESCE` in PRIMARY KEY** — SQLite forbids expressions in PK. Use UNIQUE INDEX with expression instead (see `code_edges`).
- **Skipping graph extraction on hash-unchanged file** — files indexed before D4 had no symbols. `indexFile` now heals via "if no symbols, run extraction even on unchanged hash".
- **Husky 9 deprecation lines** — `#!/usr/bin/env sh` and `. "$(dirname -- "$0")/_/husky.sh"` are deprecated. Hook files contain commands only.
- **Force push to main** — never. Use `--force-with-lease` only after local rewrite (e.g., `git lfs migrate import`) and verify origin state matches expectations.
- **>100MB single file in git** — GitHub hard limit. Use Git LFS for `*.onnx`, `*.wasm`. `.gitattributes` already configured.
- **Native bindings** — `node-tree-sitter` requires C compiler at install. We use `web-tree-sitter` (WASM) instead. Never replace.
- **`npm install --no-save` packages then commit `node_modules/`** — only the files copied to `grammars/` go in repo; `node_modules/tree-sitter-*` are dev-time only.

---

## When in doubt

1. Read this file again — likely answer is here
2. Run `npm run evolve:status` — see real index state
3. Read the specific agent file from `agents/<namespace>/` — they encode the discipline
4. Read the relevant rule from `rules/` — applies-when frontmatter tells when to fire
5. Search memory: `node $CLAUDE_PLUGIN_ROOT/scripts/search-memory.mjs --query "<topic>"` — past decisions
6. Search code: `node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --query "<concept>"` — existing patterns
7. Read `docs/specs/2026-04-27-evolve-framework-design.md` for full architectural rationale

---

## References

- **`README.md`** — human-facing intro, install instructions, troubleshooting
- **`docs/getting-started.md`** — extended verified install + per-feature usage
- **`docs/specs/2026-04-27-evolve-framework-design.md`** — full architecture spec
- **`docs/plans/`** — implementation plans (latest: Phase D codegraph)
- **`docs/agent-authoring.md`** — guide for writing new agents
- **`docs/skill-authoring.md`** — guide for writing new skills
- **`docs/rule-authoring.md`** — guide for writing new rules
- **`CHANGELOG.md`** — version history
