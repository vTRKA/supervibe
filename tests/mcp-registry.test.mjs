import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  discoverMcps, getRegistry, hasMcp, getMcpTools, pickMcp,
  REGISTRY_PATH_FOR_TEST
} from '../scripts/lib/mcp-registry.mjs';

const sandbox = join(tmpdir(), `evolve-mcp-${Date.now()}`);

before(async () => {
  await mkdir(join(sandbox, '.claude', 'memory'), { recursive: true });
  REGISTRY_PATH_FOR_TEST(join(sandbox, '.claude', 'memory', 'mcp-registry.json'));
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

test('discoverMcps: no config file → empty registry, no error', async () => {
  const found = await discoverMcps({ configPath: '/nonexistent/config.json' });
  assert.deepStrictEqual(found, []);
});

test('pickMcp: returns first available MCP from preference list', async () => {
  const picked = await pickMcp(['nonexistent-mcp', 'context7', 'playwright']);
  assert.strictEqual(picked, 'context7');

  const none = await pickMcp(['nonexistent-1', 'nonexistent-2']);
  assert.strictEqual(none, null);
});
