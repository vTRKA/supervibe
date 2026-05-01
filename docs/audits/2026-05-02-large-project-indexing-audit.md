# Large Project Indexing And Stack Detection Audit

Date: 2026-05-02

## Scope

The genesis/indexing flow must handle large existing projects without treating a
120 second tool timeout as a failed scaffold, without indexing dependency/cache
trees, and without blocking a ready source RAG because one language graph query
is degraded.

Project names and absolute local paths from user environments are intentionally
omitted.

## Findings

1. `build-code-index.mjs` has no internal total timeout, but genesis docs and
   skill instructions did not explicitly ban short caller-side total timeouts.
   This lets an installer or agent wrapper stop after 120 seconds even while the
   index is still making progress.
2. Index discovery already skips `node_modules`, `.git`, `.supervibe`, common
   build output, and virtualenv folders, but misses many large framework caches:
   `.pytest_cache`, `.mypy_cache`, `.ruff_cache`, `.tox`, `.nox`, `.eggs`,
   `.parcel-cache`, `.svelte-kit`, `.nuxt`, `.vercel`, `.netlify`, `.angular`,
   `.gradle`, `Pods`, and package-manager stores.
3. Python graph extraction can degrade because tree-sitter queries are version
   sensitive. Source chunks can still be indexed and searchable, so a graph-only
   symbol coverage issue should warn by default instead of making the whole
   index gate not ready.
4. `discoverGenesisStackFingerprint()` mostly reads `package.json` and
   `src-tauri/Cargo.toml`. It misses Python, Composer, Go, Ruby, Java, .NET,
   Flutter, Chrome Extension manifests, Docker Compose services, databases, and
   queues, so genesis can under-select agents/skills/rules.

## Fix Todo

- [x] Add regression tests for expanded skip directories and generated/cache
      exclusions.
- [x] Add regression tests that source RAG readiness is not blocked by graph-only
      symbol degradation unless strict graph mode is requested.
- [x] Add regression tests for no-total-timeout/progress guidance in the indexer
      and genesis instructions.
- [x] Add regression tests for Python/Next/Django/FastAPI/Postgres/Redis stack
      detection and agent recommendations.
- [x] Expand index policy skip directories and explain-policy diagnostics.
- [x] Add index progress logging with a no-total-timeout contract.
- [x] Add tree-sitter query fallback handling, especially for Python.
- [x] Make default health gate treat graph symbol degradation as warning and keep
      strict graph behavior available for explicit strict checks.
- [x] Expand genesis stack fingerprint detection and stack-to-agent mappings.
- [x] Update docs/skills/commands/changelog/version surfaces.
- [x] Run targeted tests, full `npm run check`, then commit and push to `main`.

## Target Acceptance

- `node scripts/build-code-index.mjs --root . --force --health --no-embeddings`
  shows progress and no fixed total timeout.
- `node scripts/supervibe-status.mjs --index-health --no-gc-hints` reports
  `READY: true` when source RAG coverage is healthy and graph degradation is only
  symbol coverage.
- `node scripts/supervibe-status.mjs --index-health --strict-index-health
  --no-gc-hints` can still fail on graph degradation for maintainers who want a
  stricter graph gate.
- Genesis dry-run recommendations include stack-specific agents, support skills,
  and rules from detected manifests instead of relying on a narrow package-only
  fingerprint.
