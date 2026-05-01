#!/usr/bin/env node
// Code RAG + Code Graph indexer: walks project, indexes supported source files into .supervibe/memory/code.db
// Idempotent: hash-based change detection skips unchanged files.
//
// Modes:
//   default              full project walk
//   --since=<git-rev>    lazy mode - only files changed since given git rev (e.g. HEAD~50)
//   --resume             index only missing/stale files from the current policy inventory
//   --no-embeddings      BM25/source-readiness mode; embeddings and graph work are skipped unless --graph is passed
// Runtime:
//   no total timeout - large projects run until complete; heartbeat and progress are logged periodically

import { CodeStore, CODE_GRAPH_EXTRACTOR_VERSION } from './lib/code-store.mjs';
import { collectIndexHealthFromStore, formatIndexHealth } from './lib/supervibe-index-health.mjs';
import { discoverSourceFiles } from './lib/supervibe-index-policy.mjs';
import { formatWatcherDiagnostics, readWatcherDiagnostics } from './lib/supervibe-index-watcher.mjs';
import { recoverCorruptCodeDb } from './lib/supervibe-db-migrations.mjs';
import { buildRepoMap, formatRepoMapContext, selectRepoMapContext } from './lib/supervibe-repo-map.mjs';
import { createWorkspaceNamespace } from './lib/supervibe-workspace-isolation.mjs';
import { hashFile } from './lib/file-hash.mjs';
import { execFileSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const PROJECT_ROOT = process.cwd();
const DEFAULT_INDEX_PROGRESS_EVERY = 25;
const DEFAULT_HEARTBEAT_SECONDS = 10;
const DEFAULT_LIST_MISSING_LIMIT = 200;

function formatUsage() {
  return `
Supervibe code indexer

Usage:
  node scripts/build-code-index.mjs [options]

Core options:
  --root <path>             Project root to index (default: current directory)
  --force                   Reindex selected files even when their hash is unchanged
  --health                  Print source coverage, graph, stale-row, and language health after indexing
  --no-embeddings           BM25/source-readiness mode: skip embeddings and graph unless --graph is also passed
  --graph                   Keep graph extraction enabled with --no-embeddings
  --no-graph                Skip graph extraction and cross-file edge resolution

Large-project controls:
  --resume                  Index only missing/stale files from the policy inventory
  --list-missing            Print missing/stale files and exit without indexing
  --max-files <n>           Cap this run to n selected files for batch indexing
  --since <git-rev>         Index files changed in git history range <git-rev>..HEAD

Observability:
  --progress-every <n>      Print completed-file progress every n files (default: 25)
  --heartbeat-seconds <n>   Print liveness heartbeat every n seconds (default: 10, 0 disables)
  --explain-policy          Show included/excluded source policy decisions and exit
  --watcher-diagnostics     Show watcher diagnostics and exit
  --repo-map                Print a compact repo map and exit
  --help, -h                Show this help and exit

Examples:
  node scripts/build-code-index.mjs --root . --force --health
  node scripts/build-code-index.mjs --root . --resume --max-files 200 --health --no-embeddings
  node scripts/build-code-index.mjs --root . --list-missing
`.trim();
}

function positiveInt(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.trunc(num) : fallback;
}

function nonNegativeInt(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.trunc(num) : fallback;
}

function formatElapsed(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return `${minutes}m${rest.toString().padStart(2, '0')}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h${(minutes % 60).toString().padStart(2, '0')}m`;
}

function createProgressLogger({
  progressEvery = DEFAULT_INDEX_PROGRESS_EVERY,
  heartbeatSeconds = DEFAULT_HEARTBEAT_SECONDS,
} = {}) {
  const startedAt = Date.now();
  const state = {
    phase: 'starting',
    current: 0,
    total: 0,
    indexed: 0,
    skipped: 0,
    errors: 0,
    resolved: 0,
    path: '',
  };
  let lastLoggedFile = 0;
  let lastStage = '';
  const heartbeatMs = heartbeatSeconds > 0 ? heartbeatSeconds * 1000 : 0;

  const render = (kind = 'heartbeat') => {
    const total = Number(state.total || 0);
    const current = Number(state.current || 0);
    const remaining = total > 0 ? Math.max(0, total - current) : '?';
    const filePart = state.path ? ` current=${state.path}` : '';
    const edgePart = state.phase === 'resolving-edges' ? ` resolved=${state.resolved || 0}` : '';
    console.log(`[supervibe:index] ${kind} stage=${state.phase} ${current}/${total || '?'} remaining=${remaining} indexed=${state.indexed || 0} skipped=${state.skipped || 0} errors=${state.errors || 0}${edgePart} elapsed=${formatElapsed(Date.now() - startedAt)}${filePart}`);
  };

  const interval = heartbeatMs > 0 ? setInterval(() => render('heartbeat'), heartbeatMs) : null;
  interval?.unref?.();

  return {
    onProgress(event = {}) {
      Object.assign(state, {
        ...event,
        phase: event.phase || state.phase,
        path: event.path || state.path,
      });

      if (event.phase === 'discovered') {
        state.current = 0;
        state.total = Number(event.total || 0);
        console.log(`[supervibe:index] stage=discovery discovered ${state.total} eligible source file(s); no total timeout; progress every ${progressEvery} file(s); heartbeat every ${heartbeatSeconds}s`);
        return;
      }

      if (event.phase && event.phase !== lastStage && ['selection', 'health', 'resolving-edges', 'done'].includes(event.phase)) {
        lastStage = event.phase;
        render('stage');
      }

      if (event.phase === 'file') {
        const current = Number(event.current || 0);
        const total = Number(event.total || 0);
        if (current === total || current - lastLoggedFile >= progressEvery) {
          lastLoggedFile = current;
          render('progress');
        }
      }

      if (event.phase === 'resolving-edges' && typeof event.current === 'number') {
        const current = Number(event.current || 0);
        const total = Number(event.total || 0);
        if (current === total || current - lastLoggedFile >= 1000) {
          render('progress');
        }
      }
    },
    stop() {
      if (interval) clearInterval(interval);
    },
    render,
  };
}

function isPidRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function readLock(lockPath) {
  try {
    return JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

function acquireIndexLock({ rootDir }) {
  const lockPath = join(rootDir, '.supervibe', 'memory', 'code-index.lock');
  mkdirSync(dirname(lockPath), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let fd = null;
    try {
      fd = openSync(lockPath, 'wx');
      writeFileSync(fd, JSON.stringify({
        pid: process.pid,
        startedAt: new Date().toISOString(),
        command: process.argv.join(' '),
      }, null, 2));
      closeSync(fd);
      return {
        path: lockPath,
        release() {
          const current = readLock(lockPath);
          if (current?.pid === process.pid) {
            try { unlinkSync(lockPath); } catch {}
          }
        },
      };
    } catch (error) {
      if (fd !== null) {
        try { closeSync(fd); } catch {}
      }
      if (error.code !== 'EEXIST') throw error;
      const lock = readLock(lockPath);
      if (lock?.pid && isPidRunning(Number(lock.pid))) {
        const err = new Error(`another code indexer is already running (pid=${lock.pid}, startedAt=${lock.startedAt || 'unknown'}). Lock: ${lockPath}`);
        err.code = 'SUPERVIBE_INDEX_LOCKED';
        throw err;
      }
      try { unlinkSync(lockPath); } catch {}
    }
  }

  throw new Error(`could not acquire index lock: ${lockPath}`);
}

async function collectMissingOrStaleFiles(store, rootDir, {
  includeGraph = true,
  onProgress = null,
} = {}) {
  onProgress?.({ phase: 'discovery' });
  const inventory = await discoverSourceFiles(rootDir);
  const rows = store.db.prepare('SELECT path, content_hash AS contentHash, graph_version AS graphVersion FROM code_files').all();
  const byPath = new Map(rows.map((row) => [row.path, row]));
  const selected = [];

  for (const [index, file] of inventory.files.entries()) {
    const row = byPath.get(file.relPath);
    const current = index + 1;
    if (!row) {
      selected.push({ ...file, reason: 'missing-row' });
    } else {
      onProgress?.({ phase: 'hashing', current, total: inventory.files.length, path: file.relPath });
      let fileHash = '';
      try { fileHash = await hashFile(file.absPath); } catch {}
      if (fileHash && fileHash !== row.contentHash) {
        selected.push({ ...file, reason: 'content-changed' });
      } else if (includeGraph && Number(row.graphVersion || 0) !== CODE_GRAPH_EXTRACTOR_VERSION) {
        selected.push({ ...file, reason: 'graph-version-stale' });
      }
    }
    if (current % 100 === 0 || current === inventory.files.length) {
      onProgress?.({ phase: 'selection', current, total: inventory.files.length, path: file.relPath });
    }
  }

  return {
    inventory,
    files: selected,
    indexedRows: rows.length,
  };
}

function capFiles(files, maxFiles) {
  if (!maxFiles || files.length <= maxFiles) return { files, capped: false };
  return { files: files.slice(0, maxFiles), capped: true };
}

function formatMissingList(report, { maxFiles = DEFAULT_LIST_MISSING_LIMIT } = {}) {
  const shown = report.files.slice(0, maxFiles);
  const lines = [
    'SUPERVIBE_INDEX_MISSING',
    `ELIGIBLE_SOURCE_FILES: ${report.inventory.files.length}`,
    `INDEXED_ROWS: ${report.indexedRows}`,
    `MISSING_OR_STALE: ${report.files.length}`,
    `SHOWING: ${shown.length}`,
  ];
  for (const file of shown) {
    lines.push(`- ${file.relPath} (${file.reason})`);
  }
  if (report.files.length > shown.length) {
    lines.push(`... ${report.files.length - shown.length} more; use --resume --max-files <n> to process in batches`);
  }
  return lines.join('\n');
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(formatUsage());
    return;
  }

  const { values } = parseArgs({
    options: {
      'no-embeddings': { type: 'boolean', default: false },
      'no-graph': { type: 'boolean', default: false },
      graph: { type: 'boolean', default: false },
      since: { type: 'string', default: '' },
      root: { type: 'string', default: '' },
      force: { type: 'boolean', default: false },
      migrate: { type: 'boolean', default: false },
      health: { type: 'boolean', default: false },
      resume: { type: 'boolean', default: false },
      'list-missing': { type: 'boolean', default: false },
      'max-files': { type: 'string', default: '' },
      'explain-policy': { type: 'boolean', default: false },
      'watcher-diagnostics': { type: 'boolean', default: false },
      'repo-map': { type: 'boolean', default: false },
      'progress-every': { type: 'string', default: '' },
      'heartbeat-seconds': { type: 'string', default: '' },
    },
    strict: false,
  });

  const noEmbeddings = values['no-embeddings'];
  const rootDir = values.root ? resolve(PROJECT_ROOT, values.root) : PROJECT_ROOT;
  const progressEvery = positiveInt(values['progress-every'] || process.env.SUPERVIBE_INDEX_PROGRESS_EVERY, DEFAULT_INDEX_PROGRESS_EVERY);
  const heartbeatSeconds = nonNegativeInt(values['heartbeat-seconds'] || process.env.SUPERVIBE_INDEX_HEARTBEAT_SECONDS, DEFAULT_HEARTBEAT_SECONDS);
  const maxFiles = nonNegativeInt(values['max-files'], 0);
  const graphEnabled = values['no-graph'] ? false : (noEmbeddings && !values.graph ? false : true);
  const progress = createProgressLogger({ progressEvery, heartbeatSeconds });

  if (values['watcher-diagnostics']) {
    console.log(formatWatcherDiagnostics(readWatcherDiagnostics({ rootDir })));
    progress.stop();
    return;
  }

  if (values['repo-map']) {
    const repoMap = await buildRepoMap({ rootDir, tier: 'standard' });
    console.log(formatRepoMapContext(selectRepoMapContext(repoMap, { tier: 'standard', query: values.query || '' })));
    progress.stop();
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
    progress.stop();
    return;
  }

  let lock = null;
  let store = null;
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    progress.stop();
    try { store?.close(); } catch {}
    try { lock?.release(); } catch {}
  };

  const signalHandler = (signal) => {
    console.error(`[supervibe:index] received ${signal}; closing DB and releasing lock`);
    cleanup();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };
  process.once('SIGINT', signalHandler);
  process.once('SIGTERM', signalHandler);

  try {
    lock = acquireIndexLock({ rootDir });

    store = new CodeStore(rootDir, {
      useEmbeddings: !noEmbeddings,
      useGraph: graphEnabled,
    });
    try {
      await store.init();
    } catch (error) {
      if (!values.migrate) throw error;
      const recovery = recoverCorruptCodeDb({ dbPath: join(rootDir, '.supervibe', 'memory', 'code.db'), rootDir });
      console.log(`Code DB recovery: ${recovery.recovered ? 'recovered' : 'not-needed'}`);
      if (recovery.backupPath) console.log(`  Backup: ${recovery.backupPath}`);
      if (recovery.rebuildCommand) console.log(`  Rebuild: ${recovery.rebuildCommand}`);
      store = new CodeStore(rootDir, { useEmbeddings: !noEmbeddings, useGraph: graphEnabled });
      await store.init();
    }

    if (values['list-missing']) {
      const report = await collectMissingOrStaleFiles(store, rootDir, {
        includeGraph: graphEnabled,
        onProgress: progress.onProgress,
      });
      console.log(formatMissingList(report, { maxFiles: maxFiles || DEFAULT_LIST_MISSING_LIMIT }));
      return;
    }

    let filesToIndex = null;
    let modeLabel = 'full project walk';
    if (values.resume) {
      const report = await collectMissingOrStaleFiles(store, rootDir, {
        includeGraph: graphEnabled,
        onProgress: progress.onProgress,
      });
      const capped = capFiles(report.files, maxFiles);
      filesToIndex = capped.files.map((file) => file.absPath);
      modeLabel = `resume missing/stale (${filesToIndex.length}/${report.files.length} selected${capped.capped ? `, capped by --max-files=${maxFiles}` : ''})`;
      console.log(`[supervibe:index] resume mode: ${report.files.length} missing/stale file(s), ${filesToIndex.length} selected`);
    } else if (values.since) {
      try {
        const out = execFileSync('git', ['log', '--name-only', '--pretty=format:', `${values.since}..HEAD`], {
          cwd: rootDir,
          encoding: 'utf8',
        });
        const inventory = await discoverSourceFiles(rootDir);
        const eligible = new Map(inventory.files.map((file) => [file.relPath, file.absPath]));
        const changed = [...new Set(out.split('\n').map((line) => line.trim()).filter(Boolean))]
          .filter((relPath) => eligible.has(relPath))
          .map((relPath) => eligible.get(relPath));
        const capped = capFiles(changed, maxFiles);
        filesToIndex = capped.files;
        modeLabel = `since ${values.since} (${filesToIndex.length}/${changed.length} selected${capped.capped ? `, capped by --max-files=${maxFiles}` : ''})`;
        console.log(`Lazy mode: ${changed.length} files changed since ${values.since} (${changed.length} eligible)`);
      } catch (err) {
        console.error(`--since=${values.since} failed: ${err.message}`);
        console.error('Falling back to full index.');
      }
    } else if (maxFiles) {
      const inventory = await discoverSourceFiles(rootDir);
      const capped = capFiles(inventory.files, maxFiles);
      filesToIndex = capped.files.map((file) => file.absPath);
      modeLabel = `batch first ${filesToIndex.length}/${inventory.files.length} eligible file(s)`;
    }

    const modeParts = [];
    if (noEmbeddings) modeParts.push('BM25/source-readiness, embeddings disabled');
    if (!graphEnabled) modeParts.push('graph disabled');
    if (values.force) modeParts.push('force refresh');
    console.log(`Indexing code in ${rootDir} (${modeLabel}${modeParts.length ? `; ${modeParts.join('; ')}` : ''})...`);
    console.log(`Workspace namespace: ${createWorkspaceNamespace({ projectRoot: rootDir }).workspaceId}`);
    console.log(`Index lock: ${lock.path}`);
    const t0 = Date.now();

    const counts = filesToIndex
      ? await store.indexFiles(filesToIndex, { onProgress: progress.onProgress, force: values.force })
      : await store.indexAll(rootDir, { onProgress: progress.onProgress, force: values.force });

    const stats = store.stats();
    const health = values.health
      ? await (progress.onProgress({ phase: 'health', current: counts.discovered || counts.indexed + counts.skipped, total: counts.discovered || counts.indexed + counts.skipped }), collectIndexHealthFromStore(store, { rootDir }))
      : null;

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\nDone in ${elapsed}s.`);
    console.log(`  Files indexed: ${counts.indexed}`);
    console.log(`  Files skipped (unchanged/unsupported): ${counts.skipped}`);
    console.log(`  Errors: ${counts.errors}`);
    if (typeof counts.pruned === 'number') console.log(`  Stale rows pruned: ${counts.pruned}`);
    if (typeof counts.edgesResolved === 'number') {
      console.log(`  Edges resolved cross-file: ${counts.edgesResolved}${graphEnabled ? '' : ' (graph disabled)'}`);
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
  } finally {
    cleanup();
    process.off('SIGINT', signalHandler);
    process.off('SIGTERM', signalHandler);
  }
}

main().catch((err) => {
  if (err.code === 'SUPERVIBE_INDEX_LOCKED') {
    console.error(`build-code-index locked: ${err.message}`);
    process.exit(2);
  }
  console.error('build-code-index error:', err);
  process.exit(1);
});
