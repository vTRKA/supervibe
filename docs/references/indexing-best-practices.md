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

- `build-code-index.mjs` is unbounded by default and supports hard bounded
  batches with `--max-seconds <N>` plus `--max-files <N>`. When the time budget
  is reached, the watchdog writes a bounded-timeout checkpoint, closes the
  DB/lock path, and prints `SUPERVIBE_INDEX_BOUNDED_TIMEOUT` even if the first
  active file is still in `reading`, `hashing`, `chunking`, `db-write`,
  `fts-write`, or graph work.
- Use `SUPERVIBE_INDEX_PROGRESS_EVERY=<N>` or `--progress-every <N>` to tune
  progress logging for very large repositories.
- Use `SUPERVIBE_INDEX_HEARTBEAT_SECONDS=<N>` or `--heartbeat-seconds <N>` to
  print current stage, current file, processed/remaining counts, and elapsed
  time during long hashing, chunking, embedding, graph, or health stages.
- Use `--json-progress` to emit machine-readable `SUPERVIBE_INDEX_PROGRESS`
  JSON lines. Add `--trace-phases` or `--debug-file <path>` to persist every
  active file phase. `.supervibe/memory/code-index-checkpoint.json` includes
  `selectionFile`, `activeIndexFile`, `phase`, `stage`, processed/remaining,
  elapsed time, ETA, and the last persisted checkpoint timestamp.
- A project-local `.supervibe/memory/code-index.lock` prevents overlapping
  indexer runs and stores `pid`, `startedAt`, `heartbeatAt`, `phase`, and
  `activeIndexFile`. Use `--clean-stale-lock` to print whether the PID is dead,
  whether the heartbeat is stale, and whether it is safe to resume.
- `--source-only` is the plain text/BM25 source-readiness path. It skips
  embeddings, graph extraction, and cross-file edge resolution so source RAG can
  reach full coverage first. `--no-embeddings` remains as a compatibility alias
  for BM25 mode, and `--graph` is used for graph catch-up.
- Graph symbol extraction is a secondary layer. Source RAG can be ready while a
  language query is degraded; use `--strict-index-health` only when explicitly
  auditing graph extraction.
- Agent-facing context must expose quality metadata, not only raw hits:
  retrieval stage counts, rerank status, fallback reason, symbol coverage,
  edge-resolution rate, generated-file leakage, and graph warnings.

## Repair

- `scanCodeChanges()` must discover new source files even when `code.db` already exists.
- Repair must prune deleted rows, generated rows that were previously indexed, and rows outside the current source inventory.
- `node scripts/build-code-index.mjs --root . --list-missing` prints missing/stale policy-eligible files without indexing them.
- `node scripts/build-code-index.mjs --root . --resume --source-only --max-files 200 --max-seconds 120 --health --json-progress` batches missing/stale files without redoing the whole project and prioritizes missing rows before stale hash checks.
- `node scripts/build-code-index.mjs --root . --resume --source-only --language rust --path src-tauri/src --max-files 50 --max-seconds 30 --health --json-progress --trace-phases` repairs one language/path slice without hiding global readiness.
- `node scripts/build-code-index.mjs --root . --source-only --debug-file src-tauri/src/commands/chat.rs --trace-phases --verbose` debugs one file and writes `.supervibe/memory/failed_files.json` with path, phase, error name/message, and stack when verbose.
- `node scripts/build-code-index.mjs --root . --resume --graph --max-files 200 --health` catches graph extraction and cross-file resolution up after source RAG is healthy.
- `node scripts/build-code-index.mjs --root . --force --health` is a deliberate full rebuild path, not the default repair path.
- `node scripts/build-code-index.mjs --root . --explain-policy` prints include and exclude reasons for auditing.

## Best-Practice Alignment

- Treat the index as a pipeline with observable stages and repair commands,
  matching the GraphRAG pattern of explicit indexing workflows.
- Combine lexical source search, semantic retrieval, repo map, graph
  neighborhood, rerank, and fallback instead of relying on one flat retrieval
  layer.
- Keep graph retrieval incremental and quality-gated; graph warnings must not
  hide source RAG readiness, but structural refactors still require graph
  evidence before edits.
- Use source citations and graph node/edge evidence in agent handoffs so users
  and downstream agents can audit why context was selected.

## Source Basis

- Microsoft GraphRAG indexing overview: https://microsoft.github.io/graphrag/index/overview/
- LightRAG paper: https://arxiv.org/abs/2410.05779
- Tree-sitter repository: https://github.com/tree-sitter/tree-sitter
- SCIP Code Intelligence Protocol: https://github.com/sourcegraph/scip
