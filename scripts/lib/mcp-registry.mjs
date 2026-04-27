// MCP Registry — discover available MCPs from user's Claude Code config,
// persist to .claude/memory/mcp-registry.json so agents can query.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const PROJECT_ROOT = process.cwd();
let _registryPath = join(PROJECT_ROOT, '.claude', 'memory', 'mcp-registry.json');

export function REGISTRY_PATH_FOR_TEST(path) { _registryPath = path; }

function defaultConfigCandidates() {
  return [
    join(homedir(), '.claude.json'),
    join(homedir(), '.config', 'claude', 'config.json'),
    join(PROJECT_ROOT, '.claude', 'config.json'),
  ];
}

// Tool name patterns — canonical mapping from MCP name → tool prefix it exposes.
const KNOWN_MCP_TOOLS = {
  context7: ['mcp__mcp-server-context7__resolve-library-id', 'mcp__mcp-server-context7__query-docs'],
  playwright: ['mcp__playwright__browser_navigate', 'mcp__playwright__browser_take_screenshot', 'mcp__playwright__browser_snapshot'],
  figma: ['mcp__mcp-server-figma__get_figma_data', 'mcp__mcp-server-figma__download_figma_images'],
  firecrawl: ['mcp__mcp-server-firecrawl__firecrawl_scrape', 'mcp__mcp-server-firecrawl__firecrawl_crawl', 'mcp__mcp-server-firecrawl__firecrawl_search'],
  tauri: ['mcp__tauri__webview_screenshot'],
};

/**
 * Discover MCPs from a config file. Returns array of {name, command, available}.
 */
export async function discoverMcps({ configPath = null } = {}) {
  let path = configPath;
  if (!path) {
    for (const c of defaultConfigCandidates()) {
      if (existsSync(c)) { path = c; break; }
    }
  }
  if (!path || !existsSync(path)) return [];

  let raw;
  try { raw = await readFile(path, 'utf8'); }
  catch { return []; }

  let json;
  try { json = JSON.parse(raw); }
  catch { return []; }

  const servers = json.mcpServers || json.mcp_servers || {};
  const found = [];
  for (const [name, def] of Object.entries(servers)) {
    found.push({
      name,
      command: def.command || '',
      args: def.args || [],
      tools: KNOWN_MCP_TOOLS[name] || [],
      discoveredAt: new Date().toISOString(),
    });
  }

  await mkdir(dirname(_registryPath), { recursive: true });
  await writeFile(_registryPath, JSON.stringify({ mcps: found, updatedAt: new Date().toISOString() }, null, 2));

  return found;
}

/** Read the registry. */
export async function getRegistry({ refresh = false } = {}) {
  if (refresh) await discoverMcps({});
  if (!existsSync(_registryPath)) return { mcps: [], updatedAt: null };
  try {
    const raw = await readFile(_registryPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { mcps: [], updatedAt: null };
  }
}

/** Quick check if a specific MCP is available. */
export async function hasMcp(name) {
  const reg = await getRegistry();
  return reg.mcps.some(m => m.name === name);
}

/** Get the tool prefixes a given MCP exposes. */
export function getMcpTools(name) {
  return KNOWN_MCP_TOOLS[name] || [];
}

/** Pick first available MCP from a preference list. */
export async function pickMcp(preferenceList) {
  const reg = await getRegistry();
  const available = new Set(reg.mcps.map(m => m.name));
  for (const name of preferenceList) {
    if (available.has(name)) return name;
  }
  return null;
}
