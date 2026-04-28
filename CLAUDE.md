# CLAUDE.md — Project Context for Agents

> **Audience:** Claude Code agents loading this file as system context. Humans should read `README.md` first.

This is the **Evolve Framework** — a self-evolving Claude Code plugin: stack-aware scaffolding, specialist agents with explicit decision trees, 10-point confidence engine, autonomous proactivity. **Node 22+. Pure JS. No Docker. No native compilation.**

For deep dives, agents read on demand from `.claude/docs/`:

| Topic | File |
|---|---|
| Memory system + 5 categories + indexing | `.claude/docs/memory-system.md` |
| Code Search (semantic + FTS5) | `.claude/docs/code-search.md` |
| Code Graph (symbols + edges + caller queries) | `.claude/docs/code-graph.md` |
| Preview Server | `.claude/docs/preview-server.md` |
| Confidence Engine (12 rubrics, gates) | `.claude/docs/confidence-engine.md` |
| Agent Evolution Loop (telemetry, strengthen) | `.claude/docs/agent-evolution-loop.md` |
| Canonical agent output footer | `.claude/docs/agent-output-footer.md` |
| Agent system (79 agents, namespace registry) | `.claude/docs/agent-system-registry.md` |
| Skill system (40 skills, phase registry) | `.claude/docs/skill-system-registry.md` |
| Rules / discipline (21 rules) | `.claude/docs/rules-registry.md` |
| MCP integrations | `.claude/docs/mcp-integrations.md` |
| Browser Feedback Channel | `.claude/docs/browser-feedback-channel.md` |
| Non-web design surfaces | `.claude/docs/non-web-design.md` |
| Pre-write prototype guard | `.claude/docs/pre-write-prototype-guard.md` |
| Plugin development workflow | `.claude/docs/plugin-development.md` |
| Validation & checks | `.claude/docs/validation-and-checks.md` |
| Anti-patterns specific to THIS codebase | `.claude/docs/anti-patterns-codebase.md` |
| Reference document templates (PRD/ADR/RFC/...) | `.claude/docs/reference-templates.md` |
| Unified confidence gates spec | `docs/confidence-gates-spec.md` |

---

## Core philosophy (read first — orients every decision)

These six principles override defaults whenever they conflict with general practice:

1. **Persona over generic agents.** Every agent is a specialist with explicit decision tree, procedure, output contract, and anti-patterns. Generic helpfulness is what training data already gives — agents earn their place by being specific.
2. **Evidence over assertion.** Every claim — "X works", "Y is safe", "Z is the right approach" — must cite file:line, test output, graph evidence, or memory entry. No "trust me" outputs.
3. **Confidence-gated delivery.** Work isn't done when you stop typing — work is done when an applicable rubric scores ≥9/10. Below threshold: iterate. Override: log and explain.
4. **Memory beats re-derivation.** If a decision was made before, find it in `.claude/memory/decisions/` and cite. Re-deriving silently wastes tokens and risks contradicting past resolutions.
5. **Graph before refactor.** Public-surface changes (rename / move / extract / delete) require `--callers` evidence FIRST. The semantic RAG won't catch cross-file callers — only the graph does.
6. **Anti-half-finished discipline.** No commented-out code, no TODOs without owners, no half-applied refactors. Either complete a change or revert it cleanly.

---

## Repository layout

```
evolve/
├── .claude-plugin/plugin.json     Manifest — agents:[] array
├── agents/                        79 agents (_core/_meta/_design/_ops/_product + stacks/)
├── skills/                        49 process skills
├── commands/                      19 slash commands (/evolve, /evolve-design, /evolve-execute-plan, /evolve-debug, ...)
├── rules/                         21 project rules
├── confidence-rubrics/            14 YAML rubrics
├── grammars/                      Bundled WASM tree-sitter grammars (LFS)
├── models/Xenova/...              Embedding model (LFS)
├── scripts/                       Build / index / search / validate (Node ESM)
│   └── lib/                         Reusable libs
├── tests/                         258+ tests (node:test)
├── docs/                          specs/, plans/, audits/, getting-started.md, ...
│   └── confidence-gates-spec.md     Unified gate semantics
├── hooks/hooks.json               SessionStart, PreToolUse, UserPromptSubmit, PostToolUse, Stop
├── .claude/docs/                  Relocated reference sections (loaded on demand)
└── .claude/memory/                (gitignored binaries) SQLite stores: code.db + memory.db
```

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
| "Execute plan X" / "run the plan" / "go through plan" | `/evolve-execute-plan <path>` — Stage A readiness audit (10/10) BEFORE + Stage B completion audit (10/10) AFTER |
| "Why did agent X fail?" / "debug invocation Y" | `/evolve-debug <invocation-id\|agent-id>` — replay + root-cause classification |
| "Run tests" / "check the plugin" | `/evolve-test` — wraps `npm run check` with structured output |
| "Deploy this prototype" / "promote to production" | `/evolve-deploy <slug>` — handoff bundle → stack-developer with 6-invariant pre-deploy gate |
| "Cleanup memory" / "archive old learnings" | `/evolve-memory-gc` — reversible archival with retention policy |
| "Score artifact X" / "evaluate confidence" | `/evolve-score <type> <path>` — explicit rubric scoring with auto-fix offers |
| "Research best X" | relevant `*-researcher` agent (uses context7 MCP) |

Default rule: if user intent isn't clear, invoke `evolve:brainstorming` skill BEFORE picking an agent.

---

## Quick conventions

- **Commits**: Conventional Commits (commitlint via Husky `commit-msg`)
- **Pre-commit / Pre-push**: Husky + `npm run check` (258+ tests + 10 validators)
- **Imports**: ESM only; `node:sqlite`, `node:crypto`, etc.
- **File naming**: kebab-case for files; PascalCase for classes
- **Frontmatter**: every agent / skill / rule / rubric file requires it (validated by `npm run validate:frontmatter`)
- **Agents**: ≥250 lines + cache-friendly section order (Persona before Project Context, validated by `npm run validate:agent-section-order`)
- **Skills**: trigger-clarity description; references/ are 1-deep (validated by `npm run validate:no-deep-refs`)
- **Tests**: `node:test`; `tests/*.test.mjs`
- **No native deps**: pure JS / WASM / SQLite. **No Docker. No external services.**

---

## RAG + Memory + Code Graph (HARD RULES)

Every interactive agent's Procedure starts with these 3 mandatory steps (enforced via PostToolUse telemetry + audit-evidence script):

1. **Memory pre-flight** — `evolve:project-memory --query "<topic>"` BEFORE producing any artifact. Cite prior matches OR explicitly note why they don't apply.
2. **Code search** — `evolve:code-search` BEFORE writing new code. Read top-3 results.
3. **Code graph (refactor only)** — `--callers <symbol>` BEFORE rename / extract / move / inline / delete. Cite Case A/B/C in output.

**Auto-injected reminders** (no manual invocation needed):
- `UserPromptSubmit` hook auto-runs memory pre-flight on technical prompts → injects matches as `additionalContext`
- `PreToolUse` hook detects refactor patterns in Edit/Write → reminds about `--callers` (advisory, doesn't block)
- `PostToolUse` hook tracks per-agent sub-tool usage → `npm run audit:evidence` flags agents below thresholds

**Audit:** `npm run audit:evidence` — per-agent memory/code-search/graph usage rates over last N invocations.

## When in doubt

1. **Re-read this file** — likely answer is the routing table or a `.claude/docs/` pointer above
2. **Read the specific `.claude/docs/<topic>.md`** — they encode the discipline (relocated from earlier monolithic CLAUDE.md)
3. **Run `npm run evolve:status`** — see real index state
4. **Read the specific agent** from `agents/<namespace>/`
5. **Read the relevant rule** from `rules/`
6. **Search memory**: `node $CLAUDE_PLUGIN_ROOT/scripts/search-memory.mjs --query "<topic>"` — past decisions
7. **Search code**: `node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --query "<concept>"` — existing patterns
8. **Read full architecture spec**: `docs/specs/2026-04-27-evolve-framework-design.md`

---

## References

- **`README.md`** — human-facing intro, install instructions, troubleshooting
- **`docs/getting-started.md`** — extended verified install + per-feature usage
- **`docs/confidence-gates-spec.md`** — unified gate semantics across commands + skills
- **`docs/specs/2026-04-27-evolve-framework-design.md`** — full architecture spec
- **`docs/plans/`** — implementation plans (latest: 2026-04-28-token-economy-safe-mode.md)
- **`docs/agent-authoring.md`** — guide for writing new agents
- **`docs/skill-authoring.md`** — guide for writing new skills
- **`docs/rule-authoring.md`** — guide for writing new rules
- **`CHANGELOG.md`** — version history
