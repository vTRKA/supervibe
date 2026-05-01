import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getCurrentPluginVersion,
  getLastSeenVersion,
  setLastSeenVersion,
  checkVersionBump,
} from '../scripts/lib/version-tracker.mjs';

const sandbox = join(tmpdir(), `evolve-vtrack-${Date.now()}`);
const projectRoot = join(sandbox, 'project');
const pluginRoot = join(sandbox, 'plugin');

before(async () => {
  await mkdir(join(pluginRoot, '.claude-plugin'), { recursive: true });
  await writeFile(
    join(pluginRoot, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'evolve', version: '1.7.0' })
  );
  await mkdir(join(projectRoot, '.supervibe', 'memory'), { recursive: true });
});

after(async () => { await rm(sandbox, { recursive: true, force: true }); });

test('getCurrentPluginVersion: reads from plugin.json', async () => {
  const v = await getCurrentPluginVersion(pluginRoot);
  assert.strictEqual(v, '1.7.0');
});

test('getCurrentPluginVersion: returns null when manifest missing', async () => {
  const v = await getCurrentPluginVersion('/nonexistent/path');
  assert.strictEqual(v, null);
});

test('getLastSeenVersion: returns null on first run', async () => {
  const v = await getLastSeenVersion(projectRoot);
  assert.strictEqual(v, null);
});

test('checkVersionBump: firstTime=true when no .supervibe-version yet', async () => {
  const r = await checkVersionBump(projectRoot, pluginRoot);
  assert.strictEqual(r.current, '1.7.0');
  assert.strictEqual(r.lastSeen, null);
  assert.strictEqual(r.bumped, true);
  assert.strictEqual(r.firstTime, true);
});

test('setLastSeenVersion + checkVersionBump: bumped=false after sync', async () => {
  await setLastSeenVersion(projectRoot, '1.7.0');
  const r = await checkVersionBump(projectRoot, pluginRoot);
  assert.strictEqual(r.bumped, false);
  assert.strictEqual(r.firstTime, false);
});

test('checkVersionBump: bumped=true after plugin update', async () => {
  await setLastSeenVersion(projectRoot, '1.6.0');
  const r = await checkVersionBump(projectRoot, pluginRoot);
  assert.strictEqual(r.lastSeen, '1.6.0');
  assert.strictEqual(r.current, '1.7.0');
  assert.strictEqual(r.bumped, true);
  assert.strictEqual(r.firstTime, false);
});
