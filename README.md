# Evolve

**English** · [Русский](README.ru.md)

A plugin that turns Claude Code, Codex, and Gemini into a team of 73 specialist agents with a code graph, project memory, and confidence gates. Runs locally. No Docker.

**v1.7.0** · MIT · Windows / macOS / Linux · Claude Code · Codex CLI · Gemini CLI

---

## Install

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/vTRKA/evolve/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/vTRKA/evolve/main/install.ps1 | iex
```

The installer finds Claude Code, Codex, or Gemini on your machine. It clones the plugin into `~/.claude/plugins/marketplaces/evolve-marketplace/`, runs 194 tests, and registers the plugin with every CLI it finds.

Restart your CLI. On the next session you should see:
```
[evolve] welcome — plugin v1.7.0 initialized for this project
[evolve] code RAG ✓ N files / M chunks (fresh)
[evolve] code graph ✓ N symbols / M edges (X% resolved)
```

**Requirements:** Node.js 22+, Git. Git LFS is optional — the embedding model downloads from HuggingFace on first use. No Docker, no Python, no native compile step.

---

## What it does

Four request types, four concrete outcomes:

| You ask | What changes |
|---------|--------------|
| Rename `processOrder` to `processCheckout` | The agent runs `--callers processOrder` first, finds 14 call sites, edits them all in one PR, then runs the query again to confirm 0 callers remain. No missed spots. |
| Add a payment endpoint with idempotency | Memory search finds your prior idempotency decision. The Laravel agent writes a failing test, implements, runs `pest` and `phpstan`, scores 9.2 on the rubric, and saves the solution to `solutions/`. |
| Users say payment sometimes hangs | The root-cause-debugger reproduces locally, narrows to a Redis lock release path, writes an incident note with file:line and a fix proposal. |
| Build a landing page like Linear | Firecrawl scrapes Linear. The creative-director proposes three brand directions. The designer writes a state matrix. A live preview opens at `localhost:3047` with hot reload. The accessibility reviewer checks WCAG. |

---

## What's inside

| Feature | What it means |
|---------|---------------|
| 73 specialist agents | Each is at least 250 lines: persona, decision tree, procedure, output contract, anti-patterns, verification |
| Code graph (10 languages) | tree-sitter symbols and edges. Query `--callers X`, `--callees Y`, `--neighbors Z --depth 2` |
| Semantic code search | multilingual-e5-small. Works offline. Speaks Russian, English, and 100 other languages |
| Project memory | Five categories with FTS5 plus per-chunk embeddings. Decisions get reused, not rederived |
| Confidence engine | Twelve rubrics. Gate at score ≥9. Override rate above 5% triggers an audit |
| 20 discipline rules | `use-codegraph-before-refactor`, `anti-hallucination`, `commit-attribution`, `no-half-finished`, and more |
| Auto-reindex | A PostToolUse hook plus an mtime scan on session start. The `memory:watch` daemon is optional |
| Agent evolution loop | Telemetry, underperformer detection, and `/evolve-strengthen` with a user gate |
| Live preview server | `localhost:PORT` with SSE hot reload, idle shutdown, and a max-server limit |
| Multi-CLI | One installer wires Claude Code, Codex, and Gemini together |

---

## Supported stacks

PHP: Laravel · TypeScript / JavaScript: Next.js, Nuxt, Vue, Svelte, React, Express, NestJS · Python: FastAPI, Django (with DRF) · Ruby: Rails · Java / Kotlin: Spring · C#: ASP.NET · Go · Mobile: Flutter, iOS, Android · API: GraphQL · Storage: PostgreSQL, MySQL, MongoDB, Elasticsearch, Redis

Code graph parsers: TypeScript, JavaScript, TSX, JSX, Python, PHP, Go, Rust, Java, Ruby. Vue and Svelte use whole-file chunking.

---

## Commands

### Slash commands

| Command | Purpose |
|---------|---------|
| `/evolve` | Auto-router: genesis, audit, strengthen, adapt, evaluate |
| `/evolve-genesis` | First-time scaffold of `.claude/` for your stack |
| `/evolve-audit` | Health check across agents, rules, memory |
| `/evolve-strengthen [agent_id]` | Strengthen a weak agent. Without arguments — auto-trigger from telemetry |
| `/evolve-adapt` | Pull upstream agent improvements into the project |
| `/evolve-evaluate` | Score a finished artifact against its rubric |
| `/evolve-preview` | Manage preview servers |
| `/evolve-changelog` | What changed since the last version this project saw |

### NPM scripts (run inside the plugin directory)

| Command | Purpose |
|---------|---------|
| `npm run evolve:status` | Health check across every index |
| `npm run evolve:upgrade` | git pull, lfs pull, npm install, run tests |
| `npm run evolve:upgrade-check` | Manually query upstream for new commits |
| `npm run code:index` | Full reindex |
| `npm run code:search -- --query "..."` | Semantic search |
| `npm run code:search -- --callers "Symbol"` | Graph: who calls this symbol |
| `npm run memory:watch` | Optional watcher daemon |
| `npm run check` | All 194 tests plus manifest, frontmatter, and footer validation |

---

## Updating

A SessionStart hook fetches upstream once every 24 hours in the background. If new commits exist, the next session shows:
```
[evolve] ⬆ upstream has 7 new commit(s) (latest tag: v1.8.0) — run `npm run evolve:upgrade`
```

Apply the update:
```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/vTRKA/evolve/main/install.sh | bash
```
```powershell
# Windows
irm https://raw.githubusercontent.com/vTRKA/evolve/main/install.ps1 | iex
```
The installer is idempotent. Re-running upgrades the existing checkout.

Or, from the plugin directory: `npm run evolve:upgrade`.

**Updated automatically:** global agents, skills, rules, rubrics, grammars, embedding model, `code.db` and `memory.db` schema (via `CREATE TABLE IF NOT EXISTS`), and the `installed_plugins.json` registration.

**Left alone:** your project-level `.claude/agents/`, `.claude/rules/`, and `.claude/memory/`. These hold your customizations and data. To pull upstream agent changes into a project, run `/evolve-adapt`. It shows a diff and asks before writing.

---

## Alternative install

Through Claude Code's marketplace command:
```
/plugin marketplace add vTRKA/evolve
/plugin install evolve@evolve-marketplace
```

Manual install (for CI):
```bash
git clone https://github.com/vTRKA/evolve ~/.claude/plugins/marketplaces/evolve-marketplace
cd ~/.claude/plugins/marketplaces/evolve-marketplace
npm install && npm run check
```
Then upsert the `installed_plugins.json` entry. The exact node script lives in `install.sh`.

---

## Troubleshooting

**Plugin does not appear after install.** Check the registration:
```bash
cat ~/.claude/plugins/installed_plugins.json | grep "evolve@"
ls ~/.claude/plugins/marketplaces/evolve-marketplace/.claude-plugin/plugin.json
```
Restart your CLI. Plugins load on session start.

**Does not work in VS Code or Zed extensions.** These extensions share the same Claude Code install as the terminal. If the banner appears in the terminal it appears everywhere. Restart the IDE.

**`Protobuf parsing failed`.** The embedding model file is an LFS pointer, not the real binary. Run `git lfs pull` in the plugin directory, or just run a search and the model downloads from HuggingFace (~118 MB).

**SQLite errors.** Node.js 22+ is required for the built-in `node:sqlite`. Older versions cannot use semantic memory.

**Stale code index.** The mtime scan on SessionStart catches most external changes. For a full rebuild: `rm .claude/memory/code.db && npm run code:index`.

**Large monorepo (more than 10k files).** Index incrementally: `npm run code:index -- --since=HEAD~100`.

**Windows.** If PowerShell rejects the installer with an Execution Policy error, run `Set-ExecutionPolicy -Scope Process Bypass` first. The Codex symlink needs Developer Mode. Without it, the installer copies the directory instead.

---

## Uninstall

```bash
# macOS / Linux
rm -rf ~/.claude/plugins/marketplaces/evolve-marketplace
rm -f ~/.codex/plugins/evolve

node -e "
const fs=require('fs'),p=process.env.HOME+'/.claude/plugins/installed_plugins.json';
if(!fs.existsSync(p))process.exit(0);
const d=JSON.parse(fs.readFileSync(p,'utf8'));
delete d.plugins['evolve@evolve-marketplace'];
fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');
"

sed -i.bak '/<!-- evolve-plugin-include: do-not-edit -->/,/<!-- evolve-plugin-include: do-not-edit -->/d' ~/.gemini/GEMINI.md 2>/dev/null || true
```

Optional. Remove project indexes only if you know you do not need them — they hold your data:
```bash
rm -rf .claude/memory/code.db .claude/memory/memory.db
```

---

## Documentation

- [`docs/getting-started.md`](docs/getting-started.md) — extended walk-through
- [`CLAUDE.md`](CLAUDE.md) — system context loaded at session start
- [`CHANGELOG.md`](CHANGELOG.md) — version history
- [`docs/templates/`](docs/templates/) — PRD, ADR, plan, RFC, brainstorm, intake
- `agents/_core/code-reviewer.md` — canonical agent reference
- 73 agents · 45 skills · 20 rules · 12 rubrics

---

## Compared with superpowers

| | Evolve | superpowers |
|--|--------|-------------|
| Code graph (10 languages) | yes | no |
| Semantic code search (multilingual) | yes | no |
| Specialist agents | 73, ≥250 lines, fixed structure | fewer, looser structure |
| Stack-aware scaffolding | 23 stacks | no |
| Confidence engine | 12 rubrics, gate ≥9 | softer |
| Live preview server | yes (pure-Node SSE) | no |
| Auto-reindex without a daemon | yes | no |
| Agent evolution loop | yes | no |
| Multi-CLI (Claude / Codex / Gemini) | yes | Claude Code only |
| Bundle size | ~140 MB | <10 MB |

Both can be installed at the same time. The `evolve:` namespace prevents name collisions.

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). The shortest path:
1. Read `agents/_core/code-reviewer.md` — the canonical reference
2. Pick a smaller agent (`agents/_design/copywriter.md`) and find one thing to add
3. Open a PR. Explain *why* in the commit message. Do not add agent attribution to commits — see the `commit-attribution` rule

## Credits

tree-sitter (WASM parsing for 10 languages). HuggingFace transformers.js (multilingual embeddings). [Aider's repo-map](https://aider.chat) (concept inspiration for the code graph). The Claude Code team (extensible plugin architecture).

---

MIT — see [`LICENSE`](LICENSE).
