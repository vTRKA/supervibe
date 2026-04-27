# Evolve

**English** · [Русский](README.ru.md)

A plugin that turns Claude Code, Codex, and Gemini into a team of 73 specialist agents with a code graph, project memory, and confidence gates. Runs locally. No Docker.

**v1.7.0** · MIT · Windows / macOS / Linux

---

## What you get

| Feature | What it means |
|---------|---------------|
| 73 specialist agents | ≥250 lines each: persona, decision tree, procedure, output contract, anti-patterns, verification |
| Code graph (10 languages) | tree-sitter symbols and edges. Query `--callers X`, `--callees Y`, `--neighbors Z --depth 2` |
| Semantic code search | multilingual-e5-small. Works offline. Speaks Russian, English, and 100 other languages |
| Project memory | Five categories with FTS5 plus per-chunk embeddings. Decisions get reused, not rederived |
| Confidence engine | Twelve rubrics. Gate at score ≥9. Override rate above 5% triggers an audit |
| 20 discipline rules | `use-codegraph-before-refactor`, `anti-hallucination`, `commit-attribution`, `no-half-finished`, and more |
| Auto-reindex | A PostToolUse hook plus an mtime scan on session start. The `memory:watch` daemon is optional |
| Agent evolution loop | Telemetry, underperformer detection, and `/evolve-strengthen` with a user gate |
| Live preview server | `localhost:PORT` with SSE hot reload, idle shutdown, and a max-server limit |
| Multi-CLI | One installer wires Claude Code, Codex, and Gemini together |

23 stacks supported: PHP (Laravel) · TypeScript / JavaScript (Next.js, Nuxt, Vue, Svelte, React, Express, NestJS) · Python (FastAPI, Django + DRF) · Ruby (Rails) · Java / Kotlin (Spring) · C# (ASP.NET) · Go · Mobile (Flutter, iOS, Android) · GraphQL · PostgreSQL · MySQL · MongoDB · Elasticsearch · Redis.

---

## Install

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/vTRKA/evolve-agent/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/vTRKA/evolve-agent/main/install.ps1 | iex
```

The installer detects every supported AI CLI on your machine, clones the plugin into `~/.claude/plugins/marketplaces/evolve-marketplace/`, runs 194 tests, and registers the plugin with each CLI. Re-run the same command later to upgrade.

Restart your AI CLI. On the next session you should see:

```
[evolve] welcome — plugin v1.7.0 initialized for this project
[evolve] code RAG ✓ N files / M chunks (fresh)
[evolve] code graph ✓ N symbols / M edges (X% resolved)
```

**Requirements:** Node.js 22+ and Git. Git LFS is optional — the embedding model downloads from HuggingFace on first use. No Docker, no Python, no native compile step.

---

## Troubleshooting

**No banner after install.** Re-run the installer — it is idempotent and refreshes the three Claude config files. Then fully restart the AI CLI (close the desktop app, do not just open a new chat).

**Not visible in VS Code or Zed.** Those IDEs read the same `~/.claude/` as the terminal. If the banner appears in the terminal, restart the IDE. If still nothing, re-run the installer.

**`Protobuf parsing failed`.** The embedding model is an LFS pointer. Run `git lfs pull` inside `~/.claude/plugins/marketplaces/evolve-marketplace`, or just trigger a code search — the model downloads from HuggingFace (~118 MB).

**SQLite errors.** Node.js 22+ is required for the built-in `node:sqlite`. Older versions cannot use the semantic memory.

**Stale code index.** The mtime scan on session start catches most external edits. For a full rebuild: `rm .claude/memory/code.db && npm run code:index` from your project directory.

**Windows.** If PowerShell rejects the installer with an Execution Policy error: `Set-ExecutionPolicy -Scope Process Bypass`. The Codex symlink needs Developer Mode — without it, the installer falls back to a directory copy.

---

## Uninstall

```bash
# macOS / Linux
rm -rf ~/.claude/plugins/marketplaces/evolve-marketplace
rm -f  ~/.codex/plugins/evolve

node -e "
const fs=require('fs'),p=process.env.HOME+'/.claude/plugins/installed_plugins.json';
if(!fs.existsSync(p))process.exit(0);
const d=JSON.parse(fs.readFileSync(p,'utf8'));
delete d.plugins['evolve@evolve-marketplace'];
fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');
"

node -e "
const fs=require('fs'),p=process.env.HOME+'/.claude/plugins/known_marketplaces.json';
if(!fs.existsSync(p))process.exit(0);
const d=JSON.parse(fs.readFileSync(p,'utf8'));
delete d['evolve-marketplace'];
fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');
"

node -e "
const fs=require('fs'),p=process.env.HOME+'/.claude/settings.json';
if(!fs.existsSync(p))process.exit(0);
const d=JSON.parse(fs.readFileSync(p,'utf8'));
if(d.enabledPlugins) delete d.enabledPlugins['evolve@evolve-marketplace'];
if(d.extraKnownMarketplaces) delete d.extraKnownMarketplaces['evolve-marketplace'];
fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');
"

sed -i.bak '/<!-- evolve-plugin-include: do-not-edit -->/,/<!-- evolve-plugin-include: do-not-edit -->/d' ~/.gemini/GEMINI.md 2>/dev/null || true
```

Windows equivalent: replace `rm -rf` with `Remove-Item -Recurse -Force` and run the same node `-e` blocks (paths via `$HOME` work in PowerShell too).

Project indexes are your data — remove only when sure: `rm -rf .claude/memory/code.db .claude/memory/memory.db`.
