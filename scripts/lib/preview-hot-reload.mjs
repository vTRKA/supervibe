// chokidar → SSE bridge. Watches root dir, debounces rapid changes,
// invokes server.broadcastReload() on each settled change.

import chokidar from 'chokidar';

const DEFAULT_DEBOUNCE_MS = 150;

/**
 * Attach hot-reload watcher to a static server.
 */
export async function attachHotReload({ root, server, debounceMs = DEFAULT_DEBOUNCE_MS }) {
  const watcher = chokidar.watch(root, {
    persistent: true,
    ignoreInitial: true,
    ignored: [
      /node_modules/,
      /\.git/,
      /(^|[\\\/])\.[^\\\/]+/,
    ],
    awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 30 },
  });

  let debounceTimer = null;
  let watchedCount = 0;

  function trigger() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try { server.broadcastReload(); } catch {}
    }, debounceMs);
  }

  watcher.on('add', () => { watchedCount++; trigger(); });
  watcher.on('change', trigger);
  watcher.on('unlink', () => { watchedCount = Math.max(0, watchedCount - 1); trigger(); });

  await new Promise(resolve => watcher.once('ready', resolve));

  return {
    close: async () => {
      clearTimeout(debounceTimer);
      await watcher.close();
    },
    getWatchedCount: () => watchedCount,
  };
}
