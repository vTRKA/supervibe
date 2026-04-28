# Anti-patterns (specific to THIS codebase — incidents fixed once, do not regress)

> Relocated from CLAUDE.md as part of Phase 1 token-economy plan. Content byte-identical.

- **Truncating before embedding** — v1.4.0 incident. Memory was sliced to 800 chars before embedding. Fixed by `chunker.mjs` + `entry_chunks` table. Always embed full chunks, never first-N-chars.
- **Single-language embedding** — pre-1.4.0 used English-only model; broke RU semantic search. multilingual-e5-small is mandatory.
- **`Parser.getLanguage()` on web-tree-sitter v0.26+** — that method was removed. Use `getLanguage(lang)` from grammar-loader and pass to `new Query(language, text)`.
- **`COALESCE` in PRIMARY KEY** — SQLite forbids expressions in PK. Use UNIQUE INDEX with expression instead (see `code_edges`).
- **Skipping graph extraction on hash-unchanged file** — files indexed before D4 had no symbols. `indexFile` now heals via "if no symbols, run extraction even on unchanged hash".
- **Husky 9 deprecation lines** — `#!/usr/bin/env sh` and `. "$(dirname -- "$0")/_/husky.sh"` are deprecated. Hook files contain commands only.
- **Force push to main** — never. Use `--force-with-lease` only after local rewrite (e.g., `git lfs migrate import`) and verify origin state matches expectations.
- **>100MB single file in git** — GitHub hard limit. Use Git LFS for `*.onnx`, `*.wasm`. `.gitattributes` already configured.
- **Native bindings** — `node-tree-sitter` requires C compiler at install. We use `web-tree-sitter` (WASM) instead. Never replace.
- **`npm install --no-save` packages then commit `node_modules/`** — only the files copied to `grammars/` go in repo; `node_modules/tree-sitter-*` are dev-time only.
