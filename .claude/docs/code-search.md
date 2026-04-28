# Code Search (semantic + FTS5)

> Relocated from CLAUDE.md as part of Phase 1 token-economy plan. Content byte-identical.

Hybrid **Code RAG** index at `.claude/memory/code.db`:

- **Semantic**: `Xenova/multilingual-e5-small` (RU+EN+100 langs, ~129 MB bundled offline)
- **Keyword**: SQLite FTS5 BM25 over function-aware code chunks
- **Hybrid ranking**: Reciprocal Rank Fusion (k=60) over BM25 + cosine similarity
- **Incremental**: three refresh paths (all wired, no manual intervention required):
  - **Pseudo-watcher** (always-on, no daemon): `PostToolUse` hook on `Write|Edit` re-indexes touched files into both RAG + Graph (`code.db`) AND memory FTS (`memory.db`) — covers `.ts/.py/.go/...` plus `.claude/memory/**/*.md`. Skips embeddings to stay fast (~50–500ms per file); BM25 + symbols/edges always fresh. Opt-out: `EVOLVE_HOOK_NO_INDEX=1`. Opt-in to embeddings: `EVOLVE_HOOK_EMBED=1`.
  - **mtime-scan on SessionStart** (`scripts/lib/mtime-scan.mjs`): cheap stat() over every row in `code_files` + `entries`. Detects files changed/deleted between sessions (external editor, `git pull`, CI) and reindexes/removes accordingly. Pure stat — no read unless mtime indicates a change. Output: `[evolve] mtime-scan: N reindexed, M removed`.
  - **Watcher daemon** (optional, opt-in): `npm run memory:watch` — chokidar long-running with embeddings, real-time live-reload while files churn during a session. For 99% of users the first two paths cover everything.
- **Languages**: TS, TSX, JS, JSX, Python, PHP, Rust, Go, Java, Ruby, Vue, Svelte (whole-file chunking for last two)

Skill: `evolve:code-search` — invoke **BEFORE** any non-trivial code change.

| Question | Command |
|----------|---------|
| "How does X work?" (concept) | `node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --query "<topic>"` |
| Files matching a phrase | `... --query "<phrase>" --limit 10` |
| By language | `... --query "<topic>" --lang typescript` |

Rebuild: `npm run code:index`. SessionStart hook auto-refreshes a missing index.
