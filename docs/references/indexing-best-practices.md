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
  allowed to finish; progress lines are the liveness evidence.
- Use `SUPERVIBE_INDEX_PROGRESS_EVERY=<N>` or `--progress-every <N>` to tune
  progress logging for very large repositories.
- `--no-embeddings` is the BM25-only fallback for separating source-index
  readiness from embedding cost. It should not replace the full semantic index
  when the user wants best retrieval quality.
- Graph symbol extraction is a secondary layer. Source RAG can be ready while a
  language query is degraded; use `--strict-index-health` only when explicitly
  auditing graph extraction.

## Repair

- `scanCodeChanges()` must discover new source files even when `code.db` already exists.
- Repair must prune deleted rows, generated rows that were previously indexed, and rows outside the current source inventory.
- `node scripts/build-code-index.mjs --root . --force --health` is the explicit full-discovery health command.
- `node scripts/build-code-index.mjs --root . --force --health --no-embeddings` is the BM25-only source-readiness fallback.
- `node scripts/build-code-index.mjs --root . --explain-policy` prints include and exclude reasons for auditing.
