// File-watcher daemon that auto-reindexes memory + code on file changes.
// Uses chokidar for cross-platform fs watching with debouncing.

import chokidar from 'chokidar';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { writeFile, rm } from 'node:fs/promises';
import { MemoryStore } from './memory-store.mjs';
import { CodeStore } from './code-store.mjs';
import { createIndexWatcherLifecycle } from './supervibe-index-watcher.mjs';
import { DEFAULT_INDEX_REFRESH_INTERVAL_MS, ensureIndexConfig } from './supervibe-index-config.mjs';
import { scanCodeChanges, scanMemoryChanges } from './mtime-scan.mjs';

export const WATCHER_HEARTBEAT_REL = '.supervibe/memory/.watcher-heartbeat';
export const DEFAULT_WATCHER_STALE_MS = 15_000;

export function readWatcherHeartbeatStatus(projectRoot, opts = {}) {
  const now = Number(opts.now || Date.now());
  const staleMs = Number(opts.staleMs || DEFAULT_WATCHER_STALE_MS);
  const heartbeatPath = join(projectRoot, WATCHER_HEARTBEAT_REL);
  const base = {
    heartbeatPath,
    staleMs,
    watchers: ['memory', 'retrieval'],
  };

  if (!existsSync(heartbeatPath)) {
    return { ...base, status: 'absent', running: false, ageMs: null, timestamp: null };
  }

  try {
    const timestamp = Number(readFileSync(heartbeatPath, 'utf8'));
    if (!Number.isFinite(timestamp)) {
      return { ...base, status: 'corrupt', running: false, ageMs: null, timestamp: null, error: 'heartbeat is not numeric' };
    }
    const ageMs = Math.max(0, now - timestamp);
    const running = ageMs <= staleMs;
    return {
      ...base,
      status: running ? 'running' : 'stale',
      running,
      ageMs,
      timestamp,
    };
  } catch (error) {
    return { ...base, status: 'corrupt', running: false, ageMs: null, timestamp: null, error: error.message };
  }
}

export function formatWatcherHeartbeatStatus(status) {
  return [
    'SUPERVIBE_WATCHER_HEARTBEAT_STATUS',
    `STATUS: ${status.status}`,
    `RUNNING: ${status.running ? 'yes' : 'no'}`,
    `WATCHERS: ${status.watchers.join(',')}`,
    `AGE_MS: ${status.ageMs ?? 'unknown'}`,
    `STALE_MS: ${status.staleMs}`,
    `HEARTBEAT_PATH: ${status.heartbeatPath}`,
    status.error ? `ERROR: ${status.error}` : null,
  ].filter(Boolean).join('\n');
}

export async function startWatcher(projectRoot, opts = {}) {
  const { useEmbeddings = true, verbose = true } = opts;
  const indexConfig = await ensureIndexConfig({ rootDir: projectRoot });
  const refreshIntervalMs = Number(opts.refreshIntervalMs || indexConfig.refreshIntervalMs || DEFAULT_INDEX_REFRESH_INTERVAL_MS);

  const memoryStore = new MemoryStore(projectRoot, { useEmbeddings });
  await memoryStore.init();

  const codeStore = new CodeStore(projectRoot, { useEmbeddings });
  await codeStore.init();
  const codeLifecycle = createIndexWatcherLifecycle({ rootDir: projectRoot, codeStore });

  if (verbose) console.log(`[supervibe-watcher] starting; root=${projectRoot}; refresh=${Math.round(refreshIntervalMs / 60000)}m`);

  const memWatcher = chokidar.watch(join(projectRoot, '.supervibe', 'memory'), {
    ignored: /(^|[/\\])\..*\.swp$|memory\.db|code\.db$/,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
  });

  memWatcher
    .on('add', async (path) => {
      if (!path.endsWith('.md')) return;
      try {
        const r = await memoryStore.incrementalUpdate(path);
        if (verbose) console.log(`[supervibe-watcher] memory +${r.indexed ? 'INDEXED' : r.skipped}: ${path}`);
      } catch (err) { console.error(`[supervibe-watcher] memory err: ${err.message}`); }
    })
    .on('change', async (path) => {
      if (!path.endsWith('.md')) return;
      try {
        const r = await memoryStore.incrementalUpdate(path);
        if (verbose) console.log(`[supervibe-watcher] memory ~${r.indexed ? 'REINDEXED' : r.skipped}: ${path}`);
      } catch (err) { console.error(`[supervibe-watcher] memory err: ${err.message}`); }
    })
    .on('unlink', async (path) => {
      try {
        const r = await memoryStore.removeEntryByPath(path);
        if (verbose) console.log(`[supervibe-watcher] memory -REMOVED: ${path} (${JSON.stringify(r)})`);
      } catch (err) { console.error(`[supervibe-watcher] memory err: ${err.message}`); }
    });

  const codeWatcher = chokidar.watch(projectRoot, {
    ignored: [
      /(^|[\/\\])\../,
      /node_modules/,
      /\.git/,
      /\bdist\b/,
      /\bbuild\b/,
      /\bout\b/,
      /\.next/,
      /coverage/,
      /\.turbo/,
      /vendor/,
      /__pycache__/,
      /\btarget\b/,
      /\.venv|\bvenv\b/,
      /\.(min|bundle)\./,
      /\.(test|spec)\.(ts|tsx|js|jsx)$/,
      /\.d\.ts$/
    ],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 }
  });

  const handleCode = async (event, path) => {
    try {
      const result = await codeLifecycle.handleSourceEvent(event, path);
      if (!verbose || result.action === 'ignored') return;
      if (result.action === 'removed') console.log(`[supervibe-watcher] code -REMOVED: ${path}`);
      if (result.action === 'indexed') console.log(`[supervibe-watcher] code ~${event.toUpperCase()}: ${path}`);
    } catch (err) { console.error(`[supervibe-watcher] code err: ${err.message}`); }
  };

  codeWatcher
    .on('add', (p) => handleCode('add', p))
    .on('change', (p) => handleCode('change', p))
    .on('unlink', (p) => handleCode('unlink', p));

  if (verbose) console.log(`[supervibe-watcher] watching .supervibe/memory/ + project source files`);

  // Heartbeat file: status command uses this to confirm watcher is alive.
  const heartbeatPath = join(projectRoot, WATCHER_HEARTBEAT_REL);
  const heartbeatTimer = setInterval(async () => {
    try { await writeFile(heartbeatPath, String(Date.now())); } catch {}
  }, 5000);
  // Write initial heartbeat immediately so status command sees us right after start
  try { await writeFile(heartbeatPath, String(Date.now())); } catch {}

  let refreshRunning = false;
  const refreshTimer = setInterval(async () => {
    if (refreshRunning) return;
    refreshRunning = true;
    try {
      const [memory, code] = await Promise.all([
        scanMemoryChanges(memoryStore, projectRoot),
        scanCodeChanges(codeStore, projectRoot),
      ]);
      if (verbose) {
        console.log(`[supervibe-watcher] periodic ${Math.round(refreshIntervalMs / 60000)}m scan: memory=${memory.reindexed}/${memory.removed} code=${code.reindexed + code.discovered}/${code.removed} errors=${memory.errors + code.errors}`);
      }
    } catch (error) {
      console.error(`[supervibe-watcher] periodic scan err: ${error.message}`);
    } finally {
      refreshRunning = false;
    }
  }, refreshIntervalMs);

  return {
    stop: async () => {
      clearInterval(heartbeatTimer);
      clearInterval(refreshTimer);
      try { await rm(heartbeatPath, { force: true }); } catch {}
      await memWatcher.close();
      await codeWatcher.close();
      memoryStore.close();
      codeStore.close();
      if (verbose) console.log('[supervibe-watcher] stopped');
    },
    memoryStore,
    codeStore
  };
}
