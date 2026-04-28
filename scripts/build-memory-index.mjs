#!/usr/bin/env node
// Memory v2 builder: SQLite FTS5 with BM25 ranking + tag table.
// Replaces v1 (markdown+grep+JSON index).
// Idempotent: clears + reindexes from filesystem source-of-truth.

import { rebuildMemory } from './lib/memory-store.mjs';

const PROJECT_ROOT = process.cwd();

async function main() {
  const result = await rebuildMemory(PROJECT_ROOT);
  console.log(`Memory index built (SQLite FTS5): ${result.entriesIndexed} entries indexed`);

  if (result.entriesIndexed === 0) {
    console.log('Memory directory is empty. Add entries via supervibe:add-memory skill.');
  }
}

main().catch(err => { console.error('build-memory-index error:', err); process.exit(1); });
