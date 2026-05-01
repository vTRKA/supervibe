// Preview Server Manager — port allocation, process tracking, registry persistence.
// Registry is a JSON file in .supervibe/memory/preview-servers.json so multiple
// supervibe sessions and the status command can see/manage each other's servers.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';

const PROJECT_ROOT = process.cwd();
let _registryPath = join(PROJECT_ROOT, '.supervibe', 'memory', 'preview-servers.json');

/** TEST HOOK: override registry path for sandboxed tests */
export function REGISTRY_PATH_FOR_TEST(path) {
  _registryPath = path;
}

const PORT_PREFERRED_START = 3047;
const PORT_PREFERRED_END = 3099;

/**
 * Find a free port. Try preferred range first (3047-3099),
 * then fall back to OS-assigned (port 0).
 */
export async function findFreePort() {
  for (let port = PORT_PREFERRED_START; port <= PORT_PREFERRED_END; port++) {
    if (await isPortFree(port)) return port;
  }
  return await new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function isPortFree(port) {
  return new Promise(resolve => {
    const srv = createServer();
    srv.unref();
    srv.once('error', () => resolve(false));
    srv.listen(port, () => srv.close(() => resolve(true)));
  });
}

async function readRegistry() {
  if (!existsSync(_registryPath)) return [];
  try {
    const txt = await readFile(_registryPath, 'utf8');
    const parsed = JSON.parse(txt);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeRegistry(entries) {
  await mkdir(dirname(_registryPath), { recursive: true });
  await writeFile(_registryPath, JSON.stringify(entries, null, 2));
}

export function isPidAlive(pid) {
  if (typeof pid !== 'number' || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

/** Add an entry. */
export async function registerServer({ port, pid, root, label = '', watching = [], mode = 'foreground', logs = null }) {
  const entries = await readRegistry();
  const filtered = entries.filter(e => e.port !== port);
  filtered.push({
    port, pid, root, label, watching, mode, logs,
    startedAt: new Date().toISOString(),
  });
  await writeRegistry(filtered);
}

/** Remove an entry by port. */
export async function unregisterServer(port) {
  const entries = await readRegistry();
  const filtered = entries.filter(e => e.port !== port);
  await writeRegistry(filtered);
}

/** Read registry, auto-prune entries whose PID no longer exists. */
export async function listServers() {
  const entries = await readRegistry();
  const alive = entries.filter(e => isPidAlive(e.pid));
  if (alive.length !== entries.length) {
    await writeRegistry(alive);
  }
  return alive;
}

/** Send SIGTERM to the server with the given port. */
export async function killServer(port) {
  const entries = await readRegistry();
  const entry = entries.find(e => e.port === port);
  if (!entry) return { killed: false, reason: 'not-found' };
  if (!isPidAlive(entry.pid)) {
    await unregisterServer(port);
    return { killed: false, reason: 'already-dead' };
  }
  try {
    process.kill(entry.pid, 'SIGTERM');
    await unregisterServer(port);
    return { killed: true, port, pid: entry.pid };
  } catch (err) {
    return { killed: false, reason: err.message };
  }
}

/** Kill all registered servers. */
export async function killAllServers() {
  const entries = await listServers();
  const results = [];
  for (const e of entries) {
    results.push(await killServer(e.port));
  }
  return results;
}
