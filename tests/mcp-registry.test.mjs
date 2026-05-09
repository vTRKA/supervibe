import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  discoverMcps, getRegistry, hasMcp, getMcpTools, pickMcp,
  REGISTRY_PATH_FOR_TEST
} from '../scripts/lib/mcp-registry.mjs';

const sandbox = join(tmpdir(), `supervibe-mcp-${Date.now()}`);
const FULL_TAURI_MCP_TOOLS = [
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

async function walkMarkdown(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walkMarkdown(full));
    else if (entry.name.endsWith('.md')) files.push(full);
  }
  return files;
}

before(async () => {
  await mkdir(join(sandbox, '.supervibe', 'memory'), { recursive: true });
  REGISTRY_PATH_FOR_TEST(join(sandbox, '.supervibe', 'memory', 'mcp-registry.json'));
});

after(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

test('discoverMcps: parses Claude config and lists MCP servers', async () => {
  const fakeConfig = JSON.stringify({
    mcpServers: {
      context7: { command: 'npx', args: ['@upstash/context7-mcp'] },
      playwright: { command: 'npx', args: ['@playwright/mcp'] },
    }
  });
  const cfgPath = join(sandbox, 'fake-claude.json');
  await writeFile(cfgPath, fakeConfig);

  const found = await discoverMcps({ configPath: cfgPath });
  assert.ok(Array.isArray(found));
  const names = found.map(m => m.name);
  assert.ok(names.includes('context7'));
  assert.ok(names.includes('playwright'));
});

test('hasMcp: returns true for registered, false otherwise', async () => {
  const present = await hasMcp('context7');
  assert.strictEqual(present, true);
  const absent = await hasMcp('nonexistent-mcp');
  assert.strictEqual(absent, false);
});

test('getMcpTools: returns tool prefix list for an MCP', () => {
  const tools = getMcpTools('context7');
  assert.ok(tools.includes('mcp__mcp-server-context7__resolve-library-id'));
});

test('getMcpTools: returns full Tauri desktop testing catalog', () => {
  const tools = getMcpTools('tauri');
  assert.deepStrictEqual([...tools].sort(), [...FULL_TAURI_MCP_TOOLS].sort());
});

test('discoverMcps: persists full Tauri desktop testing catalog', async () => {
  const fakeConfig = JSON.stringify({
    mcpServers: {
      tauri: { command: 'node', args: ['tauri-mcp-server/dist/index.js'] },
    }
  });
  const cfgPath = join(sandbox, 'fake-tauri.json');
  await writeFile(cfgPath, fakeConfig);

  await discoverMcps({ configPath: cfgPath });
  const registry = await getRegistry();
  const tauri = registry.mcps.find(mcp => mcp.name === 'tauri');
  assert.ok(tauri);
  assert.deepStrictEqual([...tauri.tools].sort(), [...FULL_TAURI_MCP_TOOLS].sort());
  assert.ok(registry.capabilities.desktop.some(mcp => mcp.name === 'tauri'));
});

test('agents and skills reference only registered Tauri MCP tools', async () => {
  const allowed = new Set(getMcpTools('tauri'));
  const files = [
    ...await walkMarkdown(join(process.cwd(), 'agents')),
    ...await walkMarkdown(join(process.cwd(), 'skills')),
  ];

  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const refs = text.match(/mcp__tauri__[A-Za-z0-9_]+/g) || [];
    for (const ref of refs) {
      assert.ok(allowed.has(ref), `${file} references unknown Tauri MCP tool ${ref}`);
    }
  }
});

test('discoverMcps: no config file → empty registry, no error', async () => {
  const found = await discoverMcps({ configPath: '/nonexistent/config.json' });
  assert.deepStrictEqual(found, []);
});

test('pickMcp: returns first available MCP from preference list', async () => {
  const fakeConfig = JSON.stringify({
    mcpServers: {
      context7: { command: 'npx', args: ['@upstash/context7-mcp'] },
      playwright: { command: 'npx', args: ['@playwright/mcp'] },
    }
  });
  const cfgPath = join(sandbox, 'fake-pick.json');
  await writeFile(cfgPath, fakeConfig);
  await discoverMcps({ configPath: cfgPath });

  const picked = await pickMcp(['nonexistent-mcp', 'context7', 'playwright']);
  assert.strictEqual(picked, 'context7');

  const none = await pickMcp(['nonexistent-1', 'nonexistent-2']);
  assert.strictEqual(none, null);
});
