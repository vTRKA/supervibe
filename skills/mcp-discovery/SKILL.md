---
name: mcp-discovery
namespace: process
description: "Use WHEN session starts OR WHEN user mentions visual/browser/desktop/data task to detect available MCP servers and proactively suggest agents that benefit from them"
allowed-tools: [Read, Grep, Glob, Bash]
phase: brainstorm
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: false
version: 1.0
last-verified: 2026-04-27
---

# MCP Discovery

## When to invoke

BEFORE picking a tool for current-docs research / browser automation / design extraction / web crawling. Don't hardcode `mcp__context7__*` in agent procedures — invoke this skill to find the best available tool for the task.

## Step 0 — Read source of truth

1. Run `node $CLAUDE_PLUGIN_ROOT/scripts/discover-mcps.mjs` (or rely on SessionStart having done it)
2. Read `.claude/memory/mcp-registry.json`

## Decision tree — task → MCP preference

```
Need current docs / library API?
  Preference order: context7 > ref > WebFetch
Need browser automation / screenshots?
  Preference order: playwright > tauri (desktop) > skip
Need to extract design from Figma?
  Preference order: figma → if absent, ask user for screenshots
Need to crawl a website?
  Preference order: firecrawl > playwright (one-page) > WebFetch
Need general web search?
  Preference order: firecrawl-search > WebSearch
```

## Procedure

1. Identify the task category (current-docs / browser / figma / crawl / search)
2. Look up preference list for that category
3. Call `pickMcp(preferenceList)` from `scripts/lib/mcp-registry.mjs` — returns first available, or `null`
4. If MCP available: use its canonical tools (e.g. `mcp__mcp-server-context7__query-docs`)
5. If no MCP available: fall back to native tools (WebFetch / WebSearch / Grep / Read)
6. Document choice in agent output: "Used MCP `<name>`" OR "No suitable MCP, fell back to `<native>`"

## Output contract

Returns:
- `{ mcp: '<name>' | null, tools: ['<tool1>', '<tool2>'], fallback: '<reason>' | null }`
- Cite in agent output

## Anti-patterns

- **Hardcoding `tools: [mcp__context7__*]` in agent frontmatter** → breaks when user lacks context7
- **Calling MCP tool without checking availability** → cryptic error
- **Not surfacing fallback choice** → user can't tell why agent took longer / had less detail
- **Falling back silently** → user thinks MCP was used; can't diagnose

## Verification

- `getRegistry()` returns ≥1 MCP OR explicit fallback documented
- Output names which MCP was used (or "no MCP, fell back to X")

## Related

- Tool: `scripts/lib/mcp-registry.mjs` — registry helpers
- Tool: `scripts/discover-mcps.mjs` — refresh registry
- Status: `npm run evolve:status` shows available MCPs
- Used by: best-practices-researcher / competitive-design-researcher / dependency-researcher / preview-server (for screenshots)
