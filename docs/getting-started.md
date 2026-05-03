# Getting Started with Supervibe

## Autonomous Loop

Use `/supervibe-loop` when you want a bounded agent loop over an existing plan
or an open validation request.

```bash
npm run supervibe:loop -- --dry-run --request "validate integrations"
npm run supervibe:loop -- --plan .supervibe/artifacts/plans/payment-integration.md
```

The loop runs preflight first, asks for missing server or access references
when needed, records state under `.supervibe/memory/loops/<run-id>/`, and only
completes tasks at score `>= 9.0`. Production deploy, destructive migration,
credential mutation, billing, account, DNS, and remote server mutations require
explicit approval.

Supervibe is a multi-CLI agent framework with specialist agents, code graph,
project memory, confidence gates, and stack-aware scaffolding backed by SQLite.

## Requirements

- **Claude Code** (latest)
- **Node.js 22.5+** for SQLite-backed semantic RAG, code graph, project memory, and agent task memory. The installer can offer to install/upgrade Node with explicit consent.
- **Git**
- **HuggingFace network access for the embedding model**. `model_quantized.onnx` is not stored in git. The installer first reuses an already-ready local ONNX file, otherwise downloads it from HuggingFace (~118 MB) with no total timeout and no stall timeout.

## Install (verified)

The maintained install path is the repo installer. It detects supported AI CLIs,
checks Node.js before registration, cleans stale files from an existing managed
checkout, verifies the checkout mirror after update, rebuilds `registry.yaml`,
runs the install lifecycle doctor, and wires the plugin into the available
targets. User install/update scripts intentionally do not run the developer
test suite; `npm run check` stays manual/CI-only.

### Option A  Installer (recommended for users)

macOS / Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/vTRKA/supervibe/main/install.sh | bash
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/vTRKA/supervibe/main/install.ps1 | iex
```

### Option B  Local install (current; for early adopters and developers)

```bash
# 1. Clone or download Supervibe
git clone https://github.com/vTRKA/supervibe ~/dev/supervibe   # or download archive
cd ~/dev/supervibe

# 2. Install Node deps for dev tooling (validates structure, runs tests)
nvm use     # uses the repo runtime from .nvmrc; Node 22.5+ is required for SQLite-backed features and full checks
npm install
npm run check    # all validators, audits, dead-code checks, and tests must pass
npm run supervibe:install-bins    # optional on Linux/Mac: links supervibe-* terminal aliases into ~/.local/bin

# 3. Install to Claude Code plugins cache
# Path pattern: ~/.claude/plugins/cache/<marketplace>/<name>/<version>/
# For local-dev: marketplace = "local"

# Linux/Mac:
mkdir -p ~/.claude/plugins/cache/local
cp -r ~/dev/supervibe ~/.claude/plugins/cache/local/supervibe/2.0.59

# Windows (PowerShell):
mkdir $HOME\.claude\plugins\cache\local\supervibe\2.0.59
xcopy /E /I "C:\path\to\supervibe" "$HOME\.claude\plugins\cache\local\supervibe\2.0.59"

# Or symlink (avoids re-copy on updates):
# Linux/Mac:
ln -s ~/dev/supervibe ~/.claude/plugins/cache/local/supervibe/2.0.59
# Windows (admin shell):
mklink /D "$HOME\.claude\plugins\cache\local\supervibe\2.0.59" "C:\path\to\supervibe"

# 4. Restart Claude Code session
# Plugin auto-loads from cache.
# Verify: type /supervibe  should respond with auto-detect dispatcher
```

### Verify install

After restart, in a Claude Code session:

```
/supervibe
```

Expected response: orchestrator analyzes current project state and proposes next phase (e.g., "/supervibe-genesis" if no Supervibe host adapter scaffold exists).

From the plugin checkout, the lifecycle audit should also be green:

```bash
npm run supervibe:install-doctor
supervibe-adapt --help    # Linux/Mac terminal alias, no leading slash
```

If `/supervibe` not recognized:
- Check `~/.claude/plugins/cache/local/supervibe/2.0.59/.claude-plugin/plugin.json` exists
- Verify `agents` field is array (not string) and paths begin with `./agents/`
- Run `npm run validate:plugin-json` from plugin dir

For Zed sessions that use Codex ACP, the `/` palette is controlled by `codex-acp`, not by Supervibe's command docs. Re-run the installer so Codex has `~/.codex/plugins/cache/supervibe-marketplace/supervibe/local`, `[plugins."supervibe@supervibe-marketplace"]` in `~/.codex/config.toml`, the legacy `~/.codex/plugins/supervibe` link, and `~/.agents/skills/supervibe`; restart the Zed external-agent session, then run `npm run supervibe:doctor -- --host codex --strict` from the plugin checkout if prompts still do not route.

## Your First Project (5 minutes)

### 1. Empty project

```bash
mkdir my-saas && cd my-saas
git init
```

### 2. Open your AI CLI in this dir

The orchestrator detects that no Supervibe host scaffold exists and proposes:

```
 Discovered: empty project (no Supervibe host adapter folders or managed instruction block)
 Recommend: /supervibe-genesis
 Why: bootstrap stack-aware scaffold from empty repo
 Run? (y/n)
```

Type `y`.

### 3. Discovery questionnaire

`supervibe:stack-discovery` asks one question at a time:

- "What are you building?"  `web-app`
- "Backend stack?"  `laravel`
- "Frontend stack?"  `nextjs`
- "Primary data store?"  `postgres`
- "Infrastructure features?"  `redis-cache`, `queue`
- ... (architecture, design, testing, deployment)

### 4. Genesis

`supervibe:genesis` composes the matching pack (`laravel-nextjs-postgres-redis`):

- Copies attached agents to the selected host adapter agents folder
- Copies attached rules to the selected host adapter rules folder
- Generates the selected host settings file when supported
- Generates or updates the selected host instruction surface through the active adapter
- Sets up husky + commitlint + lint-staged
- Creates skeleton dirs: `backend/`, `frontend/`, `.supervibe/artifacts/prototypes/`, `docs/`

After ~30-60 seconds: scaffolded project ready.

### 5. First feature

Tell Claude: "Add a user-billing module with subscription plans."

Orchestrator proposes:
>  Recommend: supervibe:requirements-intake (complexity 4)

Type `y`. The framework chains:
1. **`supervibe:project-memory`** searches prior decisions (empty for first task)
2. **`supervibe:requirements-intake`** asks clarifying questions
3. **`supervibe:brainstorming`** (if complexity 7)  spec
4. **`supervibe:explore-alternatives`** for any decision complexity 5
5. **`supervibe:writing-plans`**  phased plan
6. **`supervibe:executing-plans`**  executes with TDD per task
7. **`supervibe:_core:code-reviewer`**  review across 8 dimensions
8. **`supervibe:_core:quality-gate-reviewer`**  final 9 gate
9. **`supervibe:add-memory`**  records this decision for future

Every artifact confidence-scored 9 before progression. If a gate blocks and the user accepts the risk, the caller records an explicit override reason.

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
| `context7` | All stack devs (laravel/nextjs/fastapi/react), researchers  current API docs |
| `figma` | creative-director, ux-ui-designer, prototype-builder  design files |
| `playwright` | qa-test-engineer, accessibility-reviewer, ui-polish-reviewer  browser automation |
| `firecrawl` | researchers  scraping/searching authoritative sources |

`supervibe:mcp-discovery` skill detects available MCPs and proactively maps them. Without MCPs, agents fall back to WebFetch (slower, limited).

The MCP broker records capabilities and risk classes instead of treating tools
as host-specific names. Inspect it with `node
<resolved-supervibe-plugin-root>/scripts/discover-mcps.mjs`. Tool descriptions
must state purpose, inputs, side effects, auth, failure modes, examples, and
cost before agents should rely on them for high-confidence execution.

## Runtime Doctor And Context MCP

For a beginner-safe dry run, use:

```bash
node <resolved-supervibe-plugin-root>/scripts/supervibe-runtime-doctor.mjs --dry-run
```

It checks Node SQLite readiness, stack-pack/registry presence, scaffold
readiness, likely dev-server command, smoke-test status, optional browser/MCP
capability, and the next repair action without mutating the project.

Optional read-only context export is available for MCP-aware hosts:

```bash
node <resolved-supervibe-plugin-root>/scripts/supervibe-context-mcp.mjs --self-test
```

The first version exposes read-only memory, Code RAG, CodeGraph, host context,
and tool metadata resources only.

## Memory system (SQLite FTS5)

After completing significant work (decision, fix, pattern), the framework writes to `.supervibe/memory/`:

```
.supervibe/memory/
 memory.db               # SQLite FTS5 index (gitignored, auto-rebuild)
 decisions/              # Architecture / library / pattern choices
 patterns/               # Reusable patterns established
 incidents/              # Postmortems
 learnings/              # Project insights
 solutions/              # How-we-solved-X catalog
```

Each entry = markdown with frontmatter (id/type/date/tags/related/agent/confidence).

**Search** (BM25-ranked, sub-second):
```bash
node <resolved-supervibe-plugin-root>/scripts/search-memory.mjs \
  --query "billing idempotency" \
  --tags billing,redis \
  --type decision \
  --limit 5
```

**Rebuild index** (idempotent, after manual edits):
```bash
node <resolved-supervibe-plugin-root>/scripts/build-memory-index.mjs
```

**Add entry** (typically auto-invoked by `quality-gate-reviewer`): use `supervibe:add-memory` skill  writes markdown + auto-rebuilds index.

## Code Search (RAG over your source code)

Beyond markdown memory, Supervibe indexes your source code for semantic search. This runs transparently  agents use it under the hood; you don't manage it directly.

```bash
# Source RAG readiness after install or on a large existing project
node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --resume --source-only --max-files 200 --max-seconds 120 --health --json-progress

# Build or repair Code Graph separately after source coverage is healthy
node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --resume --graph --max-files 200 --health

# Inspect and batch-repair partial indexes after an abort/timeout
node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --list-missing
node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --resume --source-only --max-files 200 --max-seconds 120 --health --json-progress

# Manual semantic search (optional  agents auto-invoke this)
node <resolved-supervibe-plugin-root>/scripts/search-code.mjs --query "where authentication is handled"

# Agent-ready context pack (RAG chunks + graph + anchors)
node <resolved-supervibe-plugin-root>/scripts/search-code.mjs --context "auth login flow" --limit 8
```

**What gets indexed:** `.ts/.tsx/.js/.jsx/.py/.php/.rs/.go/.java/.rb/.vue/.svelte`. Skips `node_modules/`, `bower_components/`, `site-packages/`, `dist/`, `.next/`, `.nuxt/`, `.svelte-kit/`, `__pycache__/`, `Pods/`, `bin/`, `obj/`, and generated/cache folders.

**Large projects:** use `--max-files` and `--max-seconds` for bounded atomic batches. The indexer blocks duplicate runs with `.supervibe/memory/code-index.lock`, removes stale locks whose PID is gone, prints heartbeat lines with stage/current file/progress (`SUPERVIBE_INDEX_HEARTBEAT_SECONDS` or `--heartbeat-seconds`), emits machine-readable `SUPERVIBE_INDEX_PROGRESS` lines with `--json-progress`, and persists `.supervibe/memory/code-index-checkpoint.json` after each file/batch. Tune completed-file progress with `SUPERVIBE_INDEX_PROGRESS_EVERY` or `--progress-every`. Graph warnings do not fail default source RAG readiness when source coverage is healthy; `--strict-index-health` is for explicit graph audits.

**Repair diagnostics:** `--max-seconds` is a hard watchdog, including the first
active file. For language-specific repair use `--language rust`, `--language
python`, `--path src-tauri/src`, or `--file <path>`. For one-file diagnosis use
`--debug-file <path> --trace-phases --verbose`; checkpoints separate
`selectionFile` from `activeIndexFile`, and failures are written to
`.supervibe/memory/failed_files.json`. If a killed process leaves a lock, run
`node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root .
--clean-stale-lock` before resuming.

**Why this matters:** Agents (laravel-developer, nextjs-developer, fastapi-developer, react-implementer, repo-researcher) auto-search code before non-trivial tasks. Result: less hallucination, more reuse of existing patterns, faster orientation in unfamiliar parts of the codebase.

**Auto-index on changes:** Three paths, all automatic by default:

1. **Pseudo-watcher (in-session)**  `PostToolUse` hook on `Write|Edit` re-indexes touched files in ~50500ms each. Covers source code (RAG + Graph in `code.db`) AND memory entries (`.supervibe/memory/**/*.md`  FTS5 in `memory.db`). Embeddings skipped for speed.
2. **mtime-scan on SessionStart**  catches files changed BETWEEN sessions (VS Code, `git pull`, CI). Cheap stat() over existing index rows; only reads files whose mtime advanced. Output line: `[supervibe] mtime-scan: N reindexed, M removed`.
3. **Watcher daemon (optional)**  `npm run memory:watch` for real-time updates while editing in parallel during long sessions. Chokidar reacts to file events immediately and runs a 5-minute safety scan for missed changes. Chokidar long-running with embeddings.

For ~99% of users (1) + (2) cover everything without any extra setup. Daemon is opt-in.

Env knobs: `SUPERVIBE_HOOK_NO_INDEX=1` disables pseudo-watcher; `SUPERVIBE_HOOK_EMBED=1` enables embeddings in it (slower per Edit). Project-owned indexing exclusions live in `.supervibe/memory/index-config.json`. Without any path: re-run `npm run code:index` after major changes.

**Storage:** `.supervibe/memory/code.db` (SQLite, gitignored). Hash-based dedup means re-indexing is fast.

## Code Graph (structural relationships)

Beyond semantic similarity, Supervibe builds a **code graph** of symbols (functions, classes, methods, types) and their relationships (calls, imports, inheritance). Agents query this for "who calls X?", "what depends on Y?", "what breaks if I rename Z?".

This is automatic  built on first session via SessionStart hook, kept fresh by the same pseudo-watcher (PostToolUse hook) that updates RAG. Symbols + edges refresh on every `Write`/`Edit` without any daemon.

```bash
# Status check (built into SessionStart, also runnable manually)
npm run supervibe:status

# Manual graph queries (agents auto-invoke these)
node <resolved-supervibe-plugin-root>/scripts/search-code.mjs --callers "loginHandler"
node <resolved-supervibe-plugin-root>/scripts/search-code.mjs --callees "BillingService"
node <resolved-supervibe-plugin-root>/scripts/search-code.mjs --impact "BillingService" --depth 2
node <resolved-supervibe-plugin-root>/scripts/search-code.mjs --neighbors "AuthMiddleware" --depth 2
node <resolved-supervibe-plugin-root>/scripts/search-code.mjs --symbol-search "AuthMiddleware"
node <resolved-supervibe-plugin-root>/scripts/search-code.mjs --files "src/app"
node <resolved-supervibe-plugin-root>/scripts/search-code.mjs --top-symbols 20
```

**Storage:** same `.supervibe/memory/code.db`  extra `code_symbols` + `code_edges` tables.

**Languages:** TypeScript, JavaScript, TSX, JSX, Python, PHP, Go, Rust, Java, Ruby, Vue, and Svelte.

**Coverage realism:** same-file, import-map, same-directory, and unique-symbol scoring resolve cross-file calls. Ambiguous same-name edges stay unresolved instead of being guessed, so impact analysis favors lower false confidence over noisy links.

**Large monorepos:** for 10k+ files, use lazy mode:
```bash
npm run code:index -- --since=HEAD~100   # only files changed in last 100 commits
```

**Discipline (enforced by `rules/use-codegraph-before-refactor.md`):** before any rename / extract / move / delete of a public symbol, agents MUST run `--callers` first. The 3-case Graph evidence template (Case A: callers found / Case B: zero verified / Case C: N/A) is shown in every agent output that touches public surface.

## Preview Server (live mockup hosting)

Use the preview server when a design, prototype, or static HTML/CSS mockup needs a local browser URL with auto-reload and shareable evidence.

**Start:**

```bash
npm run supervibe:preview -- --root .supervibe/artifacts/mockups/checkout

# Output:
# [supervibe-preview] checkout  http://localhost:3047
# [supervibe-preview] hot-reload: on
```

**List active previews:**

```bash
npm run supervibe:preview -- --list
```

**Kill a preview:**

```bash
npm run supervibe:preview -- --kill 3047
# or
npm run supervibe:preview -- --kill-all
```

**Implementation details:**
- Pure `node:http` plus Server-Sent Events (SSE); no framework runtime is required.
- `chokidar` watches files and pushes `location.reload()` to the browser on changes.
- Active preview state is stored in `.supervibe/memory/preview-servers.json`.
- The server binds to `127.0.0.1` only by default.
- SIGINT cleanup removes preview state.
- Idle shutdown defaults to 30 minutes and can be changed with `--idle-timeout`.
- At most 10 previews run at once unless `--force` is passed.

**Skill integration:**
- `prototype-builder` can hand off to `supervibe:preview-server`.
- `supervibe:landing-page` uses the preview server for browser review.
- `supervibe:interaction-design-patterns` can capture motion and interaction evidence from the preview URL.
- Agent output should include the final preview URL, for example: `Preview ready: http://localhost:3047`.

**Playwright MCP evidence:**
When Playwright MCP is available, preview-aware skills should open the URL, capture screenshots into `.supervibe/memory/previews/<label>-<timestamp>.png`, and cite the screenshot path in their verification output.

## Reference document templates

Use `docs/templates/` for durable project artifacts:

| Template | Primary skill | Purpose |
|----------|---------------|---------|
| `PRD-template.md` | `supervibe:prd` | Product requirements with Gherkin acceptance criteria, metrics, and launch checklist |
| `ADR-template.md` | `supervibe:adr` | Architecture decision with alternatives matrix and review trigger |
| `plan-template.md` | `supervibe:writing-plans` | TDD implementation plan with critical path and parallelization batches |
| `RFC-template.md` | Cross-team RFC | Motivation, detailed design, and prior art |
| `brainstorm-output-template.md` | `supervibe:brainstorming` | First-principles decomposition and decision matrix |
| `intake-template.md` | `supervibe:requirements-intake` | Personas, constraints, and success criteria |

Store approved artifacts under `.supervibe/artifacts/specs/YYYY-MM-DD-<topic>-<type>.md`.

## Agent improvement loop

Plugin telemetry watches every subagent dispatch and surfaces degradation automatically:

| Component | Path |
|-----------|------|
| Invocation log (JSONL) | `.supervibe/memory/agent-invocations.jsonl` |
| Logger | `scripts/lib/agent-invocation-logger.mjs` |
| `PostToolUse` hook | `scripts/hooks/post-tool-use-log.mjs` (matcher `Task`) |
| Effectiveness tracker | `scripts/effectiveness-tracker.mjs` (runs on `Stop`) |
| Underperformer detector | `scripts/lib/underperformer-detector.mjs` |
| Auto-strengthen trigger | `scripts/lib/auto-strengthen-trigger.mjs` |

**How it closes the loop:** every `Task` call  logged with extracted confidence score  on session stop, frontmatter `effectiveness:` blocks updated per agent  on next SessionStart, agents with `avg-confidence < 8.5` or rising override-rate are shown in the banner  user runs `/supervibe-strengthen` (with or without explicit agent_id)  confirms diff per agent  improvements persist.

**Inspect:** `npm run supervibe:status` shows current telemetry counts + flagged agents.

**No surprises:** strengthen never modifies agent files without explicit user confirmation. Detector requires 10 invocations before flagging.

## Troubleshooting

### `/supervibe` not recognized after install

1. Confirm path: `ls ~/.claude/plugins/cache/local/supervibe/2.0.59/.claude-plugin/plugin.json`
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
- Run `npm run validate:frontmatter`  every agent file must have valid frontmatter

### SQLite memory errors

- Requires Node 22.5+ for SQLite-backed features (`node:sqlite`)
- Check version: `node --version`
- If <22.5: re-run the installer and approve the Node upgrade prompt, or upgrade Node manually before installing

### Genesis fails partway

- Check `.supervibe/confidence-log.jsonl` for last successful step
- Don't manually clean up  re-run `/supervibe-genesis`; it skips existing files
- If broken: move the selected host adapter folder aside and re-run genesis; keep `.supervibe/` if you want existing state

### Windows path issues

- Use forward slashes in scripts (Node normalizes)
- Avoid spaces in install path if possible (or quote everywhere)
- Husky hooks may need `git config core.autocrlf input` for cross-platform

### Plugin updates breaking existing scaffolds

- v1.x  v1.x updates: safe; rules/agents may be re-strengthened
- v1.x  v2.x: breaking changes possible; backup the selected host adapter folder and `.supervibe/` first
- Generated host adapter folders in target projects are independent  they won't break on plugin update

## Uninstall

```bash
# Remove plugin from cache
rm -rf ~/.claude/plugins/cache/local/supervibe

# Remove from installed_plugins.json (manual edit OR Claude Code UI)
# /plugin uninstall supervibe   # if marketplace install was used

# Per-project cleanup (only if removing Supervibe from a specific project):
rm -rf <project>/<adapter>/agents
rm -rf <project>/<adapter>/rules
rm -rf <project>/<adapter>/skills
# Keep .supervibe/ and host settings if you want local state/history
```

## Upgrade guide

### v1.0  v1.1

- New: `supervibe:project-memory`, `supervibe:add-memory`, `supervibe:mcp-discovery`, `supervibe:explore-alternatives`, `supervibe:interaction-design-patterns`, `supervibe:tokens-export`
- New rules: `no-hardcode`, `no-half-finished`
- Stack agents got `WebFetch` + `recommended-mcps` frontmatter
- **No action needed**  just update plugin version in install path

### v1.1  v1.2

- **Plugin manifest now requires `agents:[]` array** for nested agent dirs to work
  - Manifest auto-updated; ensure your install path has v2.0.59
- **Memory v2: SQLite FTS5** replaces markdown+grep
  - Old v1 markdown files still work as source of truth
  - First search auto-builds SQLite index from existing markdown
  - **Requires Node 22.5+** for `node:sqlite`; installation stops until this runtime is available
- New: `scripts/search-memory.mjs` CLI
- **Action**: re-symlink to v2.0.59 dir, restart Claude Code

## Where to next

- `CONTRIBUTING.md`  add agents/skills/rules
- `docs/skill-authoring.md`  write a new skill
- `docs/agent-authoring.md`  write a new agent
- `docs/rule-authoring.md`  write a new rule
- `.supervibe/artifacts/specs/2026-04-27-supervibe-framework-design.md`  full architecture spec
- GitHub issues for support
