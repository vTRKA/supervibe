---
name: mcp-discovery
namespace: process
description: >-
  Use WHEN session starts OR WHEN user mentions visual/browser/desktop/data task
  to detect available MCP servers and proactively suggest agents that benefit
  from them. Triggers: 'найди MCP', 'какие tools доступны', 'есть MCP для', 'mcp
  discovery'.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
phase: brainstorm
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: false
version: 1
last-verified: 2026-04-27T00:00:00.000Z
---

# MCP Discovery

## When to invoke

BEFORE picking a tool for current-docs research / browser automation / design extraction / web crawling. Don't hardcode `mcp__context7__*` in agent procedures — invoke this skill to find the best available tool for the task.

## Step 0 — Read source of truth

1. Run `node <resolved-supervibe-plugin-root>/scripts/discover-mcps.mjs` (or rely on SessionStart having done it)
2. Read `.supervibe/memory/mcp-registry.json`

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

## Capability matrix

| Task | Preferred MCP | Fallback | Must report |
|------|---------------|----------|-------------|
| Current library docs | context7 | official docs via web | library id and version if known |
| Browser interaction | playwright | static scrape or manual instructions | URL, viewport, screenshot path when used |
| Figma/design extraction | figma | screenshot or exported assets | file key, node id, downloaded assets |
| Web crawl | firecrawl | targeted scrape/search | URL set and extraction format |
| Search/news | firecrawl-search | web search | recency and source links |
| Local document parse | firecrawl-parse | direct file read if plain text | path and parser choice |
| Calendar/mail/drive | installed app connector | ask user to enable/install | connector availability |

## No-prompt path

If discovery was already run by session startup, do not interrupt the user.
Read the registry and choose the best available tool. Ask only when:
- the task requires a connector that is not installed,
- the user must provide a URL, file, or Figma node,
- the fallback would materially reduce quality,
- using a tool would mutate external state.

## Output evidence

Always include:
- selected MCP or `none`,
- fallback reason if no MCP was used,
- exact tool family used,
- whether the result is current or cached,
- any limitation that affects confidence.

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

## Guard rails

- Do not mutate files, provider state, network resources, or external tools unless this skill's procedure and the user approval path allow it.
- Do not skip prerequisites, confidence gates, policy gates, or explicit approval gates.
- Do not claim completion without concrete verification evidence.
- Preserve user-owned content and unrelated worktree changes.

## Related

- Tool: `scripts/lib/mcp-registry.mjs` — registry helpers
- Tool: `scripts/discover-mcps.mjs` — refresh registry
- Status: `npm run supervibe:status` shows available MCPs
- Used by: best-practices-researcher / competitive-design-researcher / dependency-researcher / preview-server (for screenshots)
