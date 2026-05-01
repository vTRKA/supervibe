# Indexing Best Practices

Supervibe code indexing uses one policy module: `scripts/lib/supervibe-index-policy.mjs`.

## Source Inventory

- Walk the workspace every repair pass; do not rely only on existing `code.db` rows.
- Include supported source extensions resolved by `code-chunker.detectLanguage()`.
- Keep default source roots visible for operators: `src`, `src-tauri`, `app`, `lib`, `scripts`, `commands`, `skills`, `agents`, `rules`, `tests`, and `packages`.

## Exclusions

- Never index generated output directories such as `dist`, `dist-check`, `build`, `out`, `.next`, `coverage`, `.turbo`, or `target`.
- Never index framework caches and generated trees such as `.nuxt`, `.svelte-kit`, `.angular`, `.vercel`, `.netlify`, `bin`, `obj`, `generated`, `__generated__`, or `gen`.
- Never index local state directories such as `.claude`, `.supervibe`, `.git`, `node_modules`, package-manager stores, virtualenv folders, `site-packages`, `Pods`, `DerivedData`, or vendored dependencies.
- Skip minified bundles, test/spec files, and TypeScript declaration files for source RAG.

## Runtime

- `build-code-index.mjs` is unbounded by default and supports bounded batches
  with `--max-seconds <N>` plus `--max-files <N>`. When the time budget is
  reached, the current file finishes, the DB/checkpoint are closed cleanly, and
  the command prints `SUPERVIBE_INDEX_BOUNDED_TIMEOUT`.
- Use `SUPERVIBE_INDEX_PROGRESS_EVERY=<N>` or `--progress-every <N>` to tune
  progress logging for very large repositories.
- Use `SUPERVIBE_INDEX_HEARTBEAT_SECONDS=<N>` or `--heartbeat-seconds <N>` to
  print current stage, current file, processed/remaining counts, and elapsed
  time during long hashing, chunking, embedding, graph, or health stages.
- Use `--json-progress` to emit machine-readable `SUPERVIBE_INDEX_PROGRESS`
  JSON lines. `.supervibe/memory/code-index-checkpoint.json` is updated after
  each file/batch with stage, current file, processed/remaining, elapsed time,
  ETA, and the last persisted checkpoint timestamp.
- A project-local `.supervibe/memory/code-index.lock` prevents overlapping
  indexer runs. If a process is killed, the next run removes stale locks whose
  PID is no longer alive.
- `--source-only` is the plain text/BM25 source-readiness path. It skips
  embeddings, graph extraction, and cross-file edge resolution so source RAG can
  reach full coverage first. `--no-embeddings` remains as a compatibility alias
  for BM25 mode, and `--graph` is used for graph catch-up.
- Graph symbol extraction is a secondary layer. Source RAG can be ready while a
  language query is degraded; use `--strict-index-health` only when explicitly
  auditing graph extraction.

## Repair

- `scanCodeChanges()` must discover new source files even when `code.db` already exists.
- Repair must prune deleted rows, generated rows that were previously indexed, and rows outside the current source inventory.
- `node scripts/build-code-index.mjs --root . --list-missing` prints missing/stale policy-eligible files without indexing them.
- `node scripts/build-code-index.mjs --root . --resume --source-only --max-files 200 --max-seconds 120 --health --json-progress` batches missing/stale files without redoing the whole project and prioritizes missing rows before stale hash checks.
- `node scripts/build-code-index.mjs --root . --resume --graph --max-files 200 --health` catches graph extraction and cross-file resolution up after source RAG is healthy.
- `node scripts/build-code-index.mjs --root . --force --health` is a deliberate full rebuild path, not the default repair path.
- `node scripts/build-code-index.mjs --root . --explain-policy` prints include and exclude reasons for auditing.
