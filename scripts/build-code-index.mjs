#!/usr/bin/env node
// Code RAG + Code Graph indexer: walks project, indexes supported source files into .supervibe/memory/code.db
// Idempotent: hash-based change detection skips unchanged files.
//
// Modes:
//   default              full project walk
//   --since=<git-rev>    lazy mode — only files changed since given git rev (e.g. HEAD~50)
//   --no-embeddings      BM25-only (skip semantic embeddings)

import { CodeStore } from './lib/code-store.mjs';
import { collectIndexHealthFromStore, formatIndexHealth } from './lib/supervibe-index-health.mjs';
import { discoverSourceFiles } from './lib/supervibe-index-policy.mjs';
import { formatWatcherDiagnostics, readWatcherDiagnostics } from './lib/supervibe-index-watcher.mjs';
import { recoverCorruptCodeDb } from './lib/supervibe-db-migrations.mjs';
import { buildRepoMap, formatRepoMapContext, selectRepoMapContext } from './lib/supervibe-repo-map.mjs';
import { createWorkspaceNamespace } from './lib/supervibe-workspace-isolation.mjs';
import { execSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';

const PROJECT_ROOT = process.cwd();

async function main() {
  const { values } = parseArgs({
    options: {
      'no-embeddings': { type: 'boolean', default: false },
      since: { type: 'string', default: '' },
      root: { type: 'string', default: '' },
      force: { type: 'boolean', default: false },
      migrate: { type: 'boolean', default: false },
      health: { type: 'boolean', default: false },
      'explain-policy': { type: 'boolean', default: false },
      'watcher-diagnostics': { type: 'boolean', default: false },
      'repo-map': { type: 'boolean', default: false }
    },
    strict: false
  });

  const noEmbeddings = values['no-embeddings'];
  const rootDir = values.root ? resolve(PROJECT_ROOT, values.root) : PROJECT_ROOT;

  if (values['watcher-diagnostics']) {
    console.log(formatWatcherDiagnostics(readWatcherDiagnostics({ rootDir })));
    return;
  }

  if (values['repo-map']) {
    const repoMap = await buildRepoMap({ rootDir, tier: 'standard' });
    console.log(formatRepoMapContext(selectRepoMapContext(repoMap, { tier: 'standard', query: values.query || '' })));
    return;
  }

  if (values['explain-policy']) {
    const inventory = await discoverSourceFiles(rootDir, { explain: true });
    console.log(`Index policy for ${rootDir}`);
    console.log(`  Included source files: ${inventory.files.length}`);
    console.log(`  Excluded paths with reasons: ${inventory.excluded.length}`);
    for (const item of inventory.excluded.slice(0, 50)) {
      console.log(`  - ${item.path}: ${item.reason}`);
    }
    if (inventory.excluded.length > 50) console.log(`  ... ${inventory.excluded.length - 50} more`);
    return;
  }

  let filesToIndex = null;
  if (values.since) {
    try {
      const out = execSync(`git log --name-only --pretty=format: ${values.since}..HEAD`, {
        cwd: rootDir, encoding: 'utf8'
      });
      const set = new Set(
        out.split('\n')
          .map(l => l.trim())
          .filter(Boolean)
          .map(rel => join(rootDir, rel))
          .filter(abs => existsSync(abs))
      );
      filesToIndex = [...set];
      console.log(`Lazy mode: ${filesToIndex.length} files changed since ${values.since}`);
    } catch (err) {
      console.error(`--since=${values.since} failed: ${err.message}`);
      console.error('Falling back to full index.');
    }
  }

  console.log(`Indexing code in ${rootDir}${noEmbeddings ? ' (BM25 only, embeddings disabled)' : ''}${values.force ? ' (force full discovery)' : ''}...`);
  console.log(`Workspace namespace: ${createWorkspaceNamespace({ projectRoot: rootDir }).workspaceId}`);
  const t0 = Date.now();

  let store = new CodeStore(rootDir, { useEmbeddings: !noEmbeddings });
  try {
    await store.init();
  } catch (error) {
    if (!values.migrate) throw error;
    const recovery = recoverCorruptCodeDb({ dbPath: join(rootDir, '.supervibe', 'memory', 'code.db'), rootDir });
    console.log(`Code DB recovery: ${recovery.recovered ? 'recovered' : 'not-needed'}`);
    if (recovery.backupPath) console.log(`  Backup: ${recovery.backupPath}`);
    if (recovery.rebuildCommand) console.log(`  Rebuild: ${recovery.rebuildCommand}`);
    store = new CodeStore(rootDir, { useEmbeddings: !noEmbeddings });
    await store.init();
  }

  const counts = filesToIndex
    ? await store.indexFiles(filesToIndex)
    : await store.indexAll(rootDir);

  const stats = store.stats();
  const health = values.health ? await collectIndexHealthFromStore(store, { rootDir }) : null;
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
  if (health) {
    console.log();
    console.log(formatIndexHealth(health));
  }
}

main().catch(err => { console.error('build-code-index error:', err); process.exit(1); });
