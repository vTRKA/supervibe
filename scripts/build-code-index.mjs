#!/usr/bin/env node
// Code RAG indexer: walks project, indexes supported source files into .claude/memory/code.db
// Idempotent: hash-based change detection skips unchanged files.

import { CodeStore } from './lib/code-store.mjs';

const PROJECT_ROOT = process.cwd();

async function main() {
  const args = process.argv.slice(2);
  const noEmbeddings = args.includes('--no-embeddings');

  console.log(`Indexing code in ${PROJECT_ROOT}${noEmbeddings ? ' (BM25 only, embeddings disabled)' : ''}...`);
  const t0 = Date.now();

  const store = new CodeStore(PROJECT_ROOT, { useEmbeddings: !noEmbeddings });
  await store.init();
  const counts = await store.indexAll(PROJECT_ROOT);
  const stats = store.stats();
  store.close();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s.`);
  console.log(`  Files indexed: ${counts.indexed}`);
  console.log(`  Files skipped (unchanged/unsupported): ${counts.skipped}`);
  console.log(`  Errors: ${counts.errors}`);
  console.log(`\nTotal in DB: ${stats.totalFiles} files, ${stats.totalChunks} chunks`);
  if (stats.byLang.length > 0) {
    console.log(`By language:`);
    for (const lg of stats.byLang) console.log(`  ${lg.language}: ${lg.n}`);
  }
}

main().catch(err => { console.error('build-code-index error:', err); process.exit(1); });
