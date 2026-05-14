---
name: mcp-discovery
namespace: process
description: 'Use WHEN session starts OR WHEN user mentions visual/browser/desktop/data task to detect available MCP servers and proactively suggest agents that benefit from them. Triggers: ''найди MCP'', ''какие tools доступны'', ''есть MCP для'', ''mcp discovery''.'
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

## Overview

Mcp Discovery provides a reusable Supervibe operating method for Use WHEN session starts OR WHEN user mentions visual/browser/desktop/data task to detect available MCP servers and proactively suggest agents that benefit from them. Triggers: 'найди MCP', 'какие tools доступны', 'есть MCP для', 'mcp discovery'.
It keeps the work evidence-first, scope-bounded, confidence-scored, and verified before completion claims.
## When to Use

BEFORE picking a tool for current-docs research / browser automation / Tauri desktop testing / design extraction / web crawling. Don't hardcode `mcp__context7__*` in agent procedures — invoke this skill to find the best available tool for the task.

## Expert Operating Standard

Follow `docs/references/skill-expert-operating-standard.md`: start from source of truth, preserve retrieval evidence, apply scope safety, use real producers with runtime receipts for durable delegated outputs, verify before completion claims, and keep confidence below gate when evidence is partial.

## Step 0 — Read source of truth

1. Run `node <resolved-supervibe-plugin-root>/scripts/discover-mcps.mjs` (or rely on SessionStart having done it)
2. Read `.supervibe/memory/mcp-registry.json`

## Decision tree — task → MCP preference

```
Need current docs / library API?
  Preference order: context7 > ref > WebFetch
Need browser automation / screenshots?
  Preference order: playwright > skip
Need Tauri desktop app testing, native webview state, IPC, windows, logs, or devices?
  Preference order: tauri > playwright (frontend preview only) > skip
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
| Tauri desktop testing | tauri | Playwright only for browser-hosted frontend preview | session target, available webview/ipc/window/log/device tool groups |
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
- for Tauri, available tool groups (`webview`, `ipc`, `window`, `logs`, `devices`),
- whether the result is current or cached,
- any limitation that affects confidence.

## Procedure

1. Identify the task category (current-docs / browser / desktop-tauri / figma / crawl / search)
2. Look up preference list for that category
3. Call `pickMcp(preferenceList)` from `scripts/lib/mcp-registry.mjs` — returns first available, or `null`
4. If MCP available: use its canonical tools (e.g. `mcp__mcp-server-context7__query-docs`)
5. If no MCP available: fall back to native tools (WebFetch / WebSearch / Grep / Read)
6. Document choice in agent output: "Used MCP `<name>`" OR "No suitable MCP, fell back to `<native>`"

## When not to use

- Do not use this skill to bypass the command or workflow that owns durable artifacts.
- Do not use it when source evidence, RAG/CodeGraph, or required verification is missing.
- Do not use it to replace a specialist producer, worker, or reviewer that must issue runtime evidence.

## Common rationalizations

- "This is small, so no source check is needed" - reject when the skill changes code, config, or durable artifacts.
- "The user asked for speed, so skip receipts" - reject when durable work, delegation, or review is claimed.
- "Existing prose is enough evidence" - reject when validators or command output are required.

## Red flags

- A durable artifact changes without a command, receipt, or verification path.
- The skill is used outside its phase without an explicit handoff.
- Claims of completion appear before evidence and confidence scoring.

## Checklist

- Source of truth read.
- Scope and owner confirmed.
- RAG/CodeGraph/memory requirement decided.
- Evidence artifact or command recorded.
- Stop condition and next handoff clear.

## Failure modes

- Inline emulation replaces a required producer or reviewer.
- Broad use of the skill slows delivery without improving evidence.
- Missing verification lets stale assumptions pass as production-ready.

## Output contract

Returns:
- `{ mcp: '<name>' | null, tools: ['<tool1>', '<tool2>'], fallback: '<reason>' | null }`
- Cite in agent output

## Anti-patterns

- **Hardcoding `tools: [mcp__context7__*]` in agent frontmatter** → breaks when user lacks context7
- **Assuming Tauri MCP is screenshot-only** → misses driver session, webview DOM, IPC monitoring, backend state, logs, windows, setup, and device tools when available
- **Using Playwright for native Tauri IPC/window/log verification** → only validates a browser preview, not the Rust desktop shell
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
