import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  detectFrameworkDevServers, findFreePort, registerServer, unregisterServer, listServers,
  isPidAlive, killServer, killAllServers, REGISTRY_PATH_FOR_TEST
} from '../scripts/lib/preview-server-manager.mjs';

const sandbox = join(tmpdir(), `supervibe-preview-mgr-${Date.now()}`);

before(async () => {
  await mkdir(join(sandbox, '.supervibe', 'memory'), { recursive: true });
  await mkdir(join(sandbox, '.supervibe', 'artifacts', 'prototypes', 'checkout'), { recursive: true });
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
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    await registerServer({
      port,
      pid: process.pid,
      root: join(sandbox, '.supervibe', 'artifacts', 'prototypes', 'checkout'),
      label: 'test',
      kind: 'static-preview',
      feedbackOverlay: false,
      projectRoot: sandbox,
    });
    const list = await listServers();
    const found = list.find(s => s.port === port);
    assert.ok(found, 'registered server should appear in list');
    assert.strictEqual(found.label, 'test');
    assert.equal(found.kind, 'static-preview');
    assert.equal(found.projectRoot, sandbox);
    assert.equal(found.slug, 'checkout');
    assert.equal(found.driftStatus, 'ok');
  } finally {
    await unregisterServer(port);
    await new Promise((resolve) => server.close(resolve));
  }
});

test('unregisterServer: removes entry', async () => {
  await unregisterServer(3047);
  const list = await listServers();
  assert.ok(!list.find(s => s.port === 3047), 'should be removed');
});

test('listServers: filters out dead PIDs automatically', async () => {
  await registerServer({ port: 3099, pid: -1, root: '/fake', label: 'dead' });
  const list = await listServers();
  assert.ok(!list.find(s => s.port === 3099), 'dead PID should be auto-pruned');
});

test('listServers: marks entries with live PID but closed preview port as registry drift', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  await registerServer({ port, pid: process.pid, root: '/fake/drift', label: 'drift' });
  const list = await listServers();
  const found = list.find(s => s.port === port);
  assert.ok(found, 'live PID drift entry should remain visible for status and kill-all');
  assert.equal(found.driftStatus, 'stale');
  assert.ok(found.driftReasons.includes('port-not-accepting'));
  await unregisterServer(port);
});

test('isPidAlive: works for current process', () => {
  assert.strictEqual(isPidAlive(process.pid), true);
  assert.strictEqual(isPidAlive(-1), false);
});

test('killServer: returns false for non-existent port', async () => {
  const result = await killServer(9999);
  assert.strictEqual(result.killed, false);
  assert.strictEqual(result.reason, 'not-found');
});

test('listServers handles many live entries without performance issues', async () => {
  const servers = [];
  for (let i = 0; i < 8; i++) {
    const server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    await registerServer({ port: server.address().port, pid: process.pid, root: sandbox, label: `t${i}`, feedbackOverlay: false });
  }
  try {
    const list = await listServers();
    assert.ok(list.length >= 8, `expected >=8 entries, got ${list.length}`);
    assert.equal(new Set(list.map((server) => server.port)).size, list.length, 'registry should not duplicate ports');
  } finally {
    for (const server of servers) {
      const address = server.address();
      if (address?.port) await unregisterServer(address.port);
      await new Promise((resolve) => server.close(resolve));
    }
  }
});

test('killAllServers kills managed process even when registry port has drifted', async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  try {
    await new Promise(resolve => setTimeout(resolve, 100));
    const port = 0;
    await registerServer({ port, pid: child.pid, root: sandbox, label: 'drift-child', feedbackOverlay: false });
    const list = await listServers();
    const found = list.find((server) => server.port === port);
    assert.equal(found.driftStatus, 'stale');

    const results = await killAllServers();
    assert.ok(results.some((result) => result.killed && result.pid === child.pid));
    await waitForChildExit(child);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
});

test('detectFrameworkDevServers finds unmanaged framework dev ports', async () => {
  await writeFile(join(sandbox, 'package.json'), JSON.stringify({
    dependencies: { next: '16.2.4', react: '19.0.0' },
  }, null, 2));
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const detected = await detectFrameworkDevServers({
      rootDir: sandbox,
      candidatePorts: [port],
      connectTimeoutMs: 250,
    });

    assert.equal(detected.length, 1);
    assert.equal(detected[0].kind, 'framework-dev');
    assert.equal(detected[0].managed, false);
    assert.equal(detected[0].feedbackOverlay, false);
    assert.equal(detected[0].label, 'Next.js dev server');
    assert.equal(detected[0].proxyCommand, `node scripts/preview-server.mjs --target http://127.0.0.1:${port} --daemon`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

function waitForChildExit(child, timeoutMs = 5000) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`child process ${child.pid} did not exit within ${timeoutMs}ms`));
    }, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
