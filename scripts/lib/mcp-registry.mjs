// MCP Registry - discover configured and runtime-observed MCPs without
// treating unconfigured desired tools as available.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const PROJECT_ROOT = process.cwd();
let _registryPath = join(PROJECT_ROOT, '.supervibe', 'memory', 'mcp-registry.json');

export function REGISTRY_PATH_FOR_TEST(path) { _registryPath = path; }

function defaultConfigCandidates() {
  return [
    configCandidate(join(homedir(), '.claude.json'), 'claude', 'json'),
    configCandidate(join(homedir(), '.config', 'claude', 'config.json'), 'claude', 'json'),
    configCandidate(join(PROJECT_ROOT, '.claude', 'config.json'), 'claude', 'json'),
    configCandidate(join(homedir(), '.codex', 'config.toml'), 'codex', 'toml'),
    configCandidate(join(PROJECT_ROOT, '.codex', 'config.toml'), 'codex', 'toml'),
    configCandidate(join(homedir(), '.gemini', 'settings.json'), 'gemini', 'json'),
    configCandidate(join(PROJECT_ROOT, '.gemini', 'settings.json'), 'gemini', 'json'),
    configCandidate(join(homedir(), '.cursor', 'mcp.json'), 'cursor', 'json'),
    configCandidate(join(PROJECT_ROOT, '.cursor', 'mcp.json'), 'cursor', 'json'),
    configCandidate(join(homedir(), '.config', 'opencode', 'opencode.json'), 'opencode', 'json'),
    configCandidate(join(PROJECT_ROOT, 'opencode.json'), 'opencode', 'json'),
  ];
}

function configCandidate(path, host = 'unknown', format = inferConfigFormat(path)) {
  return { path, host, format };
}

const TAURI_MCP_TOOLS = [
  'mcp__tauri__driver_session',
  'mcp__tauri__webview_screenshot',
  'mcp__tauri__webview_find_element',
  'mcp__tauri__webview_dom_snapshot',
  'mcp__tauri__webview_interact',
  'mcp__tauri__webview_keyboard',
  'mcp__tauri__webview_execute_js',
  'mcp__tauri__webview_wait_for',
  'mcp__tauri__webview_get_styles',
  'mcp__tauri__webview_select_element',
  'mcp__tauri__webview_get_pointed_element',
  'mcp__tauri__ipc_execute_command',
  'mcp__tauri__ipc_monitor',
  'mcp__tauri__ipc_get_captured',
  'mcp__tauri__ipc_emit_event',
  'mcp__tauri__ipc_get_backend_state',
  'mcp__tauri__manage_window',
  'mcp__tauri__read_logs',
  'mcp__tauri__get_setup_instructions',
  'mcp__tauri__list_devices',
];

const OPENAI_DEVELOPER_DOCS_TOOLS = [
  'mcp__openaiDeveloperDocs__search_openai_docs',
  'mcp__openaiDeveloperDocs__fetch_openai_doc',
  'mcp__openaiDeveloperDocs__get_openapi_spec',
  'mcp__openaiDeveloperDocs__list_api_endpoints',
  'mcp__openaiDeveloperDocs__list_openai_docs',
];

const KNOWN_MCP_TOOLS = {
  context7: ['mcp__mcp-server-context7__resolve-library-id', 'mcp__mcp-server-context7__query-docs'],
  playwright: ['mcp__playwright__browser_navigate', 'mcp__playwright__browser_take_screenshot', 'mcp__playwright__browser_snapshot'],
  browser: ['mcp__playwright__browser_navigate', 'mcp__playwright__browser_take_screenshot', 'mcp__playwright__browser_snapshot'],
  figma: ['mcp__mcp-server-figma__get_figma_data', 'mcp__mcp-server-figma__download_figma_images'],
  firecrawl: ['mcp__mcp-server-firecrawl__firecrawl_scrape', 'mcp__mcp-server-firecrawl__firecrawl_crawl', 'mcp__mcp-server-firecrawl__firecrawl_search'],
  'openai-docs': OPENAI_DEVELOPER_DOCS_TOOLS,
  openaiDeveloperDocs: OPENAI_DEVELOPER_DOCS_TOOLS,
  tauri: TAURI_MCP_TOOLS,
};

const ADAPTER_TOOL_OVERLAYS = {
  codex: {
    context7: ['mcp__mcp_server_context7__resolve_library_id', 'mcp__mcp_server_context7__query_docs'],
    playwright: ['mcp__playwright__browser_navigate', 'mcp__playwright__browser_take_screenshot', 'mcp__playwright__browser_snapshot'],
    browser: ['mcp__playwright__browser_navigate', 'mcp__playwright__browser_take_screenshot', 'mcp__playwright__browser_snapshot'],
    figma: ['mcp__mcp_server_figma__get_figma_data', 'mcp__mcp_server_figma__download_figma_images'],
    firecrawl: ['mcp__mcp_server_firecrawl__firecrawl_scrape', 'mcp__mcp_server_firecrawl__firecrawl_crawl', 'mcp__mcp_server_firecrawl__firecrawl_search'],
    openaiDeveloperDocs: OPENAI_DEVELOPER_DOCS_TOOLS,
    'openai-docs': OPENAI_DEVELOPER_DOCS_TOOLS,
  },
};

const MCP_DEFINITIONS = {
  context7: {
    name: 'context7',
    capabilityId: 'context7',
    capabilities: ['docs', 'research'],
    riskClass: 'read',
    desiredBy: ['supervibe:mcp-discovery'],
    fallback: 'official docs via web',
    aliases: ['context7', 'mcp-server-context7', 'mcp_server_context7'],
    toolPatterns: [/^mcp__(?:mcp[-_]server[-_])?context7__/i],
  },
  playwright: {
    name: 'playwright',
    capabilityId: 'browser',
    capabilities: ['browser', 'qa', 'visual'],
    riskClass: 'interactive',
    desiredBy: ['supervibe:mcp-discovery'],
    fallback: 'static scrape or manual verification',
    aliases: ['playwright', 'browser'],
    toolPatterns: [/^mcp__playwright__/i],
  },
  figma: {
    name: 'figma',
    capabilityId: 'figma',
    capabilities: ['design', 'assets'],
    riskClass: 'read',
    desiredBy: ['supervibe:mcp-discovery'],
    fallback: 'user-provided screenshot or exported assets',
    aliases: ['figma', 'mcp-server-figma', 'mcp_server_figma'],
    toolPatterns: [/^mcp__(?:mcp[-_]server[-_])?figma__/i],
  },
  firecrawl: {
    name: 'firecrawl',
    capabilityId: 'firecrawl',
    capabilities: ['research', 'web'],
    riskClass: 'read',
    desiredBy: ['supervibe:mcp-discovery'],
    fallback: 'targeted web search or browser scrape',
    aliases: ['firecrawl', 'mcp-server-firecrawl', 'mcp_server_firecrawl'],
    toolPatterns: [/^mcp__(?:mcp[-_]server[-_])?firecrawl__/i],
  },
  openaiDeveloperDocs: {
    name: 'openaiDeveloperDocs',
    capabilityId: 'openai-docs',
    capabilities: ['docs', 'openai', 'api', 'research'],
    riskClass: 'read',
    desiredBy: ['supervibe:mcp-discovery', 'openai-docs'],
    fallback: 'official OpenAI docs via web',
    aliases: ['openai-docs', 'openai_docs', 'openaideveloperdocs', 'openaiDeveloperDocs'],
    toolPatterns: [/^mcp__openaiDeveloperDocs__/i, /^mcp__openai[-_]?docs__/i],
  },
  tauri: {
    name: 'tauri',
    capabilityId: 'tauri',
    capabilities: ['desktop', 'visual', 'qa', 'ipc'],
    riskClass: 'interactive',
    desiredBy: ['supervibe:mcp-discovery'],
    fallback: 'Playwright frontend preview only',
    aliases: ['tauri'],
    toolPatterns: [/^mcp__tauri__/i],
  },
};

const DESIRED_CAPABILITY_ORDER = ['context7', 'browser', 'figma', 'firecrawl', 'openai-docs', 'tauri'];
const RUNTIME_TOOL_ENV_KEYS = ['SUPERVIBE_RUNTIME_MCP_TOOLS', 'SUPERVIBE_AVAILABLE_MCP_TOOLS', 'SUPERVIBE_AVAILABLE_TOOLS'];
const RUNTIME_TOOL_FILE_ENV_KEYS = ['SUPERVIBE_RUNTIME_MCP_TOOLS_FILE', 'SUPERVIBE_AVAILABLE_TOOLS_FILE'];
const SAFE_TOOL_NAME = /^mcp__[A-Za-z0-9_-]+__[A-Za-z0-9_-]+$/;

export async function discoverMcps({ configPath = null, host = null, runtimeTools = null, runtimeToolsPath = null, env = process.env, allowConfigToolFallback = true } = {}) {
  const now = new Date().toISOString();
  const resolvedHost = normalizeHost(host || env.SUPERVIBE_HOST || detectHostFromEnv(env));
  const configuredMcps = await readConfiguredMcps({ configPath, host, now });
  const runtimeToolInput = await readRuntimeToolInput({ runtimeTools, runtimeToolsPath, env });
  const hasRuntimeDiscovery = runtimeToolInput !== null;
  const runtimeEntries = hasRuntimeDiscovery ? discoverRuntimeEntries(runtimeToolInput, { host: resolvedHost, now }) : [];
  const configEntries = allowConfigToolFallback && !runtimeEntries.length
    ? configuredMcps.map((entry) => buildMcpEntry({
      definition: getDefinition(entry.name) || definitionFromConfiguredEntry(entry),
      rawName: entry.rawName,
      def: entry.def,
      tools: getMcpTools(entry.name, { host: entry.host }),
      host: entry.host,
      source: 'provider-config',
      now,
      configSource: entry.configSource,
      available: true,
    })).filter((entry) => entry.availableTools.length > 0)
    : [];
  const mcps = mergeMcpEntries(runtimeEntries, configEntries);
  const desiredCapabilities = buildDesiredCapabilities(unique([
    ...configuredMcps.map((entry) => entry.name),
    ...runtimeEntries.map((entry) => entry.name),
  ]));
  const registry = buildRegistry({
    mcps,
    configuredMcps,
    desiredCapabilities,
    hasRuntimeDiscovery,
    runtimeToolCount: countRuntimeTools(runtimeToolInput),
    host: resolvedHost,
    now,
    configFallbackUsed: configEntries.length > 0,
  });

  await mkdir(dirname(_registryPath), { recursive: true });
  await writeFile(_registryPath, JSON.stringify(registry, null, 2), 'utf8');
  return registry.mcps;
}

export async function getRegistry({ refresh = false } = {}) {
  if (refresh) await discoverMcps({});
  if (!existsSync(_registryPath)) return emptyRegistry();
  try {
    const raw = await readFile(_registryPath, 'utf8');
    return normalizeRegistry(JSON.parse(raw));
  } catch {
    return emptyRegistry();
  }
}

export async function discoverMcpCapabilities({ refresh = false } = {}) {
  return getRegistry({ refresh });
}

export async function hasMcp(name) {
  const reg = await getRegistry();
  return (reg.mcps || []).some((mcp) => mcp.available !== false && matchesMcpOrCapability(mcp, name));
}

export function getMcpTools(name, options = {}) {
  const host = typeof options === 'string' ? options : options.host;
  const definition = getDefinition(name);
  if (!definition) return [];
  return [...resolveKnownTools(definition, { host })];
}

export function getMcpToolBindings(name) {
  const definition = getDefinition(name);
  if (!definition) return null;
  return {
    name: definition.name,
    capabilityId: definition.capabilityId,
    canonicalTools: [...resolveKnownTools(definition)],
    adapterTools: Object.fromEntries(Object.entries(ADAPTER_TOOL_OVERLAYS).map(([host, overlay]) => [
      host,
      [...(overlay[definition.name] || overlay[definition.capabilityId] || resolveKnownTools(definition))],
    ])),
  };
}

export async function pickMcp(preferenceList) {
  const reg = await getRegistry();
  for (const name of preferenceList) {
    const match = (reg.mcps || []).find((mcp) => mcp.available !== false && matchesMcpOrCapability(mcp, name));
    if (match) return match.name;
  }
  return null;
}

export function scanMcpToolDescriptions(tools = []) {
  const required = [
    ['missing-purpose', /reads?|writes?|updates?|scrapes?|navigates?|downloads?|uploads?/i],
    ['missing-inputs', /\binputs?\b/i],
    ['missing-side-effects', /\bside effects?\b/i],
    ['missing-auth', /\bauth\b|authentication|credentials?/i],
    ['missing-failure-modes', /\bfailure modes?\b|errors?|timeouts?/i],
    ['missing-example', /\bexample\b/i],
    ['missing-token-cost', /\btoken cost\b|cost\b/i],
  ];
  const findings = [];
  for (const tool of tools) {
    const description = String(tool.description || '');
    for (const [code, pattern] of required) {
      if (!pattern.test(description)) {
        findings.push({
          tool: tool.name || 'unknown',
          code,
          severity: code === 'missing-side-effects' || code === 'missing-auth' ? 'error' : 'warning',
          message: 'MCP tool description is missing ' + code.replace(/^missing-/, '').replace(/-/g, ' '),
        });
      }
    }
  }
  return { pass: !findings.some((finding) => finding.severity === 'error'), findings };
}

function emptyRegistry() {
  const desiredCapabilities = buildDesiredCapabilities([]);
  return {
    schemaVersion: 3,
    generatedBy: 'scripts/lib/mcp-registry.mjs',
    mcps: [],
    configuredMcps: [],
    capabilities: {},
    desiredCapabilities,
    missingCapabilities: buildMissingCapabilities(desiredCapabilities, [], false),
    availableToolsByHost: {},
    toolNamespacesByHost: {},
    adapterBinding: [],
    runtimeDiscovery: { provided: false, host: 'unknown', toolCount: 0, source: 'not-provided' },
    freshness: { status: 'missing', current: false, source: 'none' },
    lastDiscoveredAt: null,
    updatedAt: null,
  };
}

function normalizeRegistry(registry = {}) {
  if (registry.schemaVersion === 3) return registry;
  const mcps = (registry.mcps || []).map((mcp) => {
    const definition = getDefinition(mcp.name) || definitionFromConfiguredEntry({ name: mcp.name });
    const availableTools = sanitizeToolNames(mcp.availableTools || mcp.tools || getMcpTools(definition.name));
    return buildMcpEntry({ definition, rawName: mcp.name, def: mcp, tools: availableTools, host: (mcp.hostSources || ['unknown'])[0], source: mcp.freshness || 'legacy-registry', now: mcp.lastDiscoveredAt || mcp.discoveredAt || registry.updatedAt || new Date().toISOString(), available: availableTools.length > 0 });
  }).filter((mcp) => mcp.available);
  const configuredMcps = mcps.map((mcp) => ({ name: mcp.name, rawName: mcp.providerName || mcp.name, host: (mcp.hostSources || ['unknown'])[0], configSource: null, enabled: true }));
  const desiredCapabilities = registry.desiredCapabilities || buildDesiredCapabilities(configuredMcps.map((mcp) => mcp.name));
  return buildRegistry({ mcps, configuredMcps, desiredCapabilities, hasRuntimeDiscovery: false, runtimeToolCount: 0, host: 'unknown', now: registry.updatedAt || null, configFallbackUsed: true });
}

async function readConfiguredMcps({ configPath = null, host = null, now = new Date().toISOString() } = {}) {
  const candidates = configPath ? [configCandidate(configPath, normalizeHost(host || inferHostFromPath(configPath)), inferConfigFormat(configPath))] : defaultConfigCandidates();
  const entries = [];
  for (const candidate of candidates) {
    if (!candidate.path || !existsSync(candidate.path)) continue;
    let raw;
    try { raw = await readFile(candidate.path, 'utf8'); } catch { continue; }
    const servers = parseMcpServerDefinitions(raw, candidate);
    for (const [rawName, def = {}] of Object.entries(servers)) {
      if (def?.enabled === false || def?.disabled === true) continue;
      const definition = getDefinition(rawName) || definitionFromConfiguredEntry({ name: rawName, def });
      entries.push({ name: definition.name, rawName, capabilityId: definition.capabilityId, host: normalizeHost(candidate.host), configSource: candidate.path, def, enabled: true, discoveredAt: now });
    }
  }
  return dedupeConfiguredEntries(entries);
}

function parseMcpServerDefinitions(raw = '', candidate = {}) {
  if (candidate.format === 'toml') return parseTomlMcpServers(raw);
  let json;
  try { json = JSON.parse(raw); } catch { return {}; }
  return json.mcpServers || json.mcp_servers || json.mcp || {};
}

function parseTomlMcpServers(raw = '') {
  const servers = {};
  let current = null;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = stripTomlComment(line).trim();
    if (!trimmed) continue;
    const table = /^\[mcp_servers\.(?:"([^"]+)"|([^\]]+))\]$/.exec(trimmed);
    if (table) {
      current = table[1] || table[2];
      servers[current] ||= {};
      continue;
    }
    if (!current) continue;
    const assignment = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(trimmed);
    if (!assignment) continue;
    servers[current][assignment[1]] = parseTomlScalar(assignment[2]);
  }
  return servers;
}

function parseTomlScalar(raw = '') {
  const value = String(raw || '').trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^".*"$/.test(value)) return value.slice(1, -1);
  if (/^\[.*\]$/.test(value)) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((item) => parseTomlScalar(item.trim()));
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

function stripTomlComment(line = '') {
  let inString = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index - 1] !== '\\') inString = !inString;
    if (char === '#' && !inString) return line.slice(0, index);
  }
  return line;
}

async function readRuntimeToolInput({ runtimeTools = null, runtimeToolsPath = null, env = process.env } = {}) {
  if (runtimeTools !== null && runtimeTools !== undefined) return runtimeTools;
  const path = runtimeToolsPath || firstEnvValue(RUNTIME_TOOL_FILE_ENV_KEYS, env);
  if (path) {
    try { return await readFile(path, 'utf8'); } catch { return ''; }
  }
  const value = firstEnvValue(RUNTIME_TOOL_ENV_KEYS, env);
  return value || null;
}

function discoverRuntimeEntries(input, { host, now }) {
  const tools = sanitizeToolNames(parseRuntimeToolNames(input));
  const byName = new Map();
  for (const tool of tools) {
    const definition = identifyDefinitionForTool(tool);
    if (!definition) continue;
    if (!byName.has(definition.name)) byName.set(definition.name, { definition, tools: [] });
    byName.get(definition.name).tools.push(tool);
  }
  return [...byName.values()].map(({ definition, tools: names }) => buildMcpEntry({ definition, rawName: definition.name, def: {}, tools: unique(names).sort(), host, source: 'runtime-discovery', now, available: true }));
}

function buildMcpEntry({ definition, rawName = null, def = {}, tools = [], host = 'unknown', source = 'provider-config', now = null, configSource = null, available = true }) {
  const hostId = normalizeHost(host);
  const availableTools = sanitizeToolNames(tools);
  const canonicalTools = sanitizeToolNames(resolveKnownTools(definition));
  const adapterTools = sanitizeToolNames(resolveKnownTools(definition, { host: hostId }));
  const toolNamespace = inferToolNamespace(availableTools[0]) || inferToolNamespace(adapterTools[0]) || null;
  const transport = source === 'runtime-discovery' ? 'runtime' : def.url ? 'http' : def.command ? 'stdio' : 'unknown';
  const adapterBinding = {
    host: hostId,
    mcp: definition.name,
    providerName: rawName || definition.name,
    capabilityId: definition.capabilityId,
    toolNamespace,
    availableTools,
    canonicalTools,
    adapterTools,
    tools: availableTools,
    source,
    freshness: source,
  };
  return {
    name: definition.name,
    providerName: rawName || definition.name,
    capabilityId: definition.capabilityId,
    available: Boolean(available && availableTools.length),
    availableTools,
    tools: availableTools,
    canonicalTools,
    adapterTools,
    toolNamespace,
    capabilities: definition.capabilities,
    riskClass: definition.riskClass,
    desiredBy: definition.desiredBy,
    hostSources: [hostId],
    configSources: configSource ? [configSource] : [],
    command: def.command || def.url || '',
    args: Array.isArray(def.args) ? def.args : [],
    transport,
    adapterBinding,
    adapterBindings: [adapterBinding],
    fallback: definition.fallback,
    freshness: source,
    source,
    lastDiscoveredAt: now,
    discoveredAt: now,
  };
}

function buildRegistry({ mcps, configuredMcps, desiredCapabilities, hasRuntimeDiscovery, runtimeToolCount, host, now, configFallbackUsed = false }) {
  const availableMcps = mergeMcpEntries(mcps || []).filter((mcp) => mcp.available && mcp.availableTools?.length);
  const capabilityStates = buildCapabilityStates({ desiredCapabilities, availableMcps, configuredMcps, host, hasRuntimeDiscovery });
  return {
    schemaVersion: 3,
    generatedBy: 'scripts/lib/mcp-registry.mjs',
    mcps: availableMcps,
    configuredMcps: configuredMcps.map((entry) => ({ name: entry.name, providerName: entry.rawName, capabilityId: entry.capabilityId, host: entry.host, configSource: entry.configSource, enabled: entry.enabled })),
    capabilities: groupCapabilities(availableMcps),
    desiredCapabilities,
    missingCapabilities: buildMissingCapabilities(desiredCapabilities, availableMcps, hasRuntimeDiscovery),
    capabilityStates,
    agentHandoff: buildMcpAgentHandoffPacket({ capabilityStates, host, hasRuntimeDiscovery, runtimeToolCount }),
    availableToolsByHost: buildAvailableToolsByHost(availableMcps),
    toolNamespacesByHost: buildToolNamespacesByHost(availableMcps),
    adapterBinding: availableMcps.flatMap((mcp) => mcp.adapterBindings || [mcp.adapterBinding].filter(Boolean)),
    runtimeDiscovery: { provided: hasRuntimeDiscovery, host, toolCount: runtimeToolCount, source: hasRuntimeDiscovery ? 'runtime-tools' : 'not-provided' },
    freshness: { status: hasRuntimeDiscovery ? 'runtime-current' : configFallbackUsed ? 'provider-config-current' : 'runtime-unavailable', current: Boolean(hasRuntimeDiscovery || configFallbackUsed), source: hasRuntimeDiscovery ? 'runtime-discovery' : configFallbackUsed ? 'provider-config' : 'fail-closed' },
    lastDiscoveredAt: now,
    updatedAt: now,
  };
}

function buildCapabilityStates({ desiredCapabilities = [], availableMcps = [], configuredMcps = [], host = "unknown", hasRuntimeDiscovery = false } = {}) {
  const hostId = normalizeHost(host);
  return (desiredCapabilities || []).map((desired) => {
    const capabilityId = desired.capabilityId;
    const available = (availableMcps || []).find((mcp) => mcpMatchesCapability(mcp, capabilityId)) || null;
    const configured = (configuredMcps || []).filter((entry) => entryMatchesCapability(entry, capabilityId));
    const bindings = available?.adapterBindings || [available?.adapterBinding].filter(Boolean);
    const runtimeBinding = bindings.find((binding) => normalizeHost(binding.host) === hostId && binding.source === "runtime-discovery") || null;
    const sameHostBinding = bindings.find((binding) => normalizeHost(binding.host) === hostId) || null;
    const state = runtimeBinding
      ? "runtime-available"
      : sameHostBinding && configured.length > 0
        ? "configured-only"
        : available && !sameHostBinding
          ? "host-mismatch"
          : configured.length > 0
            ? "configured-only"
            : "unavailable";
    const toolCount = runtimeBinding?.availableTools?.length || sameHostBinding?.availableTools?.length || available?.availableTools?.length || 0;
    return {
      capabilityId,
      state,
      host: hostId,
      toolCount,
      mcp: available?.name || desired.preferredMcp || capabilityId,
      freshness: runtimeBinding ? "runtime-current" : sameHostBinding ? "configured-current" : hasRuntimeDiscovery ? "runtime-missing" : "not-observed",
      confidenceCap: confidenceCapForCapabilityState(state, hasRuntimeDiscovery),
      fallback: desired.fallback || available?.fallback || null,
      limitations: limitationsForCapabilityState(state, { hasRuntimeDiscovery, configured: configured.length > 0 }),
    };
  });
}

function buildMcpAgentHandoffPacket({ capabilityStates = [], host = "unknown", hasRuntimeDiscovery = false, runtimeToolCount = 0 } = {}) {
  return {
    schemaVersion: 1,
    host: normalizeHost(host),
    runtimePaletteProvided: Boolean(hasRuntimeDiscovery),
    runtimeToolCount: Number(runtimeToolCount || 0),
    capabilities: (capabilityStates || []).map((item) => ({
      capabilityId: item.capabilityId,
      host: item.host,
      state: item.state,
      toolCount: item.toolCount,
      freshness: item.freshness,
      confidenceCap: item.confidenceCap,
      fallback: item.fallback,
      limitations: item.limitations,
    })),
  };
}

function confidenceCapForCapabilityState(state, hasRuntimeDiscovery = false) {
  if (state === "runtime-available") return 10;
  if (state === "configured-only") return hasRuntimeDiscovery ? 7 : 8;
  if (state === "host-mismatch") return 6;
  return hasRuntimeDiscovery ? 5 : 7;
}

function limitationsForCapabilityState(state, { hasRuntimeDiscovery = false, configured = false } = {}) {
  if (state === "runtime-available") return [];
  if (state === "configured-only") return ["configured but not confirmed in the live runtime palette"];
  if (state === "host-mismatch") return ["available in another host or namespace; do not expose raw provider config in agent handoff"];
  return [hasRuntimeDiscovery ? "not observed in the live runtime palette" : configured ? "configured but runtime palette absent" : "not configured or unavailable"];
}

function buildDesiredCapabilities(configuredNames = []) {
  const configuredCapabilityIds = unique(configuredNames)
    .map((name) => getDefinition(name) || definitionFromConfiguredEntry({ name }))
    .filter(Boolean)
    .map((definition) => definition.capabilityId);
  const ids = unique([...DESIRED_CAPABILITY_ORDER, ...configuredCapabilityIds]);
  return ids.map((capabilityId) => {
    const definition = Object.values(MCP_DEFINITIONS).find((item) => item.capabilityId === capabilityId);
    return { capabilityId, desiredBy: definition?.desiredBy || ['supervibe:mcp-discovery'], preferredMcp: definition?.name || capabilityId, fallback: definition?.fallback || null, riskClass: definition?.riskClass || 'unknown' };
  });
}

function buildMissingCapabilities(desiredCapabilities, mcps, hasRuntimeDiscovery) {
  return (desiredCapabilities || [])
    .filter((desired) => !(mcps || []).some((mcp) => mcpMatchesCapability(mcp, desired.capabilityId)))
    .map((desired) => ({ capabilityId: desired.capabilityId, desiredBy: desired.desiredBy || [], preferredMcp: desired.preferredMcp || desired.capabilityId, reason: hasRuntimeDiscovery ? 'not-observed-in-runtime-discovery' : 'not-configured-or-not-discovered', fallback: desired.fallback || null }));
}

function buildAvailableToolsByHost(mcps) {
  const grouped = {};
  for (const mcp of mcps || []) {
    for (const binding of mcp.adapterBindings || [mcp.adapterBinding].filter(Boolean)) {
      const host = normalizeHost(binding.host);
      grouped[host] ||= {};
      const tools = [...(binding.availableTools || [])];
      grouped[host][mcp.capabilityId] = tools;
      grouped[host][mcp.name] = tools;
      for (const capability of mcp.capabilities || []) {
        grouped[host][capability] = unique([...(grouped[host][capability] || []), ...tools]);
      }
    }
  }
  return grouped;
}

function buildToolNamespacesByHost(mcps) {
  const grouped = {};
  for (const mcp of mcps || []) {
    for (const binding of mcp.adapterBindings || [mcp.adapterBinding].filter(Boolean)) {
      const host = normalizeHost(binding.host);
      grouped[host] ||= {};
      grouped[host][mcp.capabilityId] = binding.toolNamespace || null;
      grouped[host][mcp.name] = binding.toolNamespace || null;
      for (const capability of mcp.capabilities || []) {
        grouped[host][capability] ||= binding.toolNamespace || null;
      }
    }
  }
  return grouped;
}

function groupCapabilities(mcps = []) {
  const grouped = {};
  for (const mcp of mcps) {
    for (const capability of mcp.capabilities || []) {
      grouped[capability] ||= [];
      grouped[capability].push({ name: mcp.name, capabilityId: mcp.capabilityId, riskClass: mcp.riskClass || 'unknown', toolNamespace: mcp.toolNamespace || null, availableTools: mcp.availableTools || [], tools: mcp.availableTools || [] });
    }
  }
  return grouped;
}

function parseRuntimeToolNames(input) {
  if (input === null || input === undefined) return [];
  if (Array.isArray(input)) return input.flatMap((item) => {
    if (typeof item === 'string') return [item];
    if (!item || typeof item !== 'object') return [];
    if (item.available === false || item.enabled === false) return [];
    return [item.name, item.tool, item.id].filter(Boolean);
  });
  if (typeof input === 'object') {
    for (const key of ['tools', 'availableTools', 'mcpTools', 'toolNames']) {
      if (Array.isArray(input[key])) return parseRuntimeToolNames(input[key]);
    }
    return [];
  }
  const text = String(input || '').trim();
  if (!text) return [];
  if (text.startsWith('[') || text.startsWith('{')) {
    try { return parseRuntimeToolNames(JSON.parse(text)); } catch { /* fall through */ }
  }
  return text.split(/[\s,\r\n]+/).map((item) => item.trim()).filter(Boolean);
}

function sanitizeToolNames(tools = []) {
  return unique((tools || []).map((tool) => String(tool || '').trim()).filter((tool) => tool.length <= 160 && SAFE_TOOL_NAME.test(tool)));
}

function identifyDefinitionForTool(tool) {
  return Object.values(MCP_DEFINITIONS).find((definition) => definition.toolPatterns.some((pattern) => pattern.test(tool)))
    || definitionFromRuntimeTool(tool)
    || null;
}

function getDefinition(name) {
  const normalized = normalizeRequestedName(name);
  return Object.values(MCP_DEFINITIONS).find((definition) => {
    const aliases = [definition.name, definition.capabilityId, ...(definition.aliases || [])].map(normalizeRequestedName);
    return aliases.includes(normalized);
  }) || null;
}

function resolveKnownTools(definition, { host = null } = {}) {
  const hostId = normalizeHost(host || 'canonical');
  const overlay = ADAPTER_TOOL_OVERLAYS[hostId]?.[definition.name] || ADAPTER_TOOL_OVERLAYS[hostId]?.[definition.capabilityId];
  return overlay || KNOWN_MCP_TOOLS[definition.name] || KNOWN_MCP_TOOLS[definition.capabilityId] || [];
}

function inferToolNamespace(toolName = '') {
  const match = String(toolName || '').match(/^(mcp__[A-Za-z0-9_-]+__)/);
  return match ? match[1] : null;
}

function inferRuntimeMcpName(toolName = '') {
  const match = String(toolName || '').match(/^mcp__([A-Za-z0-9_-]+)__[A-Za-z0-9_-]+$/);
  return match ? match[1] : '';
}

function definitionFromRuntimeTool(toolName = '') {
  const rawName = inferRuntimeMcpName(toolName);
  if (!rawName) return null;
  return getDefinition(rawName) || definitionFromConfiguredEntry({ name: rawName, def: { runtime: true } });
}

function definitionFromConfiguredEntry(entry = {}) {
  const name = normalizeRequestedName(entry.name || 'tool') || 'tool';
  return { name, capabilityId: name, capabilities: inferCapabilities(name), riskClass: inferRiskClass(name, entry.def || {}), desiredBy: ['configured-provider'], fallback: null, aliases: [name], toolPatterns: [] };
}

function normalizeRequestedName(name = '') {
  const value = String(name || '').trim();
  if (!value) return '';
  const lower = value.toLowerCase().replaceAll('_', '-');
  if (lower === 'browser') return 'browser';
  if (lower === 'mcp-server-context7') return 'context7';
  if (lower === 'mcp-server-figma') return 'figma';
  if (lower === 'mcp-server-firecrawl') return 'firecrawl';
  if (lower === 'openaideveloperdocs' || lower === 'openai-docs' || lower === 'openai-developer-docs') return 'openaiDeveloperDocs';
  return lower;
}

function mcpMatchesCapability(mcp = {}, capabilityId = '') {
  const normalized = normalizeRequestedName(capabilityId);
  return [mcp.name, mcp.capabilityId, ...(mcp.capabilities || [])]
    .map(normalizeRequestedName)
    .includes(normalized);
}

function entryMatchesCapability(entry = {}, capabilityId = '') {
  const normalized = normalizeRequestedName(capabilityId);
  const definition = getDefinition(entry.name) || getDefinition(entry.rawName) || definitionFromConfiguredEntry(entry);
  return [entry.name, entry.rawName, entry.capabilityId, definition?.name, definition?.capabilityId, ...(definition?.capabilities || [])]
    .map(normalizeRequestedName)
    .includes(normalized);
}

function matchesMcpOrCapability(mcp, name) {
  const definition = getDefinition(name);
  if (definition) return mcpMatchesCapability(mcp, definition.capabilityId) || normalizeRequestedName(mcp.name) === normalizeRequestedName(definition.name);
  const normalized = normalizeRequestedName(name);
  return [mcp.name, mcp.capabilityId, ...(mcp.capabilities || [])]
    .map(normalizeRequestedName)
    .includes(normalized);
}

function mergeMcpEntries(...groups) {
  const byName = new Map();
  for (const entry of groups.flat()) {
    if (!entry?.name) continue;
    const existing = byName.get(entry.name);
    if (!existing) {
      byName.set(entry.name, refreshMergedMcpEntry(entry));
      continue;
    }
    byName.set(entry.name, refreshMergedMcpEntry({
      ...existing,
      ...entry,
      available: existing.available || entry.available,
      availableTools: unique([...(existing.availableTools || []), ...(entry.availableTools || [])]),
      tools: unique([...(existing.tools || []), ...(entry.tools || [])]),
      hostSources: unique([...(existing.hostSources || []), ...(entry.hostSources || [])]),
      configSources: unique([...(existing.configSources || []), ...(entry.configSources || [])]),
      adapterBindings: uniqueBindings([...(existing.adapterBindings || [existing.adapterBinding].filter(Boolean)), ...(entry.adapterBindings || [entry.adapterBinding].filter(Boolean))]),
    }));
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function refreshMergedMcpEntry(entry) {
  const availableTools = unique([...(entry.availableTools || []), ...(entry.tools || [])]);
  const adapterBindings = uniqueBindings(entry.adapterBindings || [entry.adapterBinding].filter(Boolean));
  const nextBindings = adapterBindings.map((binding) => ({
    ...binding,
    availableTools: [...(binding.availableTools || binding.tools || [])],
    tools: [...(binding.availableTools || binding.tools || [])],
  }));
  const firstBinding = nextBindings[0] || entry.adapterBinding || null;
  return {
    ...entry,
    availableTools,
    tools: availableTools,
    adapterBindings: nextBindings,
    adapterBinding: firstBinding,
    toolNamespace: entry.toolNamespace || firstBinding?.toolNamespace || inferToolNamespace(availableTools[0]),
  };
}

function uniqueBindings(bindings = []) {
  const byKey = new Map();
  for (const binding of bindings.filter(Boolean)) {
    const key = [binding.host || 'unknown', binding.mcp || '', binding.capabilityId || ''].join(':');
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, binding);
      continue;
    }
    byKey.set(key, {
      ...existing,
      ...binding,
      availableTools: unique([...(existing.availableTools || []), ...(binding.availableTools || [])]),
      canonicalTools: unique([...(existing.canonicalTools || []), ...(binding.canonicalTools || [])]),
      adapterTools: unique([...(existing.adapterTools || []), ...(binding.adapterTools || [])]),
      tools: unique([...(existing.tools || []), ...(binding.tools || [])]),
    });
  }
  return [...byKey.values()];
}

function dedupeConfiguredEntries(entries = []) {
  const byKey = new Map();
  for (const entry of entries) {
    const key = entry.name + ':' + entry.host + ':' + entry.configSource;
    if (!byKey.has(key)) byKey.set(key, entry);
  }
  return [...byKey.values()].sort((a, b) => (a.name + ':' + a.host).localeCompare(b.name + ':' + b.host));
}

function normalizeHost(host = '') {
  return String(host || 'unknown').trim().toLowerCase() || 'unknown';
}

function detectHostFromEnv(env = process.env) {
  if (env.CODEX_THREAD_ID) return 'codex';
  if (env.CLAUDECODE) return 'claude';
  return 'unknown';
}

function inferHostFromPath(path = '') {
  const normalized = String(path || '').replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('/.codex/')) return 'codex';
  if (normalized.includes('/.claude')) return 'claude';
  if (normalized.includes('/.gemini/')) return 'gemini';
  if (normalized.includes('/.cursor/')) return 'cursor';
  if (normalized.includes('/opencode')) return 'opencode';
  return 'unknown';
}

function inferConfigFormat(path = '') {
  return String(path || '').toLowerCase().endsWith('.toml') ? 'toml' : 'json';
}

function countRuntimeTools(input) {
  if (input === null || input === undefined) return 0;
  return parseRuntimeToolNames(input).length;
}

function firstEnvValue(keys, env) {
  for (const key of keys) if (env[key]) return env[key];
  return '';
}

function unique(items = []) {
  return [...new Set(items.filter((item) => item !== null && item !== undefined && item !== ''))];
}

function inferCapabilities(name = '') {
  const value = String(name).toLowerCase();
  if (/openai|context|docs/.test(value)) return ['docs', 'research'];
  if (/playwright|browser|chrome/.test(value)) return ['browser', 'qa'];
  if (/figma|design/.test(value)) return ['design'];
  if (/crawl|search|web/.test(value)) return ['research', 'web'];
  return ['tool'];
}

function inferRiskClass(name = '', def = {}) {
  const text = String(name || '') + ' ' + String(def.command || '') + ' ' + (def.args || []).join(' ');
  return /write|deploy|publish|browser|playwright|tauri/i.test(text) ? 'interactive' : 'read';
}
