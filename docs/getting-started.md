# Getting Started with Evolve

Evolve is a self-evolving Claude Code plugin: stack-aware scaffolding + 15-year-persona agents + 10-point confidence engine + autonomous proactivity + SQLite-backed project memory.

## Requirements

- **Claude Code** (latest)
- **Node.js 22+** (for SQLite memory; `node:sqlite` built-in)
- **Git**

## Install (verified)

The plugin uses Claude Code's standard plugin format with `agents:[]` array (verified against voltagent-lang convention). Two install paths:

### Option A — Via marketplace (recommended for users)

If a marketplace publishes Evolve:

```bash
# Add marketplace (URL TBD when published)
# /plugin marketplace add <evolve-marketplace-url>

# Install plugin
# /plugin install evolve@evolve-marketplace
```

### Option B — Local install (current; for early adopters and developers)

```bash
# 1. Clone or download Evolve
git clone https://github.com/your-org/evolve ~/dev/evolve   # or download archive
cd ~/dev/evolve

# 2. Install Node deps for dev tooling (validates structure, runs tests)
nvm use     # uses Node 20 from .nvmrc; ensure Node 22+ for SQLite memory features
npm install
npm run check    # 51/51 tests must pass before installing to plugins dir

# 3. Install to Claude Code plugins cache
# Path pattern: ~/.claude/plugins/cache/<marketplace>/<name>/<version>/
# For local-dev: marketplace = "local"

# Linux/Mac:
mkdir -p ~/.claude/plugins/cache/local
cp -r ~/dev/evolve ~/.claude/plugins/cache/local/evolve/1.2.0

# Windows (PowerShell):
mkdir $HOME\.claude\plugins\cache\local\evolve\1.2.0
xcopy /E /I "D:\ggsel projects\evolve" "$HOME\.claude\plugins\cache\local\evolve\1.2.0"

# Or symlink (avoids re-copy on updates):
# Linux/Mac:
ln -s ~/dev/evolve ~/.claude/plugins/cache/local/evolve/1.2.0
# Windows (admin shell):
mklink /D "$HOME\.claude\plugins\cache\local\evolve\1.2.0" "D:\ggsel projects\evolve"

# 4. Restart Claude Code session
# Plugin auto-loads from cache.
# Verify: type /evolve — should respond with auto-detect dispatcher
```

### Verify install

After restart, in a Claude Code session:

```
/evolve
```

Expected response: orchestrator analyzes current project state and proposes next phase (e.g., "/evolve-genesis if `.claude/agents/` empty").

If `/evolve` not recognized:
- Check `~/.claude/plugins/cache/local/evolve/1.2.0/.claude-plugin/plugin.json` exists
- Verify `agents` field is array (not string) and paths begin with `./agents/`
- Run `npm run validate:plugin-json` from plugin dir

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
⚡ Recommend: /evolve-genesis
🎯 Why: bootstrap stack-aware scaffold from empty repo
⏭ Run? (y/n)
```

Type `y`.

### 3. Discovery questionnaire

`evolve:stack-discovery` asks one question at a time:

- "What are you building?" → `web-app`
- "Backend stack?" → `laravel`
- "Frontend stack?" → `nextjs`
- "Primary data store?" → `postgres`
- "Infrastructure features?" → `redis-cache`, `queue`
- ... (architecture, design, testing, deployment)

### 4. Genesis

`evolve:genesis` composes the matching pack (`laravel-nextjs-postgres-redis`):

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
> ⚡ Recommend: evolve:requirements-intake (complexity ≥4)

Type `y`. The framework chains:
1. **`evolve:project-memory`** searches prior decisions (empty for first task)
2. **`evolve:requirements-intake`** asks clarifying questions
3. **`evolve:brainstorming`** (if complexity ≥7) → spec
4. **`evolve:explore-alternatives`** for any decision complexity ≥5
5. **`evolve:writing-plans`** → phased plan
6. **`evolve:executing-plans`** → executes with TDD per task
7. **`evolve:_core:code-reviewer`** → review across 8 dimensions
8. **`evolve:_core:quality-gate-reviewer`** → final ≥9 gate
9. **`evolve:add-memory`** → records this decision for future

Every artifact confidence-scored ≥9 before progression. Override with `/evolve-override "<reason>"` if needed.

## Command reference

| Command | What it does |
|---------|--------------|
| `/evolve` | Auto-detect dispatcher; suggests next phase |
| `/evolve-genesis` | Bootstrap empty project with stack-pack |
| `/evolve-audit` | Health-check artifacts (stale/weak/coverage) |
| `/evolve-strengthen` | Deepen weak agents/skills/rules |
| `/evolve-adapt` | Sync to stack changes (new modules/deps) |
| `/evolve-evaluate` | Track effectiveness in journal |
| `/evolve-score <type> [path]` | Score artifact against rubric |
| `/evolve-override "<reason>"` | Escape-hatch past BLOCK gate (logged) |

## MCP integration (optional but recommended)

Plugin agents have `recommended-mcps:` frontmatter for capability boost:

| MCP | Boosts which agents |
|-----|---------------------|
| `context7` | All stack devs (laravel/nextjs/fastapi/react), researchers — current API docs |
| `figma` | creative-director, ux-ui-designer, prototype-builder — design files |
| `playwright` | qa-test-engineer, accessibility-reviewer, ui-polish-reviewer — browser automation |
| `firecrawl` | researchers — scraping/searching authoritative sources |

`evolve:mcp-discovery` skill detects available MCPs and proactively maps them. Without MCPs, agents fall back to WebFetch (slower, limited).

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

**Add entry** (typically auto-invoked by `quality-gate-reviewer`): use `evolve:add-memory` skill — writes markdown + auto-rebuilds index.

## Code Search (RAG over your source code)

Beyond markdown memory, Evolve indexes your source code for semantic search. This runs transparently — agents use it under the hood; you don't manage it directly.

```bash
# One-time full index (after install or major refactor)
node $CLAUDE_PLUGIN_ROOT/scripts/build-code-index.mjs

# Manual semantic search (optional — agents auto-invoke this)
node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --query "where authentication is handled"
```

**What gets indexed:** `.ts/.tsx/.js/.jsx/.py/.php/.rs/.go/.java/.rb/.vue/.svelte`. Skips `node_modules/`, `dist/`, `.next/`, `__pycache__/`, etc.

**Why this matters:** Agents (laravel-developer, nextjs-developer, fastapi-developer, react-implementer, repo-researcher) auto-search code before non-trivial tasks. Result: less hallucination, more reuse of existing patterns, faster orientation in unfamiliar parts of the codebase.

**Auto-index on changes:** Run `npm run memory:watch` once to start the file-watcher daemon. It re-indexes changed files on save (~50ms per file). Without watcher: re-run `code:index` after major changes.

**Storage:** `.claude/memory/code.db` (SQLite, gitignored). Hash-based dedup means re-indexing is fast.

## Troubleshooting

### `/evolve` not recognized after install

1. Confirm path: `ls ~/.claude/plugins/cache/local/evolve/1.2.0/.claude-plugin/plugin.json`
2. Validate manifest: `cd <plugin-dir> && npm run validate:plugin-json`
3. Restart Claude Code session (plugins load at startup)
4. Check `~/.claude/plugins/installed_plugins.json` lists evolve

### Agents not loading

- Verify `agents:[]` array in `.claude-plugin/plugin.json` lists actual file paths
- Each path must start with `./agents/` and end `.md`
- Run `npm run validate:frontmatter` — every agent file must have valid frontmatter

### SQLite memory errors

- Requires Node 22+ (for `node:sqlite`)
- Check version: `node --version`
- If <22: upgrade Node OR fall back to v1.1.x (markdown+grep memory)

### Genesis fails partway

- Check `.claude/confidence-log.jsonl` for last successful step
- Don't manually clean up — re-run `/evolve-genesis`; it skips existing files
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
rm -rf ~/.claude/plugins/cache/local/evolve

# Remove from installed_plugins.json (manual edit OR Claude Code UI)
# /plugin uninstall evolve   # if marketplace install was used

# Per-project cleanup (only if removing Evolve from a specific project):
rm -rf <project>/.claude/agents
rm -rf <project>/.claude/rules
rm -rf <project>/.claude/skills
# Keep .claude/settings.json + memory + confidence-log if you want
```

## Upgrade guide

### v1.0 → v1.1

- New: `evolve:project-memory`, `evolve:add-memory`, `evolve:mcp-discovery`, `evolve:explore-alternatives`, `evolve:interaction-design-patterns`, `evolve:tokens-export`
- New rules: `no-hardcode`, `no-half-finished`
- Stack agents got `WebFetch` + `recommended-mcps` frontmatter
- **No action needed** — just update plugin version in install path

### v1.1 → v1.2

- **Plugin manifest now requires `agents:[]` array** for nested agent dirs to work
  - Manifest auto-updated; ensure your install path has v1.2.0
- **Memory v2: SQLite FTS5** replaces markdown+grep
  - Old v1 markdown files still work as source of truth
  - First search auto-builds SQLite index from existing markdown
  - **Requires Node 22+** for `node:sqlite`
- New: `scripts/search-memory.mjs` CLI
- **Action**: re-symlink to v1.2.0 dir, restart Claude Code

## Where to next

- `CONTRIBUTING.md` — add agents/skills/rules
- `docs/skill-authoring.md` — write a new skill
- `docs/agent-authoring.md` — write a new agent
- `docs/rule-authoring.md` — write a new rule
- `docs/specs/2026-04-27-evolve-framework-design.md` — full architecture spec
- GitHub issues for support
