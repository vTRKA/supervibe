---
description: >-
  Archive old/superseded memory entries to prevent unbounded growth. Reads
  decisions/learnings/patterns, applies retention policy, moves stale to
  .claude/memory/.archive/. Always reversible. Reversible. Triggers: 'memory
  garbage collect', 'cleanup memory', 'архив памяти', '/evolve-memory-gc'.
---

# /evolve-memory-gc

Garbage-collect (archive, not delete) old or superseded entries from `.claude/memory/`. Prevents unbounded memory growth while preserving every entry forever — archived entries are moved to `.claude/memory/.archive/`, never erased, fully reversible via `--restore`.

This command does NOT touch `.claude/memory/code.db` / `memory.db` (SQLite indexes — these are rebuilt from the markdown source-of-truth). It operates on the `.md` files in `decisions/`, `learnings/`, `patterns/`, `incidents/`, `solutions/`.

## Retention policy (default — configurable per-category)

| Category | Default retention | Archive trigger |
|---|---|---|
| `decisions/` | Forever | Only if frontmatter `superseded-by: <id>` |
| `patterns/` | Forever | Only if `superseded-by: <id>` OR `applies-to:` files all deleted |
| `incidents/` | 1 year (365 days) past `date:` | Auto if older than retention |
| `learnings/` | 6 months (180 days) past `date:` | Auto if older AND `confidence: <7` |
| `solutions/` | Forever | Only if `superseded-by: <id>` |

These are conservative defaults. Real-world projects may want longer retention; this command supports per-category overrides.

The principle: **memory grows over time and that's fine.** GC is for entries that are explicitly superseded or genuinely time-bound (incidents from years ago that no longer reflect current architecture).

## Invocation forms

### `/evolve-memory-gc` — full sweep with default policy

Scans all 5 categories, applies default retention, lists candidates for archival, asks user confirmation, then archives.

### `/evolve-memory-gc --dry-run` — preview only

Same scan, but doesn't archive. Reports what WOULD be moved.

### `/evolve-memory-gc <category>` — single category

Examples:
- `/evolve-memory-gc incidents` — only incidents
- `/evolve-memory-gc learnings` — only learnings

### `/evolve-memory-gc --policy <category>=<days>` — override retention

Examples:
- `/evolve-memory-gc --policy incidents=730` — keep incidents for 2 years
- `/evolve-memory-gc --policy learnings=90,incidents=180` — multi-override

### `/evolve-memory-gc --supersede <new-id> <old-id>` — mark relationship

Mark `old-id` as superseded by `new-id`. Adds `superseded-by: <new-id>` frontmatter to old; adds `supersedes: <old-id>` to new. Old becomes archive candidate on next GC.

### `/evolve-memory-gc --restore <archived-id>` — restore from archive

Move file back from `.claude/memory/.archive/<category>/<file>` to `.claude/memory/<category>/<file>`. Re-indexes via `npm run memory:watch` or next session-start.

### `/evolve-memory-gc --stats` — memory size report

Prints per-category counts + total bytes + oldest entry date. No archival action.

## Archival mechanism

**Archived files are MOVED, not deleted:**

```
.claude/memory/incidents/upgrade-failure-2024-01-15.md
                    ↓ archived
.claude/memory/.archive/incidents/upgrade-failure-2024-01-15.md
                    ↓ frontmatter updated to add archivedAt + archiveReason
```

The archive directory `.claude/memory/.archive/` is gitignored from the index DB but tracked in git (so history persists across machines).

**Archived entries are excluded from semantic search** (`scripts/build-memory-index.mjs` skips `.archive/` by default). To include them, run `npm run memory:watch -- --include-archive` for one-off searches.

## Procedure

1. **Read policy:**
   - Default thresholds (table above)
   - Override via `--policy <category>=<days>` if user provided

2. **Scan each category:**
   ```bash
   for category in decisions patterns incidents learnings solutions; do
     for file in .claude/memory/$category/*.md; do
       parse frontmatter (date, superseded-by, confidence, applies-to)
       if matches archive trigger → add to candidates
     done
   done
   ```

3. **Trigger logic:**

   - **`decisions/` and `solutions/`**: archive ONLY if `superseded-by:` is set AND the superseder file exists. Never archive on age alone.
   - **`patterns/`**: archive if `superseded-by:` set OR if `applies-to:` paths all deleted (verify via glob).
   - **`incidents/`**: archive if `(today - date) > retentionDays`.
   - **`learnings/`**: archive if `(today - date) > retentionDays` AND frontmatter `confidence < 7` (low-confidence learnings age out faster).

4. **List candidates:**
   ```
   === Memory GC candidates ===
   
   Total memory entries: 287 (across 5 categories)
   Candidates for archival: 14
   
   Decisions (3):
     - 2024-02-prefer-graphql-over-rest.md (superseded-by: 2025-09-prefer-trpc.md)
     - 2024-04-postgres-as-primary-store.md (superseded-by: 2026-01-pgvector-extension.md)
     - 2024-06-jwt-auth-strategy.md (superseded-by: 2026-03-passkey-strategy.md)
   
   Patterns (1):
     - 2024-01-redux-toolkit.md (applies-to paths all deleted: src/store/, src/slices/)
   
   Incidents (8):
     - 2023-11-deploy-failure.md (date: 2023-11-15, age 530 days, retention 365)
     - 2023-12-database-corruption.md (date: 2023-12-02, age 513 days, retention 365)
     ...
   
   Learnings (2):
     - 2024-08-stripe-webhook-quirks.md (date: 2024-08-01, age 270 days, retention 180, confidence 5)
     - 2024-09-cors-edge-case.md (date: 2024-09-15, age 225 days, retention 180, confidence 6)
   
   Apply? [y / n / pick / dry-run-already-shown]
   ```

5. **On confirmation, archive each:**
   - Add to file frontmatter:
     ```yaml
     archivedAt: <ISO>
     archiveReason: <"superseded" | "age-retention" | "applies-to-deleted">
     ```
   - Move to `.claude/memory/.archive/<category>/<filename>`.
   - Append to `.claude/memory/.archive/_archive-log.jsonl`:
     ```jsonl
     {"id":"<id>","category":"<cat>","archivedAt":"<ISO>","reason":"<r>","originalPath":"<p>"}
     ```

6. **Re-index** (memory.db rebuild):
   ```bash
   npm run code:index  # auto-skips .archive/ per build-memory-index.mjs config
   ```

7. **Print summary:**
   ```
   === Evolve Memory GC ===
   
   Archived: 14 entries
     - 3 decisions (superseded)
     - 1 pattern (applies-to deleted)
     - 8 incidents (age retention)
     - 2 learnings (age + low confidence)
   
   Memory size before: 287 entries / 1.4 MB
   Memory size after:  273 entries / 1.3 MB
   Archive size:       14 entries / 87 KB (.claude/memory/.archive/)
   
   Restore any: /evolve-memory-gc --restore <id>
   View archive: ls .claude/memory/.archive/<category>/
   ```

## Error recovery

| Failure | Recovery action |
|---|---|
| Frontmatter parse error in candidate | Skip that file; report path; suggest manual fix |
| `superseded-by:` points to non-existent file | Don't archive (broken link is a signal); report; user fixes link |
| Archive dir doesn't exist | Auto-create `.claude/memory/.archive/<category>/` |
| Move fails (permission, lock) | Skip file; print error; continue with others |
| Re-index fails | Memory entries archived correctly; just SQLite rebuild needs manual `npm run code:index` |
| User runs `--restore` but file not in archive | Print archive log entries to help locate by `id` |

## Output contract

Stats mode:
```
=== Memory stats ===
Total entries:        287 (1.4 MB)
By category:
  decisions:  42 entries (oldest: 2023-08-12)
  patterns:   31 entries (oldest: 2023-09-03)
  incidents:  78 entries (oldest: 2023-04-22)
  learnings:  93 entries (oldest: 2023-06-15)
  solutions:  43 entries (oldest: 2023-10-08)

Archive (.claude/memory/.archive/):
  Total archived: 14 entries (87 KB)

Stale candidates by current default policy: 14
Run /evolve-memory-gc --dry-run for details.
```

Dry-run mode:
```
=== Memory GC — DRY RUN ===
[same candidate list as full mode, no archival]
Action: review candidates above; run /evolve-memory-gc to apply.
```

Full mode: see step 7 above.

## When NOT to invoke

- Right after `/evolve-genesis` on a new project — almost no memory yet, GC is no-op.
- During an active session that just wrote new memory entries — give entries time to settle (>1 day).
- For removing PII or sensitive data — that's NOT what GC does. Use direct `git filter-branch` or `git filter-repo` for sensitive data removal (and reach out to security team).

## Related

- `evolve:project-memory` skill — reads memory entries
- `evolve:add-memory` skill — writes new entries
- `scripts/build-memory-index.mjs` — re-indexes after archival
- `scripts/lib/memory-store.mjs` — read/write logic
- `.claude/memory/.archive/_archive-log.jsonl` — audit trail of archivals
- `/evolve-audit` — surfaces memory growth in health check
