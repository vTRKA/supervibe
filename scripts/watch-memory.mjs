#!/usr/bin/env node
// File-watcher daemon entry. Run via `npm run memory:watch`.
// Auto-reindexes memory entries (.claude/memory/**) AND source code on change.
// Stop with Ctrl+C.

import { startWatcher } from './lib/code-watcher.mjs';

const PROJECT_ROOT = process.cwd();

async function main() {
  const args = process.argv.slice(2);
  const noEmbeddings = args.includes('--no-embeddings');

  console.log(`Starting supervibe memory + code watcher in ${PROJECT_ROOT}`);
  if (noEmbeddings) console.log('  (embeddings disabled — BM25 only)');

  const handle = await startWatcher(PROJECT_ROOT, {
    useEmbeddings: !noEmbeddings,
    verbose: true
  });

  const shutdown = async (sig) => {
    console.log(`\n[supervibe-watcher] received ${sig}, shutting down...`);
    await handle.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  console.log('Watcher running. Press Ctrl+C to stop.');
  setInterval(() => {}, 1 << 30);
}

main().catch(err => { console.error('watch-memory error:', err); process.exit(1); });
