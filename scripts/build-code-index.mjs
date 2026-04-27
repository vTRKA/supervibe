#!/usr/bin/env node
// Code RAG + Code Graph indexer: walks project, indexes supported source files into .claude/memory/code.db
// Idempotent: hash-based change detection skips unchanged files.
//
// Modes:
//   default              full project walk
//   --since=<git-rev>    lazy mode — only files changed since given git rev (e.g. HEAD~50)
//   --no-embeddings      BM25-only (skip semantic embeddings)

import { CodeStore } from './lib/code-store.mjs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';

const PROJECT_ROOT = process.cwd();

async function main() {
  const { values } = parseArgs({
    options: {
      'no-embeddings': { type: 'boolean', default: false },
      since: { type: 'string', default: '' }
    },
    strict: false
  });

  const noEmbeddings = values['no-embeddings'];

  let filesToIndex = null;
  if (values.since) {
    try {
      const out = execSync(`git log --name-only --pretty=format: ${values.since}..HEAD`, {
        cwd: PROJECT_ROOT, encoding: 'utf8'
      });
      const set = new Set(
        out.split('\n')
          .map(l => l.trim())
          .filter(Boolean)
          .map(rel => join(PROJECT_ROOT, rel))
          .filter(abs => existsSync(abs))
      );
      filesToIndex = [...set];
      console.log(`Lazy mode: ${filesToIndex.length} files changed since ${values.since}`);
    } catch (err) {
      console.error(`--since=${values.since} failed: ${err.message}`);
      console.error('Falling back to full index.');
    }
  }

  console.log(`Indexing code in ${PROJECT_ROOT}${noEmbeddings ? ' (BM25 only, embeddings disabled)' : ''}...`);
  const t0 = Date.now();

  const store = new CodeStore(PROJECT_ROOT, { useEmbeddings: !noEmbeddings });
  await store.init();

  const counts = filesToIndex
    ? await store.indexFiles(filesToIndex)
    : await store.indexAll(PROJECT_ROOT);

  const stats = store.stats();
  store.close();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s.`);
  console.log(`  Files indexed: ${counts.indexed}`);
  console.log(`  Files skipped (unchanged/unsupported): ${counts.skipped}`);
  console.log(`  Errors: ${counts.errors}`);
  if (typeof counts.edgesResolved === 'number') {
    console.log(`  Edges resolved cross-file: ${counts.edgesResolved}`);
  }
  console.log(`\nTotal in DB: ${stats.totalFiles} files, ${stats.totalChunks} chunks`);
  console.log(`Code graph: ${stats.totalSymbols} symbols, ${stats.totalEdges} edges (${(stats.edgeResolutionRate * 100).toFixed(0)}% resolved)`);
  if (stats.byLang.length > 0) {
    console.log(`By language:`);
    for (const lg of stats.byLang) console.log(`  ${lg.language}: ${lg.n}`);
  }
}

main().catch(err => { console.error('build-code-index error:', err); process.exit(1); });
