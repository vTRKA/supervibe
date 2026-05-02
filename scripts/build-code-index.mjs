#!/usr/bin/env node
// Code RAG + Code Graph indexer: walks project, indexes supported source files into .supervibe/memory/code.db
// Idempotent: hash-based change detection skips unchanged files.
//
// Modes:
//   default              full project walk
//   --since=<git-rev>    lazy mode - only files changed since given git rev (e.g. HEAD~50)
//   --resume             index only missing/stale files from the current policy inventory
//   --no-embeddings      BM25/source-readiness mode; embeddings and graph work are skipped unless --graph is passed
//   --source-only        plain text/BM25 readiness mode; embeddings and graph are skipped
// Runtime:
//   unbounded by default; --max-seconds enables graceful bounded batches

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
  --source-only             Plain text/BM25 readiness mode: skip embeddings and graph
  --no-embeddings           BM25/source-readiness mode: skip embeddings and graph unless --graph is also passed
  --graph                   Keep graph extraction enabled with --no-embeddings
  --no-graph                Skip graph extraction and cross-file edge resolution

Large-project controls:
  --resume                  Index only missing/stale files from the policy inventory
  --list-missing            Print missing/stale files and exit without indexing
  --max-files <n>           Cap this run to n selected files for batch indexing
  --max-seconds <n>         Hard watchdog limit; stops even inside the first active file phase
  --since <git-rev>         Index files changed in git history range <git-rev>..HEAD
  --language <name>         Repair only one detected language, e.g. rust, python, typescript
  --path <path>             Repair only files under this repo-relative path
  --file <path>             Repair exactly one repo-relative source file
  --debug-file <path>       Debug exactly one file with phase-level progress
  --trace-phases            Emit JSON progress/checkpoint updates for file phases
  --large-file-threshold-bytes <n>
                           Use incremental large-file mode above this byte size
  --large-file-threshold-lines <n>
                           Use incremental large-file mode above this line count
  --large-file-chunk-lines <n>
                           Max lines per incremental large-file source chunk
  --large-file-chunk-bytes <n>
                           Max bytes per incremental large-file source chunk
  --large-file-max-seconds <n>
                           Per-file large-file chunking timeout; preserves partial rows
  --large-file-fallback-mode <mode>
                           Large-file strategy: structural or line-window
  --known-failed-ttl <seconds>
                           TTL for skipping recent known-failed files in --resume --graph

Observability:
  --progress-every <n>      Print completed-file progress every n files (default: 25)
  --heartbeat-seconds <n>   Print liveness heartbeat every n seconds (default: 10, 0 disables)
  --json-progress           Emit SUPERVIBE_INDEX_PROGRESS JSON lines and update code-index-checkpoint.json
  --explain-policy          Show included/excluded source policy decisions and exit
  --watcher-diagnostics     Show watcher diagnostics and exit
  --clean-stale-lock        Inspect code-index.lock, remove it only when proven stale, and exit
  --verbose                 Include stack traces in failed_files.json
  --repo-map                Print a compact repo map and exit
  --help, -h                Show this help and exit

Examples:
  node scripts/build-code-index.mjs --root . --resume --source-only --max-files 200 --health
  node scripts/build-code-index.mjs --root . --resume --graph --max-files 200 --health
  node scripts/build-code-index.mjs --root . --resume --source-only --max-files 50 --max-seconds 30 --json-progress
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

function positiveNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
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

function normalizeRelPath(path = '') {
  return String(path || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function buildRepairFilter({ language = '', path = '', file = '', debugFile = '' } = {}) {
  const exact = normalizeRelPath(debugFile || file);
  const prefix = normalizeRelPath(path);
  const lang = String(language || '').trim().toLowerCase();
  return {
    language: lang,
    path: prefix,
    file: exact,
    debugFile: normalizeRelPath(debugFile),
    active: Boolean(lang || prefix || exact),
    matches(item = {}) {
      const relPath = normalizeRelPath(item.relPath || item.path || '');
      const itemLang = String(item.language || '').toLowerCase();
      if (lang && itemLang !== lang) return false;
      if (prefix && relPath !== prefix && !relPath.startsWith(`${prefix}/`)) return false;
      if (exact && relPath !== exact) return false;
      return true;
    },
  };
}

function applyRepairFilterToInventory(inventory, filter) {
  if (!filter?.active) return inventory;
  return {
    ...inventory,
    files: inventory.files.filter((file) => filter.matches(file)),
  };
}

function createProgressLogger({
  rootDir,
  progressEvery = DEFAULT_INDEX_PROGRESS_EVERY,
  heartbeatSeconds = DEFAULT_HEARTBEAT_SECONDS,
  jsonProgress = false,
  maxSeconds = 0,
  tracePhases = false,
  onStateChange = null,
} = {}) {
  const startedAt = Date.now();
  const checkpointPath = rootDir ? join(rootDir, '.supervibe', 'memory', 'code-index-checkpoint.json') : null;
  const state = {
    phase: 'starting',
    current: 0,
    total: 0,
    indexed: 0,
    skipped: 0,
    errors: 0,
    resolved: 0,
    path: '',
    selectionFile: null,
    activeIndexFile: null,
    chunkerMode: null,
    completed: 0,
  };
  let lastLoggedFile = 0;
  let lastStage = '';
  let lastPersistedCheckpoint = null;
  const heartbeatMs = heartbeatSeconds > 0 ? heartbeatSeconds * 1000 : 0;

  const snapshot = (kind) => {
    const total = Number(state.total || 0);
    const current = Number(state.current || 0);
    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    const remaining = total > 0 ? Math.max(0, total - current) : null;
    const rate = current > 0 && elapsedSeconds > 0 ? current / elapsedSeconds : 0;
    return {
      kind,
      stage: state.phase,
      phase: state.phase,
      currentFile: state.activeIndexFile || state.selectionFile || state.path || null,
      selectionFile: state.selectionFile || null,
      activeIndexFile: state.activeIndexFile || null,
      processed: Number(state.completed || 0),
      total,
      remaining,
      indexed: Number(state.indexed || 0),
      skipped: Number(state.skipped || 0),
      errors: Number(state.errors || 0),
      resolved: Number(state.resolved || 0),
      elapsedSeconds: Number(elapsedSeconds.toFixed(3)),
      etaSeconds: rate > 0 && remaining !== null ? Number((remaining / rate).toFixed(3)) : null,
      maxSeconds: maxSeconds || null,
      chunkerMode: state.chunkerMode || null,
      lastPersistedCheckpoint,
    };
  };

  const emitJson = (kind) => {
    if (!jsonProgress) return;
    process.stdout.write(`SUPERVIBE_INDEX_PROGRESS ${JSON.stringify(snapshot(kind))}\n`);
  };

  const persistCheckpoint = (kind) => {
    if (!checkpointPath) return;
    try {
      mkdirSync(dirname(checkpointPath), { recursive: true });
      lastPersistedCheckpoint = new Date().toISOString();
      writeFileSync(checkpointPath, JSON.stringify({
        ...snapshot(kind),
        lastPersistedAt: lastPersistedCheckpoint,
      }, null, 2));
    } catch {}
  };

  const render = (kind = 'heartbeat') => {
    const total = Number(state.total || 0);
    const current = Number(state.current || 0);
    const remaining = total > 0 ? Math.max(0, total - current) : '?';
    const filePart = state.path ? ` current=${state.path}` : '';
    const edgePart = state.phase === 'resolving-edges' ? ` resolved=${state.resolved || 0}` : '';
    console.log(`[supervibe:index] ${kind} stage=${state.phase} ${current}/${total || '?'} remaining=${remaining} indexed=${state.indexed || 0} skipped=${state.skipped || 0} errors=${state.errors || 0}${edgePart} elapsed=${formatElapsed(Date.now() - startedAt)}${filePart}`);
    emitJson(kind);
  };

  const interval = heartbeatMs > 0 ? setInterval(() => render('heartbeat'), heartbeatMs) : null;
  interval?.unref?.();

  return {
    onProgress(event = {}) {
      const phase = event.phase || state.phase;
      const path = event.path || state.path;
      if (phase === 'selection' || (phase === 'hashing' && !state.activeIndexFile)) {
        state.selectionFile = path || state.selectionFile;
      }
      if (phase === 'file-start') {
        state.activeIndexFile = path || state.activeIndexFile;
        state.completed = Math.max(0, Number(event.current || 1) - 1);
        state.chunkerMode = null;
      }
      if (['reading', 'hashing', 'chunking', 'db-write', 'embeddings', 'fts-write', 'graph-extraction'].includes(phase)) {
        state.activeIndexFile = path || state.activeIndexFile;
      }
      if (phase === 'file') {
        state.completed = Number(event.current || state.completed || 0);
      }
      if (phase === 'done') {
        state.completed = Number(event.processed || event.current || event.total || state.completed || 0);
      }
      Object.assign(state, {
        ...event,
        phase,
        path,
      });
      onStateChange?.(snapshot(phase));

      if (phase === 'discovered') {
        state.current = 0;
        state.completed = 0;
        state.total = Number(event.total || 0);
        console.log(`[supervibe:index] stage=discovery discovered ${state.total} eligible source file(s); progress every ${progressEvery} file(s); heartbeat every ${heartbeatSeconds}s${maxSeconds ? `; bounded max ${maxSeconds}s` : ''}`);
        persistCheckpoint('discovered');
        emitJson('discovered');
        return;
      }

      if (phase === 'done' && typeof event.current !== 'number') {
        state.current = Number(event.total || state.total || 0);
      }

      if (phase && phase !== lastStage && ['selection', 'health', 'resolving-edges', 'bounded-timeout', 'done'].includes(phase)) {
        lastStage = phase;
        if (['selection', 'health', 'bounded-timeout', 'done'].includes(phase)) persistCheckpoint(phase);
        render('stage');
      }

      if (tracePhases && phase && ['file-start', 'reading', 'hashing', 'chunking', 'db-write', 'embeddings', 'fts-write', 'graph-extraction'].includes(phase)) {
        persistCheckpoint(phase);
        emitJson(phase);
      }

      if (phase === 'file') {
        const current = Number(event.current || 0);
        const total = Number(event.total || 0);
        persistCheckpoint('file');
        emitJson('file');
        if (current === total || current - lastLoggedFile >= progressEvery) {
          lastLoggedFile = current;
          render('progress');
        }
      }

      if (phase === 'resolving-edges' && typeof event.current === 'number') {
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
    persistCheckpoint,
    snapshot,
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

function inspectIndexLock({ rootDir, staleHeartbeatMs = 120000 } = {}) {
  const lockPath = join(rootDir, '.supervibe', 'memory', 'code-index.lock');
  const lock = readLock(lockPath);
  if (!lock) {
    return { path: lockPath, present: false, status: 'absent', pidRunning: false, safeToResume: true, action: 'none' };
  }
  const pid = Number(lock.pid);
  const pidRunning = isPidRunning(pid);
  const heartbeatAt = Date.parse(lock.heartbeatAt || '');
  const heartbeatAgeMs = Number.isFinite(heartbeatAt) ? Math.max(0, Date.now() - heartbeatAt) : null;
  const heartbeatStale = heartbeatAgeMs !== null && heartbeatAgeMs > staleHeartbeatMs;
  const stale = !pidRunning || heartbeatStale;
  return {
    path: lockPath,
    present: true,
    status: stale ? 'stale' : 'live',
    pid,
    pidRunning,
    heartbeatAt: lock.heartbeatAt || null,
    heartbeatAgeMs,
    heartbeatStale,
    phase: lock.phase || null,
    activeIndexFile: lock.activeIndexFile || null,
    safeToResume: stale,
    action: 'none',
  };
}

function formatIndexLockStatus(status) {
  return [
    'SUPERVIBE_INDEX_LOCK',
    `PATH: ${status.path}`,
    `STATUS: ${status.status}`,
    `PID: ${status.pid || 'none'}`,
    `PID_RUNNING: ${status.pidRunning ? 'true' : 'false'}`,
    `HEARTBEAT_AT: ${status.heartbeatAt || 'none'}`,
    `HEARTBEAT_AGE_MS: ${status.heartbeatAgeMs ?? 'unknown'}`,
    `PHASE: ${status.phase || 'none'}`,
    `ACTIVE_INDEX_FILE: ${status.activeIndexFile || 'none'}`,
    `ACTION: ${status.action || 'none'}`,
    `SAFE_TO_RESUME: ${status.safeToResume ? 'true' : 'false'}`,
  ].join('\n');
}

function buildKnownFailedMap(report = {}, { ttlSeconds = 0 } = {}) {
  const now = Date.now();
  const ttlMs = Number(ttlSeconds || 0) > 0 ? Number(ttlSeconds) * 1000 : 0;
  const map = new Map();
  for (const item of report.files || []) {
    const relPath = normalizeRelPath(item.path || '');
    if (!relPath) continue;
    if (!['chunking', 'reading', 'hashing', 'graph-extraction', 'file'].includes(String(item.phase || ''))) continue;
    if (ttlMs > 0) {
      const failedAt = Date.parse(item.failedAt || '');
      if (!Number.isFinite(failedAt) || now - failedAt > ttlMs) continue;
    }
    map.set(relPath, item);
  }
  return map;
}

function cleanStaleIndexLock({ rootDir } = {}) {
  const status = inspectIndexLock({ rootDir });
  if (status.present && status.status === 'stale') {
    try {
      unlinkSync(status.path);
      status.action = 'removed';
    } catch (error) {
      status.action = `remove-failed:${error.code || error.message}`;
      status.safeToResume = false;
    }
  }
  return status;
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
        heartbeatAt: new Date().toISOString(),
        root: rootDir,
        command: process.argv.join(' '),
        phase: 'starting',
        activeIndexFile: null,
      }, null, 2));
      closeSync(fd);
      return {
        path: lockPath,
        update(details = {}) {
          const current = readLock(lockPath);
          if (current?.pid !== process.pid) return;
          try {
            writeFileSync(lockPath, JSON.stringify({
              ...current,
              heartbeatAt: new Date().toISOString(),
              phase: details.phase || details.stage || current.phase || 'running',
              activeIndexFile: details.activeIndexFile || current.activeIndexFile || null,
            }, null, 2));
          } catch {}
        },
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
      const inspected = inspectIndexLock({ rootDir });
      if (lock?.pid && inspected.status === 'live') {
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
  selectionLimit = 0,
  prioritizeMissing = false,
  onProgress = null,
  filter = null,
  skipKnownFailed = false,
  knownFailedTtlSeconds = 0,
} = {}) {
  const inventory = applyRepairFilterToInventory(await discoverSourceFiles(rootDir), filter);
  onProgress?.({ phase: 'discovery', total: inventory.files.length });
  const rows = store.db.prepare('SELECT path, content_hash AS contentHash, graph_version AS graphVersion FROM code_files').all();
  const byPath = new Map(rows.map((row) => [row.path, row]));
  const knownFailedByPath = skipKnownFailed
    ? buildKnownFailedMap(await store.readFailedFilesReport(), { ttlSeconds: knownFailedTtlSeconds })
    : new Map();
  const missing = [];
  const stale = [];
  const knownFailedSkipped = [];

  for (const [index, file] of inventory.files.entries()) {
    const row = byPath.get(file.relPath);
    const current = index + 1;
    if (!row) {
      const knownFailed = knownFailedByPath.get(file.relPath);
      if (knownFailed) {
        knownFailedSkipped.push({ ...file, reason: `known-failed-${knownFailed.phase || 'file'}` });
      } else {
        missing.push({ ...file, reason: 'missing-row' });
      }
    }
    if (current % 100 === 0 || current === inventory.files.length) {
      onProgress?.({ phase: 'selection', current, total: inventory.files.length, path: file.relPath });
    }
  }

  if (prioritizeMissing && selectionLimit > 0 && missing.length >= selectionLimit) {
    return {
      inventory,
      files: missing.slice(0, selectionLimit),
      indexedRows: rows.length,
      selectionComplete: false,
      knownMissing: missing.length,
      knownFailedSkipped,
      staleScanSkipped: true,
    };
  }

  const staleBudget = prioritizeMissing && selectionLimit > 0
    ? Math.max(0, selectionLimit - missing.length)
    : 0;
  for (const [index, file] of inventory.files.entries()) {
    const row = byPath.get(file.relPath);
    if (!row) continue;
    const current = index + 1;
    onProgress?.({ phase: 'hashing', current, total: inventory.files.length, path: file.relPath });
    let fileHash = '';
    try { fileHash = await hashFile(file.absPath); } catch {}
    if (fileHash && fileHash !== row.contentHash) {
      stale.push({ ...file, reason: 'content-changed' });
    } else if (includeGraph && Number(row.graphVersion || 0) !== CODE_GRAPH_EXTRACTOR_VERSION) {
      const knownFailed = knownFailedByPath.get(file.relPath);
      if (knownFailed) {
        knownFailedSkipped.push({ ...file, reason: `known-failed-${knownFailed.phase || 'file'}` });
      } else {
        stale.push({ ...file, reason: 'graph-version-stale' });
      }
    }
    if (current % 100 === 0 || current === inventory.files.length) {
      onProgress?.({ phase: 'selection', current, total: inventory.files.length, path: file.relPath });
    }
    if (staleBudget > 0 && stale.length >= staleBudget) {
      return {
        inventory,
        files: [...missing, ...stale],
        indexedRows: rows.length,
        selectionComplete: false,
        knownMissing: missing.length,
        knownFailedSkipped,
        staleScanSkipped: true,
      };
    }
  }

  return {
    inventory,
    files: [...missing, ...stale],
    indexedRows: rows.length,
    selectionComplete: true,
    knownMissing: missing.length,
    knownFailedSkipped,
    staleScanSkipped: false,
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
    `KNOWN_FAILED_SKIPPED: ${report.knownFailedSkipped?.length || 0}`,
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
      'source-only': { type: 'boolean', default: false },
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
      'max-seconds': { type: 'string', default: '' },
      language: { type: 'string', default: '' },
      path: { type: 'string', default: '' },
      file: { type: 'string', default: '' },
      'debug-file': { type: 'string', default: '' },
      'trace-phases': { type: 'boolean', default: false },
      'large-file-threshold-bytes': { type: 'string', default: '' },
      'large-file-threshold-lines': { type: 'string', default: '' },
      'large-file-chunk-lines': { type: 'string', default: '' },
      'large-file-chunk-bytes': { type: 'string', default: '' },
      'large-file-max-seconds': { type: 'string', default: '' },
      'large-file-fallback-mode': { type: 'string', default: '' },
      'known-failed-ttl': { type: 'string', default: '' },
      'explain-policy': { type: 'boolean', default: false },
      'watcher-diagnostics': { type: 'boolean', default: false },
      'clean-stale-lock': { type: 'boolean', default: false },
      verbose: { type: 'boolean', default: false },
      'repo-map': { type: 'boolean', default: false },
      'json-progress': { type: 'boolean', default: false },
      'progress-every': { type: 'string', default: '' },
      'heartbeat-seconds': { type: 'string', default: '' },
    },
    strict: false,
  });

  const sourceOnly = values['source-only'];
  const noEmbeddings = sourceOnly || values['no-embeddings'];
  const rootDir = values.root ? resolve(PROJECT_ROOT, values.root) : PROJECT_ROOT;
  const progressEvery = positiveInt(values['progress-every'] || process.env.SUPERVIBE_INDEX_PROGRESS_EVERY, DEFAULT_INDEX_PROGRESS_EVERY);
  const heartbeatSeconds = nonNegativeInt(values['heartbeat-seconds'] || process.env.SUPERVIBE_INDEX_HEARTBEAT_SECONDS, DEFAULT_HEARTBEAT_SECONDS);
  const maxFiles = nonNegativeInt(values['max-files'], 0);
  const maxSeconds = positiveNumber(values['max-seconds'] || process.env.SUPERVIBE_INDEX_MAX_SECONDS, 0);
  const largeFileOptions = {
    largeFileThresholdBytes: values['large-file-threshold-bytes'] ? positiveInt(values['large-file-threshold-bytes'], undefined) : undefined,
    largeFileThresholdLines: values['large-file-threshold-lines'] ? positiveInt(values['large-file-threshold-lines'], undefined) : undefined,
    largeFileChunkLines: values['large-file-chunk-lines'] ? positiveInt(values['large-file-chunk-lines'], undefined) : undefined,
    largeFileChunkBytes: values['large-file-chunk-bytes'] ? positiveInt(values['large-file-chunk-bytes'], undefined) : undefined,
    largeFileMaxSeconds: values['large-file-max-seconds'] ? nonNegativeInt(values['large-file-max-seconds'], undefined) : undefined,
    largeFileFallbackMode: values['large-file-fallback-mode'] || undefined,
    knownFailedTtl: values['known-failed-ttl'] ? nonNegativeInt(values['known-failed-ttl'], undefined) : undefined,
  };
  const chunkTimeoutMs = process.env.SUPERVIBE_INDEX_CHUNK_TIMEOUT_MS
    ? undefined
    : (maxSeconds > 0 ? Math.max(100, Math.floor(maxSeconds * 1000 * 0.8)) : undefined);
  const graphEnabled = sourceOnly ? false : (values['no-graph'] ? false : (noEmbeddings && !values.graph ? false : true));
  const repairFilter = buildRepairFilter({
    language: values.language,
    path: values.path,
    file: values.file,
    debugFile: values['debug-file'],
  });
  const progress = createProgressLogger({
    rootDir,
    progressEvery,
    heartbeatSeconds,
    jsonProgress: values['json-progress'],
    maxSeconds,
    tracePhases: Boolean(values['trace-phases'] || values['debug-file']),
    onStateChange: (state) => lock?.update?.(state),
  });
  const runStartedAt = Date.now();
  const shouldStop = () => maxSeconds > 0 && Date.now() - runStartedAt >= maxSeconds * 1000;

  if (values['clean-stale-lock']) {
    console.log(formatIndexLockStatus(cleanStaleIndexLock({ rootDir })));
    progress.stop();
    return;
  }

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

  if (values['list-missing']) {
    const diagnosticStore = new CodeStore(rootDir, {
      useEmbeddings: false,
      useGraph: graphEnabled,
      ...largeFileOptions,
    });
    try {
      await diagnosticStore.init();
      const report = await collectMissingOrStaleFiles(diagnosticStore, rootDir, {
        includeGraph: graphEnabled,
        filter: repairFilter,
        onProgress: null,
      });
      console.log(formatMissingList(report, { maxFiles: maxFiles || DEFAULT_LIST_MISSING_LIMIT }));
    } finally {
      diagnosticStore.close();
      progress.stop();
    }
    return;
  }

  let lock = null;
  let store = null;
  let cleanedUp = false;
  let watchdogTimer = null;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (watchdogTimer) clearTimeout(watchdogTimer);
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

  if (maxSeconds > 0) {
    watchdogTimer = setTimeout(() => {
      const snap = progress.snapshot('bounded-timeout');
      progress.onProgress({
        phase: 'bounded-timeout',
        current: snap.processed,
        total: snap.total,
        indexed: snap.indexed,
        skipped: snap.skipped,
        errors: snap.errors,
      });
      const checkpointPath = join(rootDir, '.supervibe', 'memory', 'code-index-checkpoint.json');
      console.log([
        'SUPERVIBE_INDEX_BOUNDED_TIMEOUT',
        `MAX_SECONDS: ${maxSeconds}`,
        `PROCESSED: ${snap.processed}`,
        `TOTAL: ${snap.total || 0}`,
        `CHECKPOINT: ${checkpointPath}`,
        'NEXT: rerun the same command with --resume to continue',
      ].join('\n'));
      console.log(`\nDone in ${maxSeconds.toFixed(1)}s.`);
      console.log(`  Files indexed: ${snap.indexed}`);
      console.log(`  Files skipped (unchanged/unsupported): ${snap.skipped}`);
      console.log(`  Errors: ${snap.errors}`);
      cleanup();
      process.exit(0);
    }, Math.max(1, Math.ceil(maxSeconds * 1000)));
    watchdogTimer.unref?.();
  }

  try {
    lock = acquireIndexLock({ rootDir });

    store = new CodeStore(rootDir, {
      useEmbeddings: !noEmbeddings,
      useGraph: graphEnabled,
      chunkTimeoutMs,
      ...largeFileOptions,
    });
    try {
      await store.init();
    } catch (error) {
      if (!values.migrate) throw error;
      const recovery = recoverCorruptCodeDb({ dbPath: join(rootDir, '.supervibe', 'memory', 'code.db'), rootDir });
      console.log(`Code DB recovery: ${recovery.recovered ? 'recovered' : 'not-needed'}`);
      if (recovery.backupPath) console.log(`  Backup: ${recovery.backupPath}`);
      if (recovery.rebuildCommand) console.log(`  Rebuild: ${recovery.rebuildCommand}`);
      store = new CodeStore(rootDir, { useEmbeddings: !noEmbeddings, useGraph: graphEnabled, chunkTimeoutMs, ...largeFileOptions });
      await store.init();
    }

    let filesToIndex = null;
    let modeLabel = 'full project walk';
    if (values.resume) {
      const report = await collectMissingOrStaleFiles(store, rootDir, {
        includeGraph: graphEnabled,
        selectionLimit: maxFiles,
        prioritizeMissing: maxFiles > 0,
        filter: repairFilter,
        onProgress: progress.onProgress,
        skipKnownFailed: graphEnabled && !sourceOnly && !repairFilter.file,
        knownFailedTtlSeconds: store.knownFailedTtlSeconds,
      });
      const capped = capFiles(report.files, maxFiles);
      filesToIndex = capped.files.map((file) => file.absPath);
      const knownFailedSkipped = report.knownFailedSkipped?.length || 0;
      modeLabel = `resume missing/stale (${filesToIndex.length}/${report.files.length} selected${capped.capped ? `, capped by --max-files=${maxFiles}` : ''}${report.staleScanSkipped ? ', missing-first fast path' : ''}${knownFailedSkipped ? `, known-failed skipped=${knownFailedSkipped}` : ''})`;
      console.log(`[supervibe:index] resume mode: ${report.files.length} missing/stale file(s), ${filesToIndex.length} selected${report.staleScanSkipped ? '; stale scan deferred to next batch' : ''}`);
      if (knownFailedSkipped) {
        console.log(`KNOWN_FAILED_SKIPPED: ${knownFailedSkipped}`);
      }
    } else if (values.since) {
      try {
        const out = execFileSync('git', ['log', '--name-only', '--pretty=format:', `${values.since}..HEAD`], {
          cwd: rootDir,
          encoding: 'utf8',
        });
        const inventory = applyRepairFilterToInventory(await discoverSourceFiles(rootDir), repairFilter);
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
    } else if (maxFiles || repairFilter.active) {
      const inventory = applyRepairFilterToInventory(await discoverSourceFiles(rootDir), repairFilter);
      const capped = capFiles(inventory.files, maxFiles);
      filesToIndex = capped.files.map((file) => file.absPath);
      modeLabel = repairFilter.debugFile
        ? `debug-file ${repairFilter.debugFile}`
        : `batch first ${filesToIndex.length}/${inventory.files.length} eligible file(s)`;
    }

    const modeParts = [];
    if (sourceOnly) modeParts.push('source-only plain text/BM25');
    if (noEmbeddings) modeParts.push('BM25/source-readiness, embeddings disabled');
    if (!graphEnabled) modeParts.push('graph disabled');
    if (values.force) modeParts.push('force refresh');
    if (maxSeconds) modeParts.push(`bounded max ${maxSeconds}s`);
    if (repairFilter.language) modeParts.push(`language=${repairFilter.language}`);
    if (repairFilter.path) modeParts.push(`path=${repairFilter.path}`);
    if (repairFilter.file) modeParts.push(`${repairFilter.debugFile ? 'debug-file' : 'file'}=${repairFilter.file}`);
    console.log(`Indexing code in ${rootDir} (${modeLabel}${modeParts.length ? `; ${modeParts.join('; ')}` : ''})...`);
    console.log(`Workspace namespace: ${createWorkspaceNamespace({ projectRoot: rootDir }).workspaceId}`);
    console.log(`Index lock: ${lock.path}`);
    const t0 = Date.now();

    const counts = filesToIndex
      ? await store.indexFiles(filesToIndex, { onProgress: progress.onProgress, force: values.force, shouldStop, verbose: values.verbose })
      : await store.indexAll(rootDir, { onProgress: progress.onProgress, force: values.force, shouldStop, verbose: values.verbose });

    if (counts.bounded) {
      console.log([
        'SUPERVIBE_INDEX_BOUNDED_TIMEOUT',
        `MAX_SECONDS: ${maxSeconds}`,
        `PROCESSED: ${counts.processed || counts.indexed + counts.skipped + counts.errors}`,
        `TOTAL: ${counts.discovered || counts.total || 0}`,
        `CHECKPOINT: ${join(rootDir, '.supervibe', 'memory', 'code-index-checkpoint.json')}`,
        'NEXT: rerun the same command with --resume to continue',
      ].join('\n'));
    }

    const stats = store.stats();
    const health = values.health && !counts.bounded
      ? await (progress.onProgress({ phase: 'health', current: counts.discovered || counts.indexed + counts.skipped, total: counts.discovered || counts.indexed + counts.skipped }), collectIndexHealthFromStore(store, { rootDir }))
      : null;
    if (values.health && counts.bounded) {
      console.log('SUPERVIBE_INDEX_HEALTH_SKIPPED: bounded run stopped before full health scan; rerun without --max-seconds or continue with --resume');
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\nDone in ${elapsed}s.`);
    console.log(`  Files indexed: ${counts.indexed}`);
    console.log(`  Files skipped (unchanged/unsupported): ${counts.skipped}`);
    console.log(`  Errors: ${counts.errors}`);
    if (counts.errors > 0) {
      console.log(`  Failed files report: ${join(rootDir, '.supervibe', 'memory', 'failed_files.json')}`);
    }
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
