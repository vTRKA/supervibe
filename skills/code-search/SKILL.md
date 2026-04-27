---
name: code-search
namespace: process
description: "Use BEFORE making non-trivial changes to source code to find relevant existing code, similar patterns, and callers via hybrid keyword+semantic search"
allowed-tools: [Read, Grep, Glob, Bash]
phase: brainstorm
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: false
version: 1.0
last-verified: 2026-04-27
---

# Code Search

## When to invoke

BEFORE any non-trivial code change. Specifically:
- "How does X work in this codebase?" — agent searches semantically before reading
- "Where is X handled?" — find call sites + implementation
- "Are there similar patterns to Y?" — find reuse candidates
- "What depends on Z?" — find callers/usages
- BEFORE invoking any stack-developer agent on a new task

This skill replaces blind grep. It surfaces conceptually-related code even when keywords don't overlap, leveraging the multilingual-e5-small embedding model and FTS5 BM25 over the project's source files.

## Step 0 — Read source of truth (MANDATORY)

1. Verify code index exists: `.claude/memory/code.db`
2. If missing → run `node $CLAUDE_PLUGIN_ROOT/scripts/build-code-index.mjs` first
3. If memory watcher is running, file changes are auto-indexed; otherwise re-run after edits

## Decision tree

```
What's the search intent?
  Concept-level ("auth flow", "error handling pattern")
    → semantic-heavy: invoke without --lang/--kind, let semantic match
  Specific symbol/name (e.g., "loginHandler")
    → use --kind function-or-class --query "loginHandler"
  Language-specific feature ("Eloquent scope", "React hook")
    → --lang <language> + --query "<concept>"
  Just need callers of known symbol
    → use Grep tool directly (faster for exact-name lookups)
```

## Procedure

1. Verify index exists (Step 0)
2. Run: `node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --query "<topic>" [--lang <name>] [--limit 10]`
3. For each top hit (top 3-5):
   - Read the file at returned line range to get full context
   - Note kind (function/class/leftover) and name
4. If hits are stale (file changed since index): re-run `npm run code:index` then re-search
5. Synthesize for caller: list relevant file:line references + 1-line summary per

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

## Related

- `evolve:project-memory` — search past decisions/patterns (different corpus: markdown notes, not code)
- `evolve:_core:repo-researcher` — uses this skill as primary tool
- All stack-developer agents — invoke this BEFORE non-trivial implementation
