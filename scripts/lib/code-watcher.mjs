// File-watcher daemon that auto-reindexes memory + code on file changes.
// Uses chokidar for cross-platform fs watching with debouncing.

import chokidar from 'chokidar';
import { join } from 'node:path';
import { writeFile, rm } from 'node:fs/promises';
import { MemoryStore } from './memory-store.mjs';
import { CodeStore } from './code-store.mjs';
import { createIndexWatcherLifecycle } from './supervibe-index-watcher.mjs';

export async function startWatcher(projectRoot, opts = {}) {
  const { useEmbeddings = true, verbose = true } = opts;

  const memoryStore = new MemoryStore(projectRoot, { useEmbeddings });
  await memoryStore.init();

  const codeStore = new CodeStore(projectRoot, { useEmbeddings });
  await codeStore.init();
  const codeLifecycle = createIndexWatcherLifecycle({ rootDir: projectRoot, codeStore });

  if (verbose) console.log(`[supervibe-watcher] starting; root=${projectRoot}`);

  const memWatcher = chokidar.watch(join(projectRoot, '.claude', 'memory'), {
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

  if (verbose) console.log(`[supervibe-watcher] watching .claude/memory/ + project source files`);

  // Heartbeat file: status command uses this to confirm watcher is alive.
  const heartbeatPath = join(projectRoot, '.claude', 'memory', '.watcher-heartbeat');
  const heartbeatTimer = setInterval(async () => {
    try { await writeFile(heartbeatPath, String(Date.now())); } catch {}
  }, 5000);
  // Write initial heartbeat immediately so status command sees us right after start
  try { await writeFile(heartbeatPath, String(Date.now())); } catch {}

  return {
    stop: async () => {
      clearInterval(heartbeatTimer);
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
