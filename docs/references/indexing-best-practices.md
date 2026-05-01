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

- `build-code-index.mjs` has no fixed total timeout. Large projects should be
  allowed to finish; heartbeat and progress lines are the liveness evidence.
- Use `SUPERVIBE_INDEX_PROGRESS_EVERY=<N>` or `--progress-every <N>` to tune
  progress logging for very large repositories.
- Use `SUPERVIBE_INDEX_HEARTBEAT_SECONDS=<N>` or `--heartbeat-seconds <N>` to
  print current stage, current file, processed/remaining counts, and elapsed
  time during long hashing, chunking, embedding, graph, or health stages.
- A project-local `.supervibe/memory/code-index.lock` prevents overlapping
  indexer runs. If a process is killed, the next run removes stale locks whose
  PID is no longer alive.
- `--no-embeddings` is the BM25/source-readiness fallback. In CLI indexing it
  also skips graph extraction and cross-file edge resolution by default; pass
  `--graph` only when graph data is explicitly needed in the fallback run.
- Graph symbol extraction is a secondary layer. Source RAG can be ready while a
  language query is degraded; use `--strict-index-health` only when explicitly
  auditing graph extraction.

## Repair

- `scanCodeChanges()` must discover new source files even when `code.db` already exists.
- Repair must prune deleted rows, generated rows that were previously indexed, and rows outside the current source inventory.
- `node scripts/build-code-index.mjs --root . --force --health` is the explicit full-discovery health command.
- `node scripts/build-code-index.mjs --root . --list-missing` prints missing/stale policy-eligible files without indexing them.
- `node scripts/build-code-index.mjs --root . --resume --max-files 200 --health --no-embeddings` batches missing/stale files without redoing the whole project.
- `node scripts/build-code-index.mjs --root . --resume --health --no-embeddings` is the BM25 source-readiness fallback after a partial/aborted run.
- `node scripts/build-code-index.mjs --root . --explain-policy` prints include and exclude reasons for auditing.
