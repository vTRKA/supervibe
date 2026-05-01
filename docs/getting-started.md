# Getting Started with Supervibe

## Autonomous Loop

Use `/supervibe-loop` when you want a bounded agent loop over an existing plan
or an open validation request.

```bash
npm run supervibe:loop -- --dry-run --request "validate integrations"
npm run supervibe:loop -- --plan docs/plans/payment-integration.md
```

The loop runs preflight first, asks for missing server or access references
when needed, records state under `.claude/memory/loops/<run-id>/`, and only
completes tasks at score `>= 9.0`. Production deploy, destructive migration,
credential mutation, billing, account, DNS, and remote server mutations require
explicit approval.

Supervibe is a multi-CLI agent framework with specialist agents, code graph,
project memory, confidence gates, and stack-aware scaffolding backed by SQLite.

## Requirements

- **Claude Code** (latest)
- **Node.js 22.5+** for SQLite-backed semantic RAG, code graph, project memory, agent task memory, and full `npm run check`. The installer can offer to install/upgrade Node with explicit consent.
- **Git**
- **Git LFS** *(recommended, not required)* — the embedding model (`model_quantized.onnx`, 113 MB) is stored via Git LFS because GitHub cannot store it as a normal blob. The installer still requires the model before registration: it tries bounded Git LFS first, then downloads the ONNX file directly from HuggingFace (~118 MB) if LFS is unavailable or incomplete.
  - Check: `git lfs version` (should print `git-lfs/X.Y.Z ...`)
  - Install: macOS `brew install git-lfs`; Windows already bundled with Git for Windows ≥2.x; Linux see [git-lfs.com](https://git-lfs.com)
  - After install (once per machine): `git lfs install`

## Install (verified)

The maintained install path is the repo installer. It detects supported AI CLIs,
checks Node.js before registration, cleans stale files from an existing managed
checkout, rebuilds `registry.yaml`, runs the full validation path, and wires the
plugin into the available targets.

### Option A — Installer (recommended for users)

macOS / Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/vTRKA/supervibe/main/install.sh | bash
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/vTRKA/supervibe/main/install.ps1 | iex
```

### Option B — Local install (current; for early adopters and developers)

```bash
# 1. Clone or download Supervibe
git clone https://github.com/your-org/supervibe ~/dev/supervibe   # or download archive
cd ~/dev/supervibe

# 2. Install Node deps for dev tooling (validates structure, runs tests)
nvm use     # uses the repo runtime from .nvmrc; Node 22.5+ is required for SQLite-backed features and full checks
npm install
npm run check    # all validators, audits, dead-code checks, and tests must pass

# 3. Install to Claude Code plugins cache
# Path pattern: ~/.claude/plugins/cache/<marketplace>/<name>/<version>/
# For local-dev: marketplace = "local"

# Linux/Mac:
mkdir -p ~/.claude/plugins/cache/local
cp -r ~/dev/supervibe ~/.claude/plugins/cache/local/supervibe/2.0.15

# Windows (PowerShell):
mkdir $HOME\.claude\plugins\cache\local\supervibe\2.0.15
xcopy /E /I "D:\ggsel projects\supervibe" "$HOME\.claude\plugins\cache\local\supervibe\2.0.15"

# Or symlink (avoids re-copy on updates):
# Linux/Mac:
ln -s ~/dev/supervibe ~/.claude/plugins/cache/local/supervibe/2.0.15
# Windows (admin shell):
mklink /D "$HOME\.claude\plugins\cache\local\supervibe\2.0.15" "D:\ggsel projects\supervibe"

# 4. Restart Claude Code session
# Plugin auto-loads from cache.
# Verify: type /supervibe — should respond with auto-detect dispatcher
```

### Verify install

After restart, in a Claude Code session:

```
/supervibe
```

Expected response: orchestrator analyzes current project state and proposes next phase (e.g., "/supervibe-genesis if `.claude/agents/` empty").

From the plugin checkout, the lifecycle audit should also be green:

```bash
npm run supervibe:install-doctor
```

If `/supervibe` not recognized:
- Check `~/.claude/plugins/cache/local/supervibe/2.0.15/.claude-plugin/plugin.json` exists
- Verify `agents` field is array (not string) and paths begin with `./agents/`
- Run `npm run validate:plugin-json` from plugin dir

For Zed sessions that use Codex ACP, the `/` palette is controlled by `codex-acp`, not by Supervibe's command docs. Re-run the installer so Codex has `~/.codex/plugins/cache/supervibe-marketplace/supervibe/local`, `[plugins."supervibe@supervibe-marketplace"]` in `~/.codex/config.toml`, the legacy `~/.codex/plugins/supervibe` link, and `~/.agents/skills/supervibe`; restart the Zed external-agent session, then run `npm run supervibe:doctor -- --host codex --strict` from the plugin checkout if prompts still do not route.

## Your First Project (5 minutes)

### 1. Empty project

```bash
mkdir my-saas && cd my-saas
git init
```

### 2. Open Claude Code in this dir

The orchestrator detects empty `.claude/` and proposes:

```
📊 Discovered: empty project (no .claude/agents/, no CLAUDE.md routing)
⚡ Recommend: /supervibe-genesis
🎯 Why: bootstrap stack-aware scaffold from empty repo
⏭ Run? (y/n)
```

Type `y`.

### 3. Discovery questionnaire

`supervibe:stack-discovery` asks one question at a time:

- "What are you building?" → `web-app`
- "Backend stack?" → `laravel`
- "Frontend stack?" → `nextjs`
- "Primary data store?" → `postgres`
- "Infrastructure features?" → `redis-cache`, `queue`
- ... (architecture, design, testing, deployment)

### 4. Genesis

`supervibe:genesis` composes the matching pack (`laravel-nextjs-postgres-redis`):

- Copies all 32 attached agents to `.claude/agents/`
- Copies all 16 attached rules to `.claude/rules/`
- Generates `.claude/settings.json` with full deny-list (50+ entries)
- Generates `CLAUDE.md` with routing table for all 32 agents
- Sets up husky + commitlint + lint-staged
- Creates skeleton dirs: `backend/`, `frontend/`, `prototypes/`, `docs/`

After ~30-60 seconds: scaffolded project ready.

### 5. First feature

Tell Claude: "Add a user-billing module with subscription plans."

Orchestrator proposes:
> ⚡ Recommend: supervibe:requirements-intake (complexity ≥4)

Type `y`. The framework chains:
1. **`supervibe:project-memory`** searches prior decisions (empty for first task)
2. **`supervibe:requirements-intake`** asks clarifying questions
3. **`supervibe:brainstorming`** (if complexity ≥7) → spec
4. **`supervibe:explore-alternatives`** for any decision complexity ≥5
5. **`supervibe:writing-plans`** → phased plan
6. **`supervibe:executing-plans`** → executes with TDD per task
7. **`supervibe:_core:code-reviewer`** → review across 8 dimensions
8. **`supervibe:_core:quality-gate-reviewer`** → final ≥9 gate
9. **`supervibe:add-memory`** → records this decision for future

Every artifact confidence-scored ≥9 before progression. If a gate blocks and the user accepts the risk, the caller records an explicit override reason.

## Command reference

| Command | What it does |
|---------|--------------|
| `/supervibe` | Auto-detect dispatcher; suggests next phase |
| `/supervibe-genesis` | Bootstrap empty project with stack-pack |
| `/supervibe-audit` | Health-check artifacts (stale/weak/coverage) |
| `/supervibe-strengthen` | Deepen weak agents/skills/rules |
| `/supervibe-adapt` | Sync to stack changes (new modules/deps) |
| `/supervibe-score <type> [path]` | Score artifact against rubric |
| `/supervibe-score --record <type> [path]` | Score artifact and update telemetry |

## MCP integration (optional but recommended)

Plugin agents have `recommended-mcps:` frontmatter for capability boost:

| MCP | Boosts which agents |
|-----|---------------------|
| `context7` | All stack devs (laravel/nextjs/fastapi/react), researchers — current API docs |
| `figma` | creative-director, ux-ui-designer, prototype-builder — design files |
| `playwright` | qa-test-engineer, accessibility-reviewer, ui-polish-reviewer — browser automation |
| `firecrawl` | researchers — scraping/searching authoritative sources |

`supervibe:mcp-discovery` skill detects available MCPs and proactively maps them. Without MCPs, agents fall back to WebFetch (slower, limited).

## Memory system (SQLite FTS5)

After completing significant work (decision, fix, pattern), the framework writes to `.claude/memory/`:

```
.claude/memory/
├── memory.db               # SQLite FTS5 index (gitignored, auto-rebuild)
├── decisions/              # Architecture / library / pattern choices
├── patterns/               # Reusable patterns established
├── incidents/              # Postmortems
├── learnings/              # Project insights
└── solutions/              # How-we-solved-X catalog
```

Each entry = markdown with frontmatter (id/type/date/tags/related/agent/confidence).

**Search** (BM25-ranked, sub-second):
```bash
node $CLAUDE_PLUGIN_ROOT/scripts/search-memory.mjs \
  --query "billing idempotency" \
  --tags billing,redis \
  --type decision \
  --limit 5
```

**Rebuild index** (idempotent, after manual edits):
```bash
node $CLAUDE_PLUGIN_ROOT/scripts/build-memory-index.mjs
```

**Add entry** (typically auto-invoked by `quality-gate-reviewer`): use `supervibe:add-memory` skill — writes markdown + auto-rebuilds index.

## Code Search (RAG over your source code)

Beyond markdown memory, Supervibe indexes your source code for semantic search. This runs transparently — agents use it under the hood; you don't manage it directly.

```bash
# One-time full index (after install or major refactor)
node $CLAUDE_PLUGIN_ROOT/scripts/build-code-index.mjs

# Manual semantic search (optional — agents auto-invoke this)
node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --query "where authentication is handled"

# Agent-ready context pack (RAG chunks + graph + anchors)
node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --context "auth login flow" --limit 8
```

**What gets indexed:** `.ts/.tsx/.js/.jsx/.py/.php/.rs/.go/.java/.rb/.vue/.svelte`. Skips `node_modules/`, `dist/`, `.next/`, `__pycache__/`, etc.

**Why this matters:** Agents (laravel-developer, nextjs-developer, fastapi-developer, react-implementer, repo-researcher) auto-search code before non-trivial tasks. Result: less hallucination, more reuse of existing patterns, faster orientation in unfamiliar parts of the codebase.

**Auto-index on changes:** Three paths, all automatic by default:

1. **Pseudo-watcher (in-session)** — `PostToolUse` hook on `Write|Edit` re-indexes touched files in ~50–500ms each. Covers source code (RAG + Graph in `code.db`) AND memory entries (`.claude/memory/**/*.md` → FTS5 in `memory.db`). Embeddings skipped for speed.
2. **mtime-scan on SessionStart** — catches files changed BETWEEN sessions (VS Code, `git pull`, CI). Cheap stat() over existing index rows; only reads files whose mtime advanced. Output line: `[supervibe] mtime-scan: N reindexed, M removed`.
3. **Watcher daemon (optional)** — `npm run memory:watch` for real-time updates while editing in parallel during long sessions. Chokidar long-running with embeddings.

For ~99% of users (1) + (2) cover everything without any extra setup. Daemon is opt-in.

Env knobs: `SUPERVIBE_HOOK_NO_INDEX=1` disables pseudo-watcher; `SUPERVIBE_HOOK_EMBED=1` enables embeddings in it (slower per Edit). Without any path: re-run `npm run code:index` after major changes.

**Storage:** `.claude/memory/code.db` (SQLite, gitignored). Hash-based dedup means re-indexing is fast.

## Code Graph (structural relationships)

Beyond semantic similarity, Supervibe builds a **code graph** of symbols (functions, classes, methods, types) and their relationships (calls, imports, inheritance). Agents query this for "who calls X?", "what depends on Y?", "what breaks if I rename Z?".

This is automatic — built on first session via SessionStart hook, kept fresh by the same pseudo-watcher (PostToolUse hook) that updates RAG. Symbols + edges refresh on every `Write`/`Edit` without any daemon.

```bash
# Status check (built into SessionStart, also runnable manually)
npm run supervibe:status

# Manual graph queries (agents auto-invoke these)
node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --callers "loginHandler"
node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --callees "BillingService"
node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --impact "BillingService" --depth 2
node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --neighbors "AuthMiddleware" --depth 2
node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --symbol-search "AuthMiddleware"
node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --files "src/app"
node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --top-symbols 20
```

**Storage:** same `.claude/memory/code.db` — extra `code_symbols` + `code_edges` tables.

**Languages:** TypeScript, JavaScript, TSX, JSX, Python, PHP, Go, Rust, Java, Ruby, Vue, and Svelte.

**Coverage realism:** same-file, import-map, same-directory, and unique-symbol scoring resolve cross-file calls. Ambiguous same-name edges stay unresolved instead of being guessed, so impact analysis favors lower false confidence over noisy links.

**Large monorepos:** for 10k+ files, use lazy mode:
```bash
npm run code:index -- --since=HEAD~100   # only files changed in last 100 commits
```

**Discipline (enforced by `rules/use-codegraph-before-refactor.md`):** before any rename / extract / move / delete of a public symbol, agents MUST run `--callers` first. The 3-case Graph evidence template (Case A: callers found / Case B: zero verified / Case C: N/A) is shown in every agent output that touches public surface.

## Preview Server (live mockup hosting)

Когда design / prototype агенты генерируют HTML/CSS, плагин может запустить локальный сервер `http://localhost:NNNN` с **auto-reload** — пользователь открывает в браузере, агент правит файлы, страница обновляется автоматически.

**Запуск вручную:**

```bash
# Из проекта где лежат мокапы:
npm run supervibe:preview -- --root mockups/checkout

# Output:
# [supervibe-preview] checkout → http://localhost:3047
# [supervibe-preview] hot-reload: on
```

**Список запущенных:**

```bash
npm run supervibe:preview -- --list
```

**Kill:**

```bash
npm run supervibe:preview -- --kill 3047
# or
npm run supervibe:preview -- --kill-all
```

**Что под капотом:**
- Pure `node:http` + Server-Sent Events (SSE) — никаких новых dep
- chokidar следит за файлами, на change → SSE push → `location.reload()` в браузере
- Реестр `.claude/memory/preview-servers.json` чтобы статус-команда и другие сессии видели запущенные серверы
- 127.0.0.1 only — без network access
- SIGINT cleanup на завершение сессии
- Idle-shutdown после 30 мин неактивности (--idle-timeout configurable)
- Max 10 параллельных серверов (--force чтобы превысить)

**Использование агентами:**
- `prototype-builder` агент автоматически дёргает skill `supervibe:preview-server` после генерации мокапа
- `supervibe:landing-page` skill — то же
- `supervibe:interaction-design-patterns` skill — то же
- Агент печатает URL пользователю в output: "**Preview ready:** http://localhost:3047"

**Опциональная интеграция с Playwright MCP:**
Если у пользователя есть Playwright MCP, skill после спавна сервера может:
- Открыть URL в browser
- Сделать скриншот → `.claude/memory/previews/<label>-<timestamp>.png`
- Прикрепить в output агента как evidence

## Reference document templates

В `docs/templates/` лежат скелеты для всех типов проектных документов:

| Файл | Скилл | Что внутри |
|------|-------|------------|
| `PRD-template.md` | `supervibe:prd` | Полный PRD с Gherkin ACs / metrics / launch checklist |
| `ADR-template.md` | `supervibe:adr` | Architecture decision с alternatives matrix + review trigger |
| `plan-template.md` | `supervibe:writing-plans` | TDD план с critical path + parallelization batches |
| `RFC-template.md` | RFC для cross-team | Motivation + detailed design + prior art |
| `brainstorm-output-template.md` | `supervibe:brainstorming` | First-principle decomp + decision matrix |
| `intake-template.md` | `supervibe:requirements-intake` | Personas + constraints + success criteria |

Скиллы автоматически заполняют эти шаблоны и проверяют что все обязательные секции присутствуют. Запустить вручную можно скопировав шаблон в `docs/specs/YYYY-MM-DD-<topic>-<type>.md` и наполнив.

## Agent evolution loop

Plugin telemetry watches every subagent dispatch and surfaces degradation automatically:

| Component | Path |
|-----------|------|
| Invocation log (JSONL) | `.claude/memory/agent-invocations.jsonl` |
| Logger | `scripts/lib/agent-invocation-logger.mjs` |
| `PostToolUse` hook | `scripts/hooks/post-tool-use-log.mjs` (matcher `Task`) |
| Effectiveness tracker | `scripts/effectiveness-tracker.mjs` (runs on `Stop`) |
| Underperformer detector | `scripts/lib/underperformer-detector.mjs` |
| Auto-strengthen trigger | `scripts/lib/auto-strengthen-trigger.mjs` |

**How it closes the loop:** every `Task` call → logged with extracted confidence score → on session stop, frontmatter `effectiveness:` blocks updated per agent → on next SessionStart, agents with `avg-confidence < 8.5` or rising override-rate are shown in the banner → user runs `/supervibe-strengthen` (with or without explicit agent_id) → confirms diff per agent → improvements persist.

**Inspect:** `npm run supervibe:status` shows current telemetry counts + flagged agents.

**No surprises:** strengthen never modifies agent files without explicit user confirmation. Detector requires ≥10 invocations before flagging.

## Troubleshooting

### `/supervibe` not recognized after install

1. Confirm path: `ls ~/.claude/plugins/cache/local/supervibe/2.0.15/.claude-plugin/plugin.json`
2. Validate manifest: `cd <plugin-dir> && npm run validate:plugin-json`
3. Restart Claude Code session (plugins load at startup)
4. Check `~/.claude/plugins/installed_plugins.json` lists supervibe

### Zed/Codex ACP slash palette does not list Supervibe

This is a Codex ACP command-advertising limitation, not a missing local Zed setting. Codex currently supports Supervibe through plugin cache/config plus native skills, while `codex-acp` sends Zed a fixed built-in slash-command list. Supervibe's installer therefore also enables `supervibe@supervibe-marketplace` in `~/.codex/config.toml` and links native skills into `~/.agents/skills/supervibe`.

Verify the Codex side:

```bash
npm run supervibe:doctor -- --host codex --strict
```

Expected Codex checks include `local-registration`, `codex-plugin-config`, `codex-native-skills`, and an informational `codex-acp-slash-palette` note.

### Agents not loading

- Verify `agents:[]` array in `.claude-plugin/plugin.json` lists actual file paths
- Each path must start with `./agents/` and end `.md`
- Run `npm run validate:frontmatter` — every agent file must have valid frontmatter

### SQLite memory errors

- Requires Node 22.5+ for SQLite-backed features (`node:sqlite`)
- Check version: `node --version`
- If <22.5: re-run the installer and approve the Node upgrade prompt, or upgrade Node manually before installing

### Genesis fails partway

- Check `.claude/confidence-log.jsonl` for last successful step
- Don't manually clean up — re-run `/supervibe-genesis`; it skips existing files
- If broken: `mv .claude .claude.bak` and start fresh

### Windows path issues

- Use forward slashes in scripts (Node normalizes)
- Avoid spaces in install path if possible (or quote everywhere)
- Husky hooks may need `git config core.autocrlf input` for cross-platform

### Plugin updates breaking existing scaffolds

- v1.x → v1.x updates: safe; rules/agents may be re-strengthened
- v1.x → v2.x: breaking changes possible; backup `.claude/` first
- Generated `.claude/` in target projects is independent — won't break on plugin update

## Uninstall

```bash
# Remove plugin from cache
rm -rf ~/.claude/plugins/cache/local/supervibe

# Remove from installed_plugins.json (manual edit OR Claude Code UI)
# /plugin uninstall supervibe   # if marketplace install was used

# Per-project cleanup (only if removing Supervibe from a specific project):
rm -rf <project>/.claude/agents
rm -rf <project>/.claude/rules
rm -rf <project>/.claude/skills
# Keep .claude/settings.json + memory + confidence-log if you want
```

## Upgrade guide

### v1.0 → v1.1

- New: `supervibe:project-memory`, `supervibe:add-memory`, `supervibe:mcp-discovery`, `supervibe:explore-alternatives`, `supervibe:interaction-design-patterns`, `supervibe:tokens-export`
- New rules: `no-hardcode`, `no-half-finished`
- Stack agents got `WebFetch` + `recommended-mcps` frontmatter
- **No action needed** — just update plugin version in install path

### v1.1 → v1.2

- **Plugin manifest now requires `agents:[]` array** for nested agent dirs to work
  - Manifest auto-updated; ensure your install path has v2.0.15
- **Memory v2: SQLite FTS5** replaces markdown+grep
  - Old v1 markdown files still work as source of truth
  - First search auto-builds SQLite index from existing markdown
  - **Requires Node 22.5+** for `node:sqlite`; installation stops until this runtime is available
- New: `scripts/search-memory.mjs` CLI
- **Action**: re-symlink to v2.0.15 dir, restart Claude Code

## Where to next

- `CONTRIBUTING.md` — add agents/skills/rules
- `docs/skill-authoring.md` — write a new skill
- `docs/agent-authoring.md` — write a new agent
- `docs/rule-authoring.md` — write a new rule
- `docs/specs/2026-04-27-supervibe-framework-design.md` — full architecture spec
- GitHub issues for support
