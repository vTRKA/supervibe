# CLAUDE.md — Project Context for Agents

> **Audience:** Claude Code agents loading this file as system context. Humans should read `README.md` first.

This is the **Supervibe Framework** — a Claude Code plugin with specialist agents, code graph, project memory, confidence gates, and stack-aware scaffolding. **Node 22.5+ with node:sqlite is required. Pure JS. No Docker. No native compilation.**

For deep dives, agents read on demand from tracked plugin sources, not local
`.claude/` state:

| Topic | File |
|---|---|
| User-facing setup and feature usage | `docs/getting-started.md` |
| Install/update integrity | `docs/install-integrity.md` |
| Release security | `docs/release-security.md` |
| Confidence Engine / gates | `docs/confidence-gates-spec.md` |
| Multi-agent orchestration | `docs/multi-agent-orchestration.md` |
| Semantic anchors | `docs/semantic-anchors.md` |
| Design intelligence | `docs/design-intelligence.md` |
| Agent authoring | `docs/agent-authoring.md` |
| Skill authoring | `docs/skill-authoring.md` |
| Rule authoring | `docs/rule-authoring.md` |
| Runtime behavior | `scripts/lib/`, `commands/`, `skills/`, `agents/`, `rules/` |
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
supervibe/
├── .claude-plugin/plugin.json     Manifest — agents:[] array
├── agents/                        83 agents (_core/_meta/_design/_ops/_product + stacks/)
├── skills/                        51 process skills
├── commands/                      20 slash commands (/evolve, /supervibe-design, /supervibe-security-audit, /supervibe-execute-plan, ...)
├── rules/                         25 project rules
├── confidence-rubrics/            16 YAML rubrics
├── grammars/                      Bundled WASM tree-sitter grammars (LFS)
├── models/Xenova/...              Embedding model (LFS)
├── scripts/                       Build / index / search / validate (Node ESM)
│   └── lib/                         Reusable libs
├── tests/                         node:test suite (run via `npm run check`)
├── docs/                          specs/, plans/, audits/, getting-started.md, ...
│   └── confidence-gates-spec.md     Unified gate semantics
├── hooks/hooks.json               SessionStart, PreToolUse, UserPromptSubmit, PostToolUse, Stop
└── .claude/                       Local-only generated state (gitignored; never shipped)
```

---

## Common workflows (orchestrator routing)

When user asks X, route as follows:

| User intent | First action |
|-------------|--------------|
| "Set up a new project" / no `.claude/` exists | `/supervibe-genesis` (auto via `/evolve`) |
| "Add feature X" / "implement Y" | `supervibe:project-memory` → `supervibe:code-search` → relevant stack-developer |
| "Refactor X" / "rename Y" | `supervibe:code-search --callers` → `refactoring-specialist` |
| "Why does X happen?" / debug | `root-cause-debugger` (uses `supervibe:systematic-debugging`) |
| "Review this code" / "is it safe?" | `code-reviewer` + `security-auditor` |
| "Security audit" / "проверь уязвимости" | `/supervibe-security-audit` — read-only multi-agent audit → prioritized findings → optional plan/execute/re-audit to 10/10 |
| "Router/VPN/Wi-Fi/firewall issue" | `network-router-engineer` — read-only diagnostics first; scoped approval before mutations |
| "Prompt/system prompt/agent instruction issue" | `prompt-ai-engineer` — prompt contract, intent routing, structured output, eval, tool-policy, and prompt-injection hardening |
| "Show tasks/epics/projects in Kanban" | `/supervibe-ui` — local Kanban board with task-to-epic links, agent claims, blockers, verification, and status movement |
| "Design X" / "what should the UI look like?" | `ux-ui-designer` then `prototype-builder` |
| "Brand for X" / new product | `creative-director` then `ux-ui-designer` |
| "Architecture for X" / system design | `architect-reviewer` (or stack-architect for known stack) |
| "Performance issue" / "slow X" | `performance-reviewer` (uses profile-first methodology) |
| "DB migration" / "schema change" | `db-reviewer` then `postgres-architect` (or stack-equivalent) |
| "Deploy X" / "infrastructure" | `infrastructure-architect` then `devops-sre` |
| "Plan for X" / specs | `systems-analyst` then `supervibe:writing-plans` |
| "Execute plan X" / "run the plan" / "go through plan" | `/supervibe-execute-plan <path>` — Stage A readiness audit (10/10) BEFORE + Stage B completion audit (10/10) AFTER |
| "Why did agent X fail?" / "debug invocation Y" | `/supervibe-debug <invocation-id\|agent-id>` — replay + root-cause classification |
| "Run tests" / "check the plugin" | `/supervibe-test` — wraps `npm run check` with structured output |
| "Deploy this prototype" / "promote to production" | `/supervibe-deploy <slug>` — handoff bundle → stack-developer with 6-invariant pre-deploy gate |
| "Cleanup memory" / "archive old learnings" | `/supervibe-memory-gc` — reversible archival with retention policy |
| "Score artifact X" / "evaluate confidence" | `/supervibe-score <type> <path>` — explicit rubric scoring with auto-fix offers |
| "Research best X" | relevant `*-researcher` agent (uses context7 MCP) |

Default rule: if user intent isn't clear, invoke `supervibe:brainstorming` skill BEFORE picking an agent.

---

## Quick conventions

- **Commits**: Conventional Commits (commitlint via Husky `commit-msg`)
- **Pre-commit / Pre-push**: Husky + `npm run check` (validators, audits, knip, and the full node:test suite)
- **Imports**: ESM only; `node:sqlite`, `node:crypto`, etc.
- **File naming**: kebab-case for files; PascalCase for classes
- **Frontmatter**: every agent / skill / rule / rubric file requires it (validated by `npm run validate:frontmatter`)
- **Agents**: ≥250 lines + cache-friendly section order (Persona before Project Context, validated by `npm run validate:agent-section-order`)
- **Skills**: trigger-clarity description; references/ are 1-deep (validated by `npm run validate:no-deep-refs`)
- **Tests**: `node:test`; `tests/*.test.mjs`
- **No native deps**: pure JS / WASM / SQLite. **No Docker. No external services.**

---

## RAG + Memory + Code Graph (recommended workflow)

For consistent quality, agents are encouraged to follow this order:

1. **Memory pre-flight** — when practical, check `supervibe:project-memory --query "<topic>"` before producing artifacts. This helps reuse past decisions.
2. **Code search** — `supervibe:code-search` before writing new code helps understand existing patterns.
3. **Code graph (refactor only)** — `--callers <symbol>` before rename/extract/move/delete helps catch all call sites.

**Hook assistance** (when the plugin is active):
- `UserPromptSubmit` hook may run memory pre-flight on technical prompts and attach matches as `additionalContext`
- `PreToolUse` hook may detect refactor patterns in Edit/Write and suggest `--callers` (advisory only, never blocks)
- `PostToolUse` hook may log per-agent sub-tool usage for optional later review

**Optional audit:** `npm run audit:evidence` reports per-agent memory/code-search/graph usage rates.

## When in doubt

1. **Re-read this file** — likely answer is the routing table or a tracked docs/source pointer above
2. **Read the specific `docs/<topic>.md` or source module** — they encode the discipline without shipping local `.claude/` state
3. **Run `npm run supervibe:status`** — see real index state
4. **Read the specific agent** from `agents/<namespace>/`
5. **Read the relevant rule** from `rules/`
6. **Search memory**: `node $CLAUDE_PLUGIN_ROOT/scripts/search-memory.mjs --query "<topic>"` — past decisions
7. **Search code**: `node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --query "<concept>"` — existing patterns
8. **Read full docs**: `docs/getting-started.md`

---

## References

- **`README.md`** — human-facing intro, install instructions, troubleshooting
- **`docs/getting-started.md`** — extended verified install + per-feature usage
- **`docs/confidence-gates-spec.md`** — unified gate semantics across commands + skills
- **`docs/agent-authoring.md`** — guide for writing new agents
- **`docs/skill-authoring.md`** — guide for writing new skills
- **`docs/rule-authoring.md`** — guide for writing new rules
- **`CHANGELOG.md`** — version history
