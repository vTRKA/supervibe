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

- AT SESSION START in any project
- WHEN user mentions: design / Figma / browser / playwright / desktop / Tauri / docs / library / scrape / web data
- BEFORE invoking agents that have `recommended-mcps:` in their frontmatter

This skill maps available MCPs to agents that benefit from them, so agents don't work blind to platform capabilities.

## Step 0 — Read source of truth (MANDATORY)

1. Check user's MCP availability — Claude Code lists MCPs as `mcp__<server>__<tool>` in tool list
2. Read agent frontmatter `recommended-mcps:` field for each agent likely to be invoked
3. Read `.claude/mcp-availability.yaml` if it exists (cached from prior discovery)

## MCP catalog → agent mapping (canonical)

| MCP server | Tools | Recommended for agents |
|------------|-------|------------------------|
| `context7` | resolve-library-id, query-docs | best-practices-researcher, dependency-researcher, all stack agents (for current API docs) |
| `firecrawl` | scrape, search, crawl, extract, browser | best-practices-researcher, competitive-design-researcher, security-researcher |
| `figma` | get_figma_data, download_figma_images | creative-director, ux-ui-designer, prototype-builder |
| `playwright` | browser_navigate, browser_snapshot, browser_click, etc. | qa-test-engineer, accessibility-reviewer, ui-polish-reviewer |
| `tauri` | webview_*, ipc_*, manage_window | tauri-engineer (when Tauri stack agent ships in v1.x) |
| `Gmail/Calendar/Drive` (claude_ai) | authenticate + tools | analytics-implementation, email-lifecycle |

## Decision tree

```
For each available MCP:
├─ Map to agents that benefit (per catalog above)
├─ For each beneficiary agent: emit suggestion to use MCP
└─ Cache mapping to .claude/mcp-availability.yaml

For tools requested via MCP not in catalog:
└─ Add to catalog (this skill self-extends via /evolve-strengthen on this skill)
```

## Procedure

1. **Discover** — list available MCP tools (parse from current session's tool list)
2. **Map** — match against catalog → derived list of agent → MCPs available to it
3. **Cache** to `.claude/mcp-availability.yaml`:
   ```yaml
   discovered-at: <ISO>
   mcps-available:
     context7: [resolve-library-id, query-docs]
     firecrawl: [scrape, search, crawl]
     figma: [get_figma_data]
     playwright: [browser_navigate, browser_snapshot, ...]
   agent-mcp-mapping:
     evolve:_ops:best-practices-researcher: [context7, firecrawl]
     evolve:_design:ux-ui-designer: [figma]
     evolve:_product:qa-test-engineer: [playwright]
   ```
4. **Emit recommendations** to main agent / orchestrator:
   ```
   📡 MCP availability detected:
   - context7 → boost best-practices/dependency research
   - figma → connect ux-ui-designer to design files
   - playwright → enable qa-test-engineer browser automation
   ```
5. **Per-agent invocation** — when an agent is invoked, prepend brief like:
   "MCP available for you: [list]. Use them when relevant to task."

## Output contract

Returns:
- `.claude/mcp-availability.yaml` written
- Recommendations list per agent
- Capability boost summary

## Guard rails

- DO NOT: assume MCP is available without verification (Claude Code session lists tools)
- DO NOT: force MCP use when traditional approach suffices (firecrawl when WebFetch is enough)
- DO NOT: ignore unavailable MCPs (graceful fallback documented)
- ALWAYS: cache discovery to avoid re-running every turn
- ALWAYS: respect agent's allowed-tools — recommended-mcps must be added to allowed-tools to actually work

## Verification

- mcp-availability.yaml written
- Per-agent mapping has ≥1 entry per available MCP
- Recommendations cited by source MCP catalog row

## Related

- `agents/_ops/*-researcher` — primary beneficiaries (context7, firecrawl)
- `agents/_design/*` — beneficiaries (figma)
- `agents/_product/qa-test-engineer` — beneficiary (playwright)
- `evolve:_meta:evolve-orchestrator` — invokes this at session start
