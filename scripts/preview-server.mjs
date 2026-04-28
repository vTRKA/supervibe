#!/usr/bin/env node
// Preview Server CLI — used by /evolve-preview command and design-related skills.
//
// Modes:
//   --root <dir>            Start server serving <dir> (default: ./mockups or ./)
//   --port <N>              Specific port (default: auto-allocate 3047-3099 then OS)
//   --label "<name>"        Friendly label for the registry
//   --no-watch              Disable hot-reload (static-only)
//   --idle-timeout <min>    Auto-shutdown after N minutes of inactivity (default 30; 0 = disable)
//   --force                 Bypass max-servers limit
//   --list                  List currently running preview servers
//   --kill <port>           Kill server on given port
//   --kill-all              Kill all registered preview servers

import { resolve, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { startStaticServer } from './lib/preview-static-server.mjs';
import { attachHotReload } from './lib/preview-hot-reload.mjs';
import {
  findFreePort,
  registerServer, unregisterServer,
  listServers, killServer, killAllServers
} from './lib/preview-server-manager.mjs';

const PROJECT_ROOT = process.cwd();
const MAX_SERVERS_DEFAULT = 10;

const { values } = parseArgs({
  options: {
    root: { type: 'string', default: '' },
    port: { type: 'string', default: '' },
    label: { type: 'string', default: '' },
    'no-watch': { type: 'boolean', default: false },
    'no-feedback': { type: 'boolean', default: false },
    'idle-timeout': { type: 'string', default: '30' },
    force: { type: 'boolean', default: false },
    list: { type: 'boolean', default: false },
    kill: { type: 'string', default: '' },
    'kill-all': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: false,
});

if (values.help) {
  console.log(`Evolve Preview Server

Usage:
  preview-server.mjs --root <dir> [--port N] [--label "name"] [--no-watch] [--idle-timeout <min>] [--force]
  preview-server.mjs --list
  preview-server.mjs --kill <port>
  preview-server.mjs --kill-all`);
  process.exit(0);
}

if (values.list) {
  const servers = await listServers();
  if (servers.length === 0) {
    console.log('No preview servers running.');
    process.exit(0);
  }
  console.log(`Running preview servers (${servers.length}):`);
  for (const s of servers) {
    const url = `http://localhost:${s.port}`;
    const ago = ((Date.now() - new Date(s.startedAt).getTime()) / 1000 / 60).toFixed(1);
    console.log(`  ${url}  ${s.label || basename(s.root)}  (pid=${s.pid}, root=${s.root}, started ${ago}m ago)`);
  }
  process.exit(0);
}

if (values.kill) {
  const port = parseInt(values.kill, 10);
  const r = await killServer(port);
  if (r.killed) console.log(`Killed preview server on port ${port} (pid=${r.pid})`);
  else console.log(`No preview server on port ${port} (${r.reason})`);
  process.exit(r.killed ? 0 : 1);
}

if (values['kill-all']) {
  const results = await killAllServers();
  const killed = results.filter(r => r.killed).length;
  console.log(`Killed ${killed} of ${results.length} preview servers.`);
  process.exit(0);
}

// Max-servers check
const force = values.force ?? false;
const existingServers = await listServers();
if (existingServers.length >= MAX_SERVERS_DEFAULT && !force) {
  console.error(`[evolve-preview] max ${MAX_SERVERS_DEFAULT} preview servers already running. Use --force to override or kill some with --kill-all.`);
  for (const s of existingServers) {
    console.error(`  http://localhost:${s.port}  ${s.label}  (pid=${s.pid})`);
  }
  process.exit(2);
}

// Start mode
let rootDir = values.root;
if (!rootDir) {
  if (existsSync('mockups')) rootDir = 'mockups';
  else if (existsSync('prototypes')) rootDir = 'prototypes';
  else rootDir = '.';
}
const absRoot = resolve(PROJECT_ROOT, rootDir);
if (!existsSync(absRoot)) {
  console.error(`Root directory does not exist: ${absRoot}`);
  process.exit(1);
}

const portArg = values.port ? parseInt(values.port, 10) : 0;
const port = portArg || await findFreePort();
const label = values.label || basename(absRoot);

const server = await startStaticServer({
  root: absRoot,
  port,
  feedback: !values['no-feedback'],
  projectRoot: PROJECT_ROOT,
});
let watcher = null;
if (!values['no-watch']) {
  watcher = await attachHotReload({ root: absRoot, server });
}

await registerServer({
  port: server.port,
  pid: process.pid,
  root: absRoot,
  label,
  watching: watcher ? ['*'] : [],
});

const url = `http://localhost:${server.port}`;
console.log(`[evolve-preview] ${label} → ${url}`);
console.log(`[evolve-preview] root: ${absRoot}`);
console.log(`[evolve-preview] hot-reload: ${watcher ? 'on' : 'off'}`);
console.log(`[evolve-preview] feedback overlay: ${values['no-feedback'] ? 'off' : 'on'} (click 💬 in browser)`);
console.log(`[evolve-preview] PID: ${process.pid}`);
console.log(`[evolve-preview] press Ctrl+C to stop`);

// Idle-shutdown timer
const idleTimeoutMin = parseInt(values['idle-timeout'] ?? '30', 10);
let idleCheckTimer = null;
if (idleTimeoutMin > 0) {
  idleCheckTimer = setInterval(() => {
    const idleMs = Date.now() - server.getLastActivityAt();
    const idleMin = idleMs / 1000 / 60;
    const hasClients = server.hasActiveSseClients();
    if (idleMin > idleTimeoutMin && !hasClients) {
      console.log(`[evolve-preview] idle for ${idleMin.toFixed(1)}m and no SSE clients — auto-shutdown`);
      shutdown('IDLE-TIMEOUT');
    }
  }, 60_000);
}

async function shutdown(sig) {
  console.log(`\n[evolve-preview] received ${sig}, shutting down...`);
  if (idleCheckTimer) clearInterval(idleCheckTimer);
  if (watcher) await watcher.close();
  await server.stop();
  await unregisterServer(server.port);
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

setInterval(() => {}, 1 << 30);
