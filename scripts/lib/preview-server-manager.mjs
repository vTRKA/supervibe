// Preview Server Manager — port allocation, process tracking, registry persistence.
// Registry is a JSON file in .supervibe/memory/preview-servers.json so multiple
// supervibe sessions and the status command can see/manage each other's servers.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { dirname, join } from 'node:path';

const PROJECT_ROOT = process.cwd();
let _registryPath = join(PROJECT_ROOT, '.supervibe', 'memory', 'preview-servers.json');

/** TEST HOOK: override registry path for sandboxed tests */
export function REGISTRY_PATH_FOR_TEST(path) {
  _registryPath = path;
}

const PORT_PREFERRED_START = 3047;
const PORT_PREFERRED_END = 3099;
const FRAMEWORK_DEV_PORTS = Object.freeze([3000, 3001, 3002, 4173, 4321, 5173, 5174, 8080]);

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
export async function registerServer({
  port,
  pid,
  root,
  label = '',
  watching = [],
  mode = 'foreground',
  logs = null,
  target = null,
  feedbackOverlay = true,
}) {
  const entries = await readRegistry();
  const filtered = entries.filter(e => e.port !== port);
  filtered.push({
    port, pid, root, label, watching, mode, logs, target, feedbackOverlay,
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

export async function detectFrameworkDevServers({
  rootDir = PROJECT_ROOT,
  candidatePorts = FRAMEWORK_DEV_PORTS,
  connectTimeoutMs = 75,
} = {}) {
  const label = detectFrameworkDevLabel(rootDir);
  const detected = [];
  for (const port of candidatePorts.map(Number).filter(Boolean)) {
    if (!await isPortAcceptingConnections(port, connectTimeoutMs)) continue;
    detected.push({
      kind: 'framework-dev',
      managed: false,
      feedbackOverlay: false,
      port,
      pid: null,
      root: rootDir,
      label,
      watching: [],
      mode: 'detected-framework-dev',
      logs: null,
      proxyCommand: `node scripts/preview-server.mjs --target http://127.0.0.1:${port} --daemon`,
      startedAt: null,
    });
  }
  return detected;
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

function isPortAcceptingConnections(port, timeoutMs = 75) {
  return new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

function detectFrameworkDevLabel(rootDir) {
  const manifests = [
    join(rootDir, 'package.json'),
    join(rootDir, 'frontend', 'package.json'),
    join(rootDir, 'apps', 'web', 'package.json'),
  ];
  for (const manifest of manifests) {
    if (!existsSync(manifest)) continue;
    try {
      const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (deps.next) return 'Next.js dev server';
      if (deps.vite || deps['@vitejs/plugin-react']) return 'Vite dev server';
      if (deps.astro) return 'Astro dev server';
      if (deps.nuxt) return 'Nuxt dev server';
      if (deps.react || deps['react-dom']) return 'React dev server';
    } catch {}
  }
  return 'framework dev server';
}
