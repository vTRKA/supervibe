# Indexing Best Practices

Supervibe code indexing uses one policy module: `scripts/lib/supervibe-index-policy.mjs`.

## Source Inventory

- Walk the workspace every repair pass; do not rely only on existing `code.db` rows.
- Include supported source extensions resolved by `code-chunker.detectLanguage()`.
- Keep default source roots visible for operators: `src`, `src-tauri`, `app`, `lib`, `scripts`, `commands`, `skills`, `agents`, `rules`, `tests`, and `packages`.

## Exclusions

- Never index generated output directories such as `dist`, `dist-check`, `build`, `out`, `.next`, `coverage`, `.turbo`, or `target`.
- Never index local state directories such as `.claude`, `.supervibe`, `.git`, `node_modules`, virtualenv folders, or vendored dependencies.
- Skip minified bundles, test/spec files, and TypeScript declaration files for source RAG.

## Repair

- `scanCodeChanges()` must discover new source files even when `code.db` already exists.
- Repair must prune deleted rows, generated rows that were previously indexed, and rows outside the current source inventory.
- `node scripts/build-code-index.mjs --root . --force --health` is the explicit full-discovery health command.
- `node scripts/build-code-index.mjs --root . --explain-policy` prints include and exclude reasons for auditing.
