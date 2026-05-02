---
name: code-search
namespace: process
description: "Use BEFORE making non-trivial changes to source code to find relevant existing code, similar patterns, and callers via hybrid keyword+semantic search. RU: Используется ПЕРЕД нетривиальными изменениями кода — находит релевантный код, схожие паттерны и вызовы через гибридный поиск (keyword + semantic + graph). Trigger phrases: 'найди код', 'кто вызывает', 'callers <symbol>', 'где используется'."
allowed-tools: [Read, Grep, Glob, Bash]
phase: brainstorm
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: false
version: 1.1
last-verified: 2026-05-02
---

# Code Search

Retrieval policy: code RAG is mandatory for code changes, unfamiliar code, bug
fixes, implementation planning and stack discovery. Codegraph is mandatory for
rename, move, delete, extract, public API change, dependency impact analysis,
architecture review and multi-file refactor.

## When to invoke

BEFORE any non-trivial code change. Specifically:
- "How does X work in this codebase?" — agent searches semantically before reading
- "Where is X handled?" — find call sites + implementation
- "Are there similar patterns to Y?" — find reuse candidates
- "What depends on Z?" — find callers/usages
- BEFORE invoking any stack-developer agent on a new task

This skill replaces blind grep. It surfaces conceptually-related code even when keywords don't overlap, leveraging the multilingual-e5-small embedding model and FTS5 BM25 over the project's source files.

## Step 0 — Read source of truth (required)

1. Verify code index exists: `.supervibe/memory/code.db`
2. If missing → run `node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --resume --source-only --max-files 200 --max-seconds 120 --health --json-progress` from the project root first; after source coverage is healthy, run `node <resolved-supervibe-plugin-root>/scripts/build-code-index.mjs --root . --resume --graph --max-files 200 --health` when graph data is needed
3. If memory watcher is running, file changes are auto-indexed; otherwise re-run after edits

## Decision tree

```
What's the search intent?
  "How does X work?" / concept-level                  → SEMANTIC: --query "<topic>"
  "Where is X defined?"                                → SEMANTIC + Read top hit at file:line
  "Who calls X?" / "what depends on X?"                → GRAPH: --callers "X"
  "What does X depend on?"                             → GRAPH: --callees "X"
  "Show me everything around X"                        → GRAPH: --neighbors "X" --depth 2
  "What are the most important parts of this code?"    → GRAPH: --top-symbols 20
  "Find similar patterns to X"                         → SEMANTIC then GRAPH expand
  Just need exact symbol name (no neighborhood)        → use Grep tool (faster)
```

## Procedure

1. Verify index fresh: `node <resolved-supervibe-plugin-root>/scripts/supervibe-status.mjs` (or rely on SessionStart banner)
2. Pick mode from decision tree
3. **Semantic**: `node <resolved-supervibe-plugin-root>/scripts/search-code.mjs --query "<text>" [--lang <lang>] [--limit 10]`
4. **Graph — callers/callees**: `node <resolved-supervibe-plugin-root>/scripts/search-code.mjs --callers "<symbol>"` (or --callees)
5. **Graph — neighborhood**: `... --neighbors "<symbol>" --depth <1-3>`
6. **Graph — top symbols**: `... --top-symbols 20 [--kind class]` for orientation in unfamiliar code
7. **Hybrid (recommended for refactor / impact analysis)**:
   - First semantic: find ≥1 candidate symbol
   - Then graph expand: `--callers "<top-hit-name>"` then `--neighbors "<top-hit-name>" --depth 2`
   - Read top file:line refs in full for context
8. **Disambiguation**: if a name has multiple definitions, the CLI prints all candidates. Re-run with full ID `path:kind:name:line` to pin down one
9. If hits stale (file changed since index): run `node <resolved-supervibe-plugin-root>/scripts/supervibe-commands.mjs --match "run code:index"` and execute the printed `COMMAND:` from the project root, or wait for the watcher, then retry

## Additional agent modes

Use these before broad file reads:
- `--context "<task or symbols>"` builds an agent-ready pack from RAG chunks, entry symbols, graph neighborhood, impact radius, related files, and semantic anchors.
- `--symbol-search "<query>"` returns ranked definitions/locations only.
- `--impact "<symbol>" --depth 2` traces inbound blast radius for refactors and public API changes.
- `--files "src/app"` lists indexed files with language and symbol counts.

For refactors, prefer `--impact` plus `--neighbors` over raw grep. The graph resolver is import-aware and intentionally leaves ambiguous same-name edges unresolved instead of guessing.

## Quality standard

Agent-facing retrieval is not just "some hits were found." A high-quality context pack must show:

- rewritten query and retrieval stage counts (`rewrite`, `exact-symbol`, `fts`, `embedding`, `repo-map`, `graph-neighbor`, `dedupe`, `rerank`);
- selected source citations with file:line ranges;
- fallback reason when results are empty, weak, or truncated;
- entry symbols, graph neighborhood, and impact radius when structural work is possible;
- semantic anchors when files define them;
- Graph Quality Gates: generated-file leakage, minified top symbols, symbol coverage, cross-file edge resolution, and warnings.

If `--context` reports graph quality warnings, keep source RAG usable but do not perform a structural refactor until the graph query needed for that refactor has explicit Case A/B/C evidence.

## Output contract

Returns:
- List of ≤10 file:line references with kind/name
- Top 1-3 read in full for context
- Summary: "Relevant code for <query>: <files>"

## Guard rails

- DO NOT: skip code-search and rely on agent's pretrained knowledge — that's hallucination risk
- DO NOT: trust stale index (always check `git status` for uncommitted changes that might not be indexed)
- DO NOT: return more than 10 hits (signal-to-noise drops)
- ALWAYS: cite file:line in output so user can navigate
- ALWAYS: prefer semantic search for concept queries; Grep tool for known exact names

## Verification

- search-code.mjs returns >0 results OR explicit "no matches"
- Top hits read for context before claiming complete
- `--context` output includes Retrieval Quality and Graph Quality Gates when used for agent handoff

## Related

- `supervibe:project-memory` — search past decisions/patterns (different corpus: markdown notes, not code)
- `supervibe:_core:repo-researcher` — uses this skill as primary tool
- All stack-developer agents — invoke this BEFORE non-trivial implementation
