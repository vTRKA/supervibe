#!/usr/bin/env node
// Discover MCPs from user's Claude Code config and populate registry.
// Run from SessionStart hook OR manually.

import { discoverMcps, getRegistry } from './lib/mcp-registry.mjs';

const found = await discoverMcps({});
console.log(`[supervibe/mcp] discovered ${found.length} MCP(s):`);
for (const mcp of found) {
  console.log(`  - ${mcp.name}  (tools: ${mcp.tools.length})`);
}

const reg = await getRegistry();
console.log(`Registry: ${reg.mcps.length} MCPs, updated ${reg.updatedAt || 'never'}`);
