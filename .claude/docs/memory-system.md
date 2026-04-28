# Memory system (`.claude/memory/`)

> Relocated from CLAUDE.md as part of Phase 1 token-economy plan. Content byte-identical.

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
