#!/usr/bin/env node
// Discover MCPs from user's Claude Code config and populate registry.
// Run from SessionStart hook OR manually.

import { discoverMcpCapabilities, discoverMcps, getRegistry } from './lib/mcp-registry.mjs';

const found = await discoverMcps({});
console.log(`[supervibe/mcp] discovered ${found.length} MCP(s):`);
for (const mcp of found) {
  console.log(`  - ${mcp.name}  (tools: ${mcp.tools.length})`);
}

const reg = await getRegistry();
console.log(`Registry: ${reg.mcps.length} MCPs, updated ${reg.updatedAt || 'never'}`);
const broker = await discoverMcpCapabilities({ refresh: false });
console.log(`Broker capabilities: ${Object.keys(broker.capabilities).sort().join(', ') || 'none'}`);
for (const mcp of broker.mcps) {
  console.log(`  capability-source: ${mcp.name} risk=${mcp.riskClass} host=${mcp.hostSources.join(',')}`);
}
