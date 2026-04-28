# MCP integrations (real wiring)

> Relocated from CLAUDE.md as part of Phase 1 token-economy plan. Content byte-identical.

Tools wired into agents via `tools:` array in frontmatter:

| MCP | Purpose | Used by |
|-----|---------|---------|
| `mcp-server-context7` | Current library docs (FS / npm / etc.) | All stack-developer agents, best-practices-researcher |
| `playwright` | Browser automation | competitive-design-researcher, e2e tests |
| `mcp-server-figma` | Read Figma designs | ux-ui-designer, prototype-builder |
| `mcp-server-firecrawl` | Web crawling / extraction | competitive-design-researcher, security-researcher |

Skill `supervibe:mcp-discovery` — when user task seems to need an external tool, check if an MCP exists before resorting to WebFetch.
