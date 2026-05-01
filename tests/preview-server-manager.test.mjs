import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  findFreePort, registerServer, unregisterServer, listServers,
  isPidAlive, killServer, REGISTRY_PATH_FOR_TEST
} from '../scripts/lib/preview-server-manager.mjs';

const sandbox = join(tmpdir(), `evolve-preview-mgr-${Date.now()}`);

before(async () => {
  await mkdir(join(sandbox, '.supervibe', 'memory'), { recursive: true });
  REGISTRY_PATH_FOR_TEST(join(sandbox, '.supervibe', 'memory', 'preview-servers.json'));
});

after(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

test('findFreePort: returns a port in the preferred range or OS-assigned', async () => {
  const port = await findFreePort();
  assert.ok(port >= 3047 && port <= 65535, `port out of range: ${port}`);
});

test('registerServer + listServers: round-trip', async () => {
  await registerServer({ port: 3047, pid: process.pid, root: '/fake/root', label: 'test' });
  const list = await listServers();
  const found = list.find(s => s.port === 3047);
  assert.ok(found, 'registered server should appear in list');
  assert.strictEqual(found.label, 'test');
});

test('unregisterServer: removes entry', async () => {
  await unregisterServer(3047);
  const list = await listServers();
  assert.ok(!list.find(s => s.port === 3047), 'should be removed');
});

test('listServers: filters out dead PIDs automatically', async () => {
  await registerServer({ port: 3099, pid: 999999, root: '/fake', label: 'dead' });
  const list = await listServers();
  assert.ok(!list.find(s => s.port === 3099), 'dead PID should be auto-pruned');
});

test('isPidAlive: works for current process', () => {
  assert.strictEqual(isPidAlive(process.pid), true);
  assert.strictEqual(isPidAlive(999999), false);
});

test('killServer: returns false for non-existent port', async () => {
  const result = await killServer(9999);
  assert.strictEqual(result.killed, false);
  assert.strictEqual(result.reason, 'not-found');
});

test('listServers handles many entries without performance issues', async () => {
  for (let i = 0; i < 50; i++) {
    await registerServer({ port: 4000 + i, pid: process.pid, root: `/fake/${i}`, label: `t${i}` });
  }
  const list = await listServers();
  assert.ok(list.length >= 50, `expected ≥50 entries, got ${list.length}`);
  assert.equal(new Set(list.map((server) => server.port)).size, list.length, 'registry should not duplicate ports');
  for (let i = 0; i < 50; i++) {
    await unregisterServer(4000 + i);
  }
});
