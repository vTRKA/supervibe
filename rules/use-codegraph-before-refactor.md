---
name: use-codegraph-before-refactor
id: use-codegraph-before-refactor
title: Use code graph to assess blast radius before refactor
description: "Before any refactor / rename / extract / move / inline / delete that touches a public symbol, run supervibe:code-search graph queries to enumerate the blast radius and cite caller evidence. RU: BEFORE rename / move / extract / delete на public symbol — обязателен --callers первым для оценки blast radius. Trigger phrases: 'переименуй', 'rename', 'refactor'."
applies-to: [refactor, rename, extract-method, move-file, inline, delete-public-symbol, rename-symbol]
applies-when: ["refactor", "rename", "extract-method", "move-file", "inline", "delete-public-symbol", "rename-symbol"]
mandatory: true
severity: critical
trigger-skills: [supervibe:code-search]
created: 2026-04-27
last-verified: 2026-04-27
last-fired: null
fire-count: 0
sunset: null
version: 1.0
related-rules: [anti-hallucination, no-dead-code, confidence-discipline]
---

# Rule: Use Code Graph Before Refactor

## What

For ANY change that modifies the public surface of code (rename, extract, move, inline, delete) — first run `supervibe:code-search` graph queries to enumerate the blast radius.

## Why

Past incidents in this and other projects: silent breakage from "I'll just rename this" turning into 30 broken callers because the surface wasn't mapped first. The semantic RAG won't find these — only the graph does.

Specifically: a rename in TypeScript broke production because 3 callers in a Python service imported via JSON contract — caught by `--callers` (documented edge in graph), missed by grep + RAG.

## How to apply

**BEFORE making any structural change:**

1. Identify the symbol being modified (function, class, method, type)
2. Run:
   ```bash
   node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --callers "<symbol-name>"
   ```
3. Read each caller. Decide:
   - **0 callers**: safe to proceed (still validate with `--neighbors` for indirect refs)
   - **1–10 callers**: update them in the same PR
   - **>10 callers OR cross-module**: escalate to architect-reviewer for ADR before proceeding
4. If renaming: after the change, verify `--callers "<old-name>"` returns 0
5. Check semantic anchors when present:
   ```bash
   /supervibe-status --anchors --file <touched-file>
   /supervibe-loop --anchor-doctor
   ```
   Anchored refactors must preserve listed invariants or document the reviewed
   contract update.
6. Cite graph and anchor evidence in PR description / output contract using the Case A/B/C template

## When NOT to apply

- Greenfield code (no prior callers possible)
- Pure-internal refactor that doesn't change public surface (e.g., variable renames inside a function)
- File-only changes (formatting, comments) — graph not affected

## Discipline

This rule auto-fires for skills/agents tagged with `applies-when` keywords above (refactor / rename / etc.). The agent will be **blocked from completing** the task until graph evidence is shown in output contract.

Override: if graph query genuinely doesn't apply (e.g., adding new endpoint, no symbol changes), state explicitly in output: "Graph queries: N/A (additive change, no symbol modifications)".

## Related

- skill: `supervibe:code-search`
- agent: `refactoring-specialist`, `code-reviewer`, `architect-reviewer`
- rubric: `agent-delivery` evidence dimension
