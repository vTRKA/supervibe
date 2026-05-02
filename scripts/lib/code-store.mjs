// SQLite-backed code RAG with hybrid (FTS5 + semantic) search.
// Mirrors MemoryStore but for source code: per-file rows + per-chunk embeddings.
// Hash-based change detection skips unchanged files on re-index.

import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';
import { Worker } from 'node:worker_threads';
import { hashFile } from './file-hash.mjs';
import { chunkCode, detectLanguage, estimateCodeTokens } from './code-chunker.mjs';
import { parseSemanticAnchors } from './supervibe-semantic-anchor-index.mjs';
import { loadNodeSqliteDatabaseSync } from './node-sqlite-runtime.mjs';
import { classifyIndexPath, discoverSourceFiles, isGeneratedPath, looksMinifiedSymbolName, pruneCodeIndex } from './supervibe-index-policy.mjs';
import { applyCodeDbMigrations } from './supervibe-db-migrations.mjs';

export const CODE_GRAPH_EXTRACTOR_VERSION = 3;
const DEFAULT_LARGE_FILE_CHAR_THRESHOLD = 150_000;
const DEFAULT_CHUNK_TIMEOUT_MS = 30_000;
const DEFAULT_LARGE_FILE_THRESHOLD_BYTES = 512 * 1024;
const DEFAULT_LARGE_FILE_THRESHOLD_LINES = 10_000;
const DEFAULT_LARGE_FILE_CHUNK_LINES = 240;
const DEFAULT_LARGE_FILE_CHUNK_BYTES = 64 * 1024;
const DEFAULT_LARGE_FILE_MAX_SECONDS = 30;
const DEFAULT_LARGE_FILE_FALLBACK_MODE = 'structural';
const DEFAULT_KNOWN_FAILED_TTL_SECONDS = 24 * 60 * 60;

const EXTENSION_RESOLUTION = {
  typescript: ['.ts', '.tsx', '.d.ts', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'],
  tsx: ['.tsx', '.ts', '.d.ts', '.js', '.jsx', '/index.tsx', '/index.ts', '/index.js', '/index.jsx'],
  javascript: ['.js', '.jsx', '.mjs', '.cjs', '/index.js', '/index.jsx'],
  jsx: ['.jsx', '.js', '/index.jsx', '/index.js'],
  python: ['.py', '/__init__.py'],
  go: ['.go'],
  php: ['.php'],
  ruby: ['.rb'],
  java: ['.java'],
  rust: ['.rs', '/mod.rs'],
};

const JS_LIKE_LANGUAGES = new Set(['typescript', 'tsx', 'javascript', 'jsx']);
let embeddingsModulePromise = null;

async function loadEmbeddingHelpers() {
  embeddingsModulePromise ||= (async () => await import('./embeddings.mjs'))();
  return embeddingsModulePromise;
}

function normalizeRelPath(path) {
  return String(path || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function positiveInt(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.trunc(num) : fallback;
}

function nonNegativeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

function resolveImportSource(importSource, fromRelPath, language, fileSet) {
  if (!importSource || isExternalImportSource(importSource, language)) return null;
  const candidates = [];
  const fromDir = dirname(fromRelPath);
  const base = importSource.startsWith('.')
    ? normalizeRelPath(relative('.', resolve(fromDir, importSource)))
    : resolveAliasedImportSource(importSource);
  if (!base) return null;

  candidates.push(base);
  for (const suffix of EXTENSION_RESOLUTION[language] || []) {
    candidates.push(`${base}${suffix}`);
  }
  for (const candidate of candidates.map(normalizeRelPath)) {
    if (fileSet.has(candidate)) return candidate;
  }
  return null;
}

function resolveAliasedImportSource(importSource) {
  const aliases = [
    ['@/', 'src/'],
    ['~/', 'src/'],
    ['@src/', 'src/'],
    ['src/', 'src/'],
    ['@app/', 'app/'],
    ['app/', 'app/'],
  ];
  for (const [prefix, replacement] of aliases) {
    if (importSource.startsWith(prefix)) return importSource.replace(prefix, replacement);
  }
  return importSource.includes('/') ? importSource : null;
}

function isExternalImportSource(importSource, language) {
  if (importSource.startsWith('.')) return false;
  if (JS_LIKE_LANGUAGES.has(language)) {
    if (importSource.startsWith('@/') || importSource.startsWith('~/') || importSource.startsWith('@src/') || importSource.startsWith('src/') || importSource.startsWith('@app/') || importSource.startsWith('app/')) {
      return false;
    }
    return true;
  }
  if (language === 'python') {
    return !importSource.startsWith('.') && !importSource.includes('.') && !importSource.includes('/');
  }
  return false;
}

function buildImportMapForFile({ content, relPath, language, fileSet }) {
  const mappings = new Map();
  if (!content) return mappings;
  const add = ({ localName, exportedName = localName, source }) => {
    if (!localName || !source) return;
    const sourceFile = resolveImportSource(source, relPath, language, fileSet);
    if (!sourceFile) return;
    const existing = mappings.get(localName) || [];
    existing.push({ localName, exportedName, source, sourceFile });
    mappings.set(localName, existing);
  };

  if (JS_LIKE_LANGUAGES.has(language)) {
    const importRe = /import\s+(?:type\s+)?(?:(\w+)\s*,?\s*)?(?:\{([^}]+)\})?\s*(?:\*\s+as\s+(\w+)\s*)?from\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRe.exec(content)) !== null) {
      const [, defaultImport, namedImports, namespaceImport, source] = match;
      if (defaultImport) add({ localName: defaultImport, exportedName: 'default', source });
      if (namespaceImport) add({ localName: namespaceImport, exportedName: '*', source });
      if (namedImports) {
        for (const rawName of namedImports.split(',')) {
          const part = rawName.trim().replace(/^type\s+/, '');
          if (!part) continue;
          const alias = part.match(/^(\w+)\s+as\s+(\w+)$/);
          add({
            localName: alias ? alias[2] : part,
            exportedName: alias ? alias[1] : part,
            source,
          });
        }
      }
    }
    const requireRe = /(?:const|let|var)\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\)/g;
    while ((match = requireRe.exec(content)) !== null) {
      add({ localName: match[1], exportedName: 'default', source: match[2] });
    }
  } else if (language === 'python') {
    const fromImportRe = /^\s*from\s+([.\w]+)\s+import\s+(.+)$/gm;
    let match;
    while ((match = fromImportRe.exec(content)) !== null) {
      const [, moduleName, names] = match;
      for (const rawName of names.split(',')) {
        const part = rawName.trim();
        const alias = part.match(/^(\w+)\s+as\s+(\w+)$/);
        add({
          localName: alias ? alias[2] : part,
          exportedName: alias ? alias[1] : part,
          source: pythonModuleToPath(moduleName, relPath),
        });
      }
    }
  } else if (language === 'rust') {
    const useRe = /^\s*use\s+([^;]+);/gm;
    let match;
    while ((match = useRe.exec(content)) !== null) {
      for (const entry of parseRustUseEntries(match[1], relPath)) {
        add(entry);
      }
    }
  } else if (language === 'php') {
    const useRe = /^\s*use\s+([^;]+);/gm;
    let match;
    while ((match = useRe.exec(content)) !== null) {
      const full = match[1].trim();
      const alias = full.match(/\s+as\s+(\w+)$/i);
      const clean = full.replace(/\s+as\s+\w+$/i, '');
      const localName = alias ? alias[1] : clean.split('\\').pop();
      const source = clean.replace(/\\/g, '/');
      add({ localName, exportedName: localName, source: `${source}.php` });
    }
  }

  return mappings;
}

function parseRustUseEntries(rawUse, fromRelPath) {
  const text = String(rawUse || '').trim();
  if (!text) return [];
  const entries = [];
  const brace = text.match(/^(.*)::\{(.+)\}$/s);
  if (brace) {
    const prefix = brace[1].trim();
    const names = brace[2].split(',').map((part) => part.trim()).filter(Boolean);
    for (const namePart of names) {
      if (namePart === 'self' || namePart === '*') continue;
      const alias = namePart.match(/^(\w+)\s+as\s+(\w+)$/);
      const exportedName = alias ? alias[1] : namePart;
      const localName = alias ? alias[2] : namePart;
      const source = rustModuleToPath(prefix, fromRelPath);
      if (source) entries.push({ localName, exportedName, source });
    }
    return entries;
  }

  const alias = text.match(/^(.*)::(\w+)\s+as\s+(\w+)$/);
  if (alias) {
    const source = rustModuleToPath(alias[1], fromRelPath);
    if (source) entries.push({ localName: alias[3], exportedName: alias[2], source });
    return entries;
  }

  const simple = text.match(/^(.*)::(\w+)$/);
  if (simple) {
    const source = rustModuleToPath(simple[1], fromRelPath);
    if (source) entries.push({ localName: simple[2], exportedName: simple[2], source });
    return entries;
  }

  return entries;
}

function rustModuleToPath(moduleName, fromRelPath) {
  const parts = String(moduleName || '').split('::').filter(Boolean);
  if (parts.length === 0) return null;
  const relParts = normalizeRelPath(fromRelPath).split('/').filter(Boolean);
  const fileDir = dirname(fromRelPath);
  const head = parts[0];

  if (head === 'crate') {
    const srcIndex = relParts.lastIndexOf('src');
    const crateRoot = srcIndex >= 0 ? relParts.slice(0, srcIndex + 1).join('/') : fileDir;
    const rest = parts.slice(1);
    return normalizeRelPath([crateRoot, ...rest].filter(Boolean).join('/'));
  }

  if (head === 'self') {
    return normalizeRelPath([fileDir, ...parts.slice(1)].filter(Boolean).join('/'));
  }

  if (head === 'super') {
    let base = fileDir;
    let index = 0;
    while (parts[index] === 'super') {
      base = dirname(base);
      index += 1;
    }
    return normalizeRelPath([base, ...parts.slice(index)].filter(Boolean).join('/'));
  }

  return normalizeRelPath([fileDir, ...parts].filter(Boolean).join('/'));
}

function pythonModuleToPath(moduleName, fromRelPath) {
  const dots = moduleName.match(/^\.+/)?.[0]?.length || 0;
  const clean = moduleName.replace(/^\.+/, '').replace(/\./g, '/');
  if (dots === 0) return clean;
  let base = dirname(fromRelPath);
  for (let i = 1; i < dots; i++) base = dirname(base);
  return clean ? `${base}/${clean}` : base;
}

function selectBestEdgeTarget({ edge, candidates, importMap, fromLanguage, langByFile }) {
  if (candidates.length === 1) return candidates[0];
  const imports = importMap.get(edge.toName) || [];
  const fromDir = dirname(edge.fromPath);
  const scored = candidates.map((candidate) => {
    let score = 0;
    if (candidate.path === edge.fromPath) score += 100;
    const imported = imports.find((entry) =>
      entry.sourceFile === candidate.path &&
      (entry.exportedName === candidate.name || entry.localName === candidate.name || entry.exportedName === 'default' || entry.exportedName === '*')
    );
    if (imported) score += 90;
    if (dirname(candidate.path) === fromDir) score += 25;
    if (langByFile.get(candidate.path) === fromLanguage) score += 10;
    if (edge.edgeKind === 'calls' && ['function', 'method'].includes(candidate.kind)) score += 20;
    if (edge.edgeKind === 'references' && ['component', 'function', 'class'].includes(candidate.kind)) score += 20;
    if (['extends', 'implements'].includes(edge.edgeKind) && ['class', 'interface', 'type', 'trait', 'struct'].includes(candidate.kind)) score += 20;
    return { candidate, score };
  }).sort((a, b) => b.score - a.score || a.candidate.path.localeCompare(b.candidate.path));

  const [best, second] = scored;
  if (!best) return null;
  if (best.score >= 80 && (!second || best.score > second.score)) return best.candidate;
  if (best.score >= 45 && (!second || best.score - second.score >= 20)) return best.candidate;
  return null;
}

function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((row) => row.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function deadlineExceededError(phase, relPath) {
  const error = new Error(`index deadline exceeded during ${phase}${relPath ? ` for ${relPath}` : ''}`);
  error.code = 'SUPERVIBE_INDEX_DEADLINE_EXCEEDED';
  error.phase = phase;
  error.relPath = relPath;
  return error;
}

async function maybeTestPhaseHook(phase) {
  if (process.env.SUPERVIBE_INDEX_TEST_THROW_PHASE === phase) {
    throw new Error(`SUPERVIBE_INDEX_TEST_THROW_PHASE ${phase}`);
  }
  if (process.env.SUPERVIBE_INDEX_TEST_DELAY_PHASE === phase) {
    const delayMs = Number(process.env.SUPERVIBE_INDEX_TEST_DELAY_MS || 0);
    if (Number.isFinite(delayMs) && delayMs > 0) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
    }
  }
}

function fileTimeoutError({ phase, relPath, timeoutMs }) {
  const error = new Error(`${phase} timed out after ${timeoutMs}ms for ${relPath}`);
  error.code = 'SUPERVIBE_INDEX_FILE_TIMEOUT';
  error.phase = phase;
  error.relPath = relPath;
  error.timeoutMs = timeoutMs;
  return error;
}

async function chunkCodeInWorker(code, absPath, { options, timeoutMs, relPath } = {}) {
  return await new Promise((resolveWorker, rejectWorker) => {
    const worker = new Worker(new URL('./code-chunk-worker.mjs', import.meta.url), {
      workerData: { code, filePath: absPath, options },
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      worker.terminate().catch(() => {});
      rejectWorker(fileTimeoutError({ phase: 'chunking', relPath, timeoutMs }));
    }, timeoutMs);

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    worker.once('message', (message) => {
      if (message?.ok) {
        finish(resolveWorker, message.chunks || []);
        return;
      }
      const err = new Error(message?.error?.message || 'chunk worker failed');
      err.name = message?.error?.name || 'Error';
      err.code = message?.error?.code || 'SUPERVIBE_INDEX_CHUNK_WORKER_FAILED';
      err.phase = 'chunking';
      err.relPath = relPath;
      if (message?.error?.stack) err.stack = message.error.stack;
      finish(rejectWorker, err);
    });
    worker.once('error', (error) => {
      error.phase ||= 'chunking';
      error.relPath ||= relPath;
      finish(rejectWorker, error);
    });
    worker.once('exit', (code) => {
      if (settled || code === 0) return;
      const error = new Error(`chunk worker exited with code ${code}`);
      error.code = 'SUPERVIBE_INDEX_CHUNK_WORKER_EXIT';
      error.phase = 'chunking';
      error.relPath = relPath;
      finish(rejectWorker, error);
    });
  });
}

function rustStructuralBoundary(line = '') {
  const text = String(line || '');
  const patterns = [
    { kind: 'module', re: /^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_]\w*)\b/ },
    { kind: 'macro', re: /^\s*macro_rules!\s+([A-Za-z_]\w*)\b/ },
    { kind: 'function-or-class', re: /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)\b/ },
    { kind: 'function-or-class', re: /^\s*(?:pub(?:\([^)]*\))?\s+)?struct\s+([A-Za-z_]\w*)\b/ },
    { kind: 'function-or-class', re: /^\s*(?:pub(?:\([^)]*\))?\s+)?enum\s+([A-Za-z_]\w*)\b/ },
    { kind: 'function-or-class', re: /^\s*(?:pub(?:\([^)]*\))?\s+)?trait\s+([A-Za-z_]\w*)\b/ },
    { kind: 'function-or-class', re: /^\s*(?:pub(?:\([^)]*\))?\s+)?impl(?:\s*<[^>]+>)?\s+([A-Za-z_]\w*)?/ },
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern.re);
    if (match) return { kind: pattern.kind, name: match[1] || null };
  }
  return null;
}

function lineCountOf(content = '') {
  return String(content || '').split('\n').length;
}

function partialIndexError({ relPath, reason = 'large file source indexing stopped before EOF', timeoutMs = 0 } = {}) {
  const error = new Error(reason);
  error.code = 'SUPERVIBE_INDEX_PARTIAL_FILE';
  error.phase = 'chunking';
  error.relPath = relPath;
  error.timeoutMs = timeoutMs;
  return error;
}

function recommendedLargeFileAction(status) {
  if (status === 'partial-row') {
    return 'source row is partial; rerun source-only repair to complete it, or lower chunk size if the file repeatedly times out';
  }
  return 'rerun source-only repair after resolving the file-specific failure';
}

export class CodeStore {
  constructor(projectRoot, opts = {}) {
    this.projectRoot = projectRoot;
    this.dbDir = join(projectRoot, '.supervibe', 'memory');
    this.dbPath = join(this.dbDir, 'code.db');
    this.failedFilesPath = join(this.dbDir, 'failed_files.json');
    this.db = null;
    this.useEmbeddings = opts.useEmbeddings !== false;
    this.useGraph = opts.useGraph !== false;
    this.largeFileCharThreshold = positiveInt(
      opts.largeFileCharThreshold ?? process.env.SUPERVIBE_INDEX_LARGE_FILE_BYTES,
      DEFAULT_LARGE_FILE_CHAR_THRESHOLD,
    );
    this.largeFileThresholdBytes = positiveInt(
      opts.largeFileThresholdBytes
        ?? process.env.SUPERVIBE_INDEX_LARGE_FILE_THRESHOLD_BYTES
        ?? process.env.SUPERVIBE_INDEX_LARGE_FILE_BYTES,
      DEFAULT_LARGE_FILE_THRESHOLD_BYTES,
    );
    this.largeFileThresholdLines = positiveInt(
      opts.largeFileThresholdLines ?? process.env.SUPERVIBE_INDEX_LARGE_FILE_THRESHOLD_LINES,
      DEFAULT_LARGE_FILE_THRESHOLD_LINES,
    );
    this.largeFileChunkLines = positiveInt(
      opts.largeFileChunkLines ?? process.env.SUPERVIBE_INDEX_LARGE_FILE_CHUNK_LINES,
      DEFAULT_LARGE_FILE_CHUNK_LINES,
    );
    this.largeFileChunkBytes = positiveInt(
      opts.largeFileChunkBytes ?? process.env.SUPERVIBE_INDEX_LARGE_FILE_CHUNK_BYTES,
      DEFAULT_LARGE_FILE_CHUNK_BYTES,
    );
    this.largeFileMaxSeconds = nonNegativeNumber(
      opts.largeFileMaxSeconds ?? process.env.SUPERVIBE_INDEX_LARGE_FILE_MAX_SECONDS,
      DEFAULT_LARGE_FILE_MAX_SECONDS,
    );
    this.largeFileFallbackMode = String(
      opts.largeFileFallbackMode ?? process.env.SUPERVIBE_INDEX_LARGE_FILE_FALLBACK_MODE ?? DEFAULT_LARGE_FILE_FALLBACK_MODE,
    ).trim() || DEFAULT_LARGE_FILE_FALLBACK_MODE;
    this.knownFailedTtlSeconds = nonNegativeNumber(
      opts.knownFailedTtl ?? opts.knownFailedTtlSeconds ?? process.env.SUPERVIBE_INDEX_KNOWN_FAILED_TTL_SECONDS,
      DEFAULT_KNOWN_FAILED_TTL_SECONDS,
    );
    this.chunkTimeoutMs = positiveInt(
      opts.chunkTimeoutMs ?? process.env.SUPERVIBE_INDEX_CHUNK_TIMEOUT_MS,
      DEFAULT_CHUNK_TIMEOUT_MS,
    );
  }

  async init() {
    if (!existsSync(this.dbDir)) {
      await mkdir(this.dbDir, { recursive: true });
    }
    const DatabaseSync = await loadNodeSqliteDatabaseSync('Code RAG and code graph');
    this.db = new DatabaseSync(this.dbPath);
    // WAL mode: allow concurrent readers + one writer (e.g. watcher + manual code:index)
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;');
    applyCodeDbMigrations(this.db, { dbPath: this.dbPath });
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS code_files (
        path TEXT PRIMARY KEY,
        language TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        line_count INTEGER NOT NULL,
        indexed_at TEXT NOT NULL,
        graph_version INTEGER NOT NULL DEFAULT 0,
        index_status TEXT NOT NULL DEFAULT 'full',
        chunking_strategy TEXT NOT NULL DEFAULT 'standard',
        chunk_count INTEGER NOT NULL DEFAULT 0,
        indexed_bytes INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_code_files_lang ON code_files(language);

      CREATE TABLE IF NOT EXISTS code_chunks (
        path TEXT NOT NULL,
        chunk_idx INTEGER NOT NULL,
        chunk_text TEXT NOT NULL,
        kind TEXT NOT NULL,
        name TEXT,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        token_count INTEGER NOT NULL,
        embedding BLOB,
        PRIMARY KEY(path, chunk_idx),
        FOREIGN KEY(path) REFERENCES code_files(path) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_code_chunks_path ON code_chunks(path);
      CREATE INDEX IF NOT EXISTS idx_code_chunks_kind ON code_chunks(kind);

      CREATE VIRTUAL TABLE IF NOT EXISTS code_chunks_fts USING fts5(
        path UNINDEXED,
        chunk_idx UNINDEXED,
        chunk_text,
        name,
        tokenize='unicode61'
      );

      -- Code graph: symbols + edges (Phase D)
      CREATE TABLE IF NOT EXISTS code_symbols (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        parent_id TEXT,
        signature TEXT,
        FOREIGN KEY(path) REFERENCES code_files(path) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_sym_path ON code_symbols(path);
      CREATE INDEX IF NOT EXISTS idx_sym_name ON code_symbols(name);
      CREATE INDEX IF NOT EXISTS idx_sym_kind ON code_symbols(kind);
      CREATE INDEX IF NOT EXISTS idx_sym_parent ON code_symbols(parent_id);

      CREATE TABLE IF NOT EXISTS code_edges (
        from_id TEXT NOT NULL,
        to_id TEXT,
        to_name TEXT NOT NULL,
        kind TEXT NOT NULL,
        FOREIGN KEY(from_id) REFERENCES code_symbols(id) ON DELETE CASCADE
      );
      -- Uniqueness across (from, target-name, kind, optional resolved id):
      -- expressions in PRIMARY KEY are SQLite-forbidden, but allowed in UNIQUE INDEX.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_edges_uniq
        ON code_edges(from_id, to_name, kind, COALESCE(to_id, ''));
      CREATE INDEX IF NOT EXISTS idx_edge_to_name ON code_edges(to_name);
      CREATE INDEX IF NOT EXISTS idx_edge_to_id ON code_edges(to_id);
      CREATE INDEX IF NOT EXISTS idx_edge_kind ON code_edges(kind);

      CREATE TABLE IF NOT EXISTS code_semantic_anchors (
        anchor_id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        symbol_name TEXT,
        visibility TEXT NOT NULL,
        responsibility TEXT,
        invariants_json TEXT NOT NULL,
        verification_refs_json TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        source TEXT NOT NULL,
        FOREIGN KEY(path) REFERENCES code_files(path) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_anchor_path ON code_semantic_anchors(path);
      CREATE INDEX IF NOT EXISTS idx_anchor_symbol ON code_semantic_anchors(symbol_name);
    `);
    ensureColumn(this.db, "code_files", "graph_version", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn(this.db, "code_files", "index_status", "TEXT NOT NULL DEFAULT 'full'");
    ensureColumn(this.db, "code_files", "chunking_strategy", "TEXT NOT NULL DEFAULT 'standard'");
    ensureColumn(this.db, "code_files", "chunk_count", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn(this.db, "code_files", "indexed_bytes", "INTEGER NOT NULL DEFAULT 0");
    return this;
  }

  close() {
    if (this.db) { this.db.close(); this.db = null; }
  }

  toRel(absPath) {
    return relative(this.projectRoot, absPath).split(sep).join('/');
  }

  /** Index a single file. Skips if hash unchanged (idempotent). */
  async indexFile(absPath, { force = false, onProgress = null, current = 0, total = 0, shouldStop = null } = {}) {
    const policy = classifyIndexPath(absPath, { rootDir: this.projectRoot });
    if (!policy.included) return { skipped: policy.reason };
    const lang = policy.language || detectLanguage(absPath);
    const relPath = this.toRel(absPath);
    let activePhase = 'file-start';
    const emit = (phase, extra = {}) => onProgress?.({
      phase,
      current,
      total,
      path: relPath,
      ...extra,
    });
    const enter = async (phase, extra = {}) => {
      activePhase = phase;
      if (shouldStop?.()) throw deadlineExceededError(phase, relPath);
      emit(phase, extra);
      await maybeTestPhaseHook(phase);
      if (shouldStop?.()) throw deadlineExceededError(phase, relPath);
    };

    try {
      let fileStats;
      await enter('reading');
      try { fileStats = await stat(absPath); }
      catch (err) {
        if (err.code === 'ENOENT') {
          await this.removeFile(absPath);
          return { skipped: 'file-deleted' };
        }
        throw err;
      }

      await enter('hashing');
      const hash = await hashFile(absPath);
      const existing = this.db.prepare('SELECT content_hash, graph_version FROM code_files WHERE path = ?').get(relPath);
      const graphStale = this.useGraph && Number(existing?.graph_version || 0) !== CODE_GRAPH_EXTRACTOR_VERSION;
      if (existing && existing.content_hash === hash && !force && !graphStale) {
        return { skipped: 'unchanged' };
      }

      const largeByBytes = Number(fileStats?.size || 0) >= this.largeFileThresholdBytes;
      let content = null;
      let lines = 0;
      let largeByLines = false;

      if (!largeByBytes || (existing && existing.content_hash === hash && !force && graphStale)) {
        try { content = await readFile(absPath, 'utf8'); }
        catch (err) {
          if (err.code === 'ENOENT') {
            await this.removeFile(absPath);
            return { skipped: 'file-deleted' };
          }
          throw err;
        }
        lines = lineCountOf(content);
        largeByLines = lines >= this.largeFileThresholdLines;
      }

      if (existing && existing.content_hash === hash && !force) {
        // Hash unchanged, but extractor/query semantics may have changed across
        // plugin versions. Rebuild only graph rows while preserving RAG chunks.
        if (graphStale) {
          try {
            await enter('graph-extraction');
            const result = await this.indexGraphFor(absPath, content ?? await readFile(absPath, 'utf8'));
            this.markGraphCurrent(relPath);
            return { skipped: 'unchanged-graph-reindexed', ...result };
          } catch (err) {
            if (process.env.SUPERVIBE_VERBOSE === '1') {
              console.warn(`[code-graph] failed to reindex unchanged ${relPath}: ${err.message}`);
            }
          }
        }
        return { skipped: 'unchanged' };
      }

      const largeFile = largeByBytes || largeByLines;
      if (largeFile) {
        const result = await this.indexLargeFileSource(absPath, {
          relPath,
          lang,
          hash,
          fileSizeBytes: Number(fileStats?.size || 0),
          initialLineCount: lines,
          emit,
          enter,
          shouldStop,
        });

        if (this.useGraph && !result.partial) {
          try {
            await enter('graph-extraction');
            await this.indexGraphFor(absPath, content ?? await readFile(absPath, 'utf8'));
            this.markGraphCurrent(relPath);
          } catch (err) {
            if (process.env.SUPERVIBE_VERBOSE === '1') {
              console.warn(`[code-graph] failed for ${relPath}: ${err.message}`);
            }
          }
        } else if (!this.useGraph) {
          this.clearGraphFor(relPath);
        }
        return result;
      }

      if (content === null) {
        try { content = await readFile(absPath, 'utf8'); }
        catch (err) {
          if (err.code === 'ENOENT') {
            await this.removeFile(absPath);
            return { skipped: 'file-deleted' };
          }
          throw err;
        }
        lines = lineCountOf(content);
      }

      this.db.prepare('DELETE FROM code_chunks WHERE path = ?').run(relPath);
      this.db.prepare('DELETE FROM code_chunks_fts WHERE path = ?').run(relPath);

      const chunkerMode = !this.useEmbeddings || content.length > this.largeFileCharThreshold ? 'approximate' : 'exact';
      await enter('chunking', { chunkerMode });
      const chunkOptions = {
        tokenMode: chunkerMode,
        largeFileCharThreshold: this.largeFileCharThreshold,
        shouldStop,
      };
      let chunks;
      try {
        chunks = content.length > this.largeFileCharThreshold
          ? await chunkCodeInWorker(content, absPath, {
              options: {
                tokenMode: chunkerMode,
                largeFileCharThreshold: this.largeFileCharThreshold,
              },
              timeoutMs: this.chunkTimeoutMs,
              relPath,
            })
          : await chunkCode(content, absPath, chunkOptions);
      } catch (err) {
        err.indexMetadata ||= {
          status: 'missing-row',
          sizeBytes: Number(fileStats?.size || Buffer.byteLength(content, 'utf8')),
          lineCount: lines,
          lineCountIsPartial: false,
          chunkingStrategy: chunkerMode,
          timeoutMs: err.timeoutMs || (err.code === 'SUPERVIBE_INDEX_FILE_TIMEOUT' ? this.chunkTimeoutMs : 0),
          chunksWritten: 0,
          recommendedAction: recommendedLargeFileAction('missing-row'),
        };
        throw err;
      }

      await enter('db-write');
      this.db.prepare(`
        INSERT OR REPLACE INTO code_files (
          path, language, content_hash, line_count, indexed_at, graph_version,
          index_status, chunking_strategy, chunk_count, indexed_bytes
        )
        VALUES (?, ?, ?, ?, datetime('now'), 0, 'full', ?, ?, ?)
      `).run(relPath, lang, hash, lines, chunkerMode, chunks.length, Number(fileStats?.size || Buffer.byteLength(content, 'utf8')));

      const insertChunk = this.db.prepare(`
        INSERT INTO code_chunks (path, chunk_idx, chunk_text, kind, name, start_line, end_line, token_count, embedding)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertFTS = this.db.prepare(`
        INSERT INTO code_chunks_fts (path, chunk_idx, chunk_text, name) VALUES (?, ?, ?, ?)
      `);

      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        let embeddingBuf = null;
        if (this.useEmbeddings) {
          await enter('embeddings', { chunk: i + 1, chunks: chunks.length });
          try {
            const { embed, vectorToBuffer } = await loadEmbeddingHelpers();
            const vec = await embed(c.text, 'passage');
            embeddingBuf = vectorToBuffer(vec);
          } catch {}
        }
        insertChunk.run(relPath, i, c.text, c.kind, c.name || null, c.startLine, c.endLine, c.tokens || 0, embeddingBuf);
        await enter('fts-write', { chunk: i + 1, chunks: chunks.length });
        insertFTS.run(relPath, i, c.text, c.name || '');
      }

      // Phase D: also extract code graph (symbols + edges) for this file.
      // Failure here is non-fatal — graph stays empty for this file, semantic RAG still works.
      if (this.useGraph) {
        try {
          await enter('graph-extraction');
          await this.indexGraphFor(absPath, content);
          this.markGraphCurrent(relPath);
        } catch (err) {
          if (process.env.SUPERVIBE_VERBOSE === '1') {
            console.warn(`[code-graph] failed for ${relPath}: ${err.message}`);
          }
        }
      } else {
        this.clearGraphFor(relPath);
      }

      return { indexed: true, chunks: chunks.length };
    } catch (err) {
      err.phase ||= activePhase;
      err.relPath ||= relPath;
      throw err;
    }
  }

  async indexLargeFileSource(absPath, {
    relPath,
    lang,
    hash,
    fileSizeBytes = 0,
    initialLineCount = 0,
    emit = null,
    enter = null,
    shouldStop = null,
  } = {}) {
    const structuralRust = lang === 'rust' && this.largeFileFallbackMode !== 'line-window';
    const chunkingStrategy = structuralRust ? 'large-file-rust-structural' : 'large-file-line-window';
    const deadlineMs = this.largeFileMaxSeconds > 0 ? this.largeFileMaxSeconds * 1000 : 0;
    const deadlineAt = deadlineMs > 0 ? Date.now() + deadlineMs : 0;
    let chunkIndex = 0;
    let lineNo = 0;
    let bytesScanned = 0;
    let currentLines = [];
    let currentStartLine = 1;
    let currentBytes = 0;
    let currentKind = 'block';
    let currentName = null;
    let partialError = null;

    await enter?.('chunking', {
      chunkerMode: 'large-file',
      chunkingStrategy,
      timeoutMs: deadlineMs,
    });

    this.db.prepare('DELETE FROM code_chunks WHERE path = ?').run(relPath);
    this.db.prepare('DELETE FROM code_chunks_fts WHERE path = ?').run(relPath);
    this.clearGraphFor(relPath);

    await enter?.('db-write', {
      chunkerMode: 'large-file',
      chunkingStrategy,
      indexStatus: 'partial',
    });
    this.db.prepare(`
      INSERT OR REPLACE INTO code_files (
        path, language, content_hash, line_count, indexed_at, graph_version,
        index_status, chunking_strategy, chunk_count, indexed_bytes
      )
      VALUES (?, ?, ?, ?, datetime('now'), 0, 'partial', ?, 0, 0)
    `).run(relPath, lang, hash, initialLineCount || 0, chunkingStrategy);

    const insertChunk = this.db.prepare(`
      INSERT INTO code_chunks (path, chunk_idx, chunk_text, kind, name, start_line, end_line, token_count, embedding)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertFTS = this.db.prepare(`
      INSERT INTO code_chunks_fts (path, chunk_idx, chunk_text, name) VALUES (?, ?, ?, ?)
    `);
    const updateFileProgress = this.db.prepare(`
      UPDATE code_files
      SET line_count = ?, chunk_count = ?, indexed_bytes = ?, index_status = ?, indexed_at = datetime('now')
      WHERE path = ?
    `);

    const failPartial = (reason, timeoutMs = 0) => {
      const error = partialIndexError({ relPath, reason, timeoutMs });
      error.indexMetadata = {
        status: 'partial-row',
        sizeBytes: fileSizeBytes,
        lineCount: lineNo,
        lineCountIsPartial: true,
        bytesScanned,
        chunkingStrategy,
        timeoutMs,
        chunksWritten: chunkIndex,
        recommendedAction: recommendedLargeFileAction('partial-row'),
      };
      return error;
    };

    const flush = () => {
      const chunkText = currentLines.join('\n').trim();
      if (!chunkText) {
        currentLines = [];
        currentBytes = 0;
        currentStartLine = lineNo + 1;
        currentKind = 'block';
        currentName = null;
        return;
      }
      const endLine = currentStartLine + currentLines.length - 1;
      insertChunk.run(
        relPath,
        chunkIndex,
        chunkText,
        currentKind,
        currentName,
        currentStartLine,
        endLine,
        estimateCodeTokens(chunkText),
        null,
      );
      insertFTS.run(relPath, chunkIndex, chunkText, currentName || '');
      chunkIndex += 1;
      updateFileProgress.run(lineNo, chunkIndex, bytesScanned, 'partial', relPath);
      emit?.('fts-write', {
        chunk: chunkIndex,
        chunks: null,
        chunkerMode: 'large-file',
        chunkingStrategy,
        indexStatus: 'partial',
      });

      const stopAfter = Number(process.env.SUPERVIBE_INDEX_TEST_LARGE_FILE_STOP_AFTER_CHUNKS || 0);
      if (Number.isFinite(stopAfter) && stopAfter > 0 && chunkIndex >= stopAfter) {
        throw failPartial(`test hook stopped large-file chunking after ${chunkIndex} chunk(s)`);
      }

      currentLines = [];
      currentBytes = 0;
      currentStartLine = lineNo + 1;
      currentKind = 'block';
      currentName = null;
    };

    try {
      const input = createReadStream(absPath, { encoding: 'utf8' });
      const lines = createInterface({ input, crlfDelay: Infinity });
      for await (const line of lines) {
        lineNo += 1;
        bytesScanned += Buffer.byteLength(line, 'utf8') + 1;

        if (shouldStop?.()) {
          throw failPartial('global index deadline reached during large-file chunking');
        }
        if (deadlineAt > 0 && Date.now() >= deadlineAt) {
          throw failPartial(`large-file chunking timed out after ${deadlineMs}ms`, deadlineMs);
        }

        const boundary = structuralRust ? rustStructuralBoundary(line) : null;
        if (boundary && currentLines.length > 0) {
          flush();
        }
        if (currentLines.length === 0) {
          currentStartLine = lineNo;
          currentKind = boundary?.kind || 'block';
          currentName = boundary?.name || null;
        } else if (boundary && !currentName) {
          currentKind = boundary.kind;
          currentName = boundary.name;
        }

        currentLines.push(line);
        currentBytes += Buffer.byteLength(line, 'utf8') + 1;

        if (currentLines.length >= this.largeFileChunkLines || currentBytes >= this.largeFileChunkBytes) {
          flush();
        }
      }
      flush();
    } catch (error) {
      partialError = error;
    }

    if (partialError) {
      if (chunkIndex === 0) {
        partialError.indexMetadata ||= {
          status: 'missing-row',
          sizeBytes: fileSizeBytes,
          lineCount: lineNo,
          lineCountIsPartial: true,
          bytesScanned,
          chunkingStrategy,
          timeoutMs: partialError.timeoutMs || deadlineMs,
          chunksWritten: 0,
          recommendedAction: recommendedLargeFileAction('missing-row'),
        };
        throw partialError;
      }
      updateFileProgress.run(lineNo, chunkIndex, bytesScanned, 'partial', relPath);
      return {
        indexed: true,
        partial: true,
        chunks: chunkIndex,
        phase: 'chunking',
        error: partialError,
        failureMetadata: {
          status: 'partial-row',
          sizeBytes: fileSizeBytes,
          lineCount: lineNo,
          lineCountIsPartial: true,
          bytesScanned,
          chunkingStrategy,
          timeoutMs: partialError.timeoutMs || 0,
          chunksWritten: chunkIndex,
          recommendedAction: recommendedLargeFileAction('partial-row'),
        },
      };
    }

    updateFileProgress.run(lineNo, chunkIndex, fileSizeBytes || bytesScanned, 'full', relPath);
    return {
      indexed: true,
      chunks: chunkIndex,
      partial: false,
      lineCount: lineNo,
      chunkingStrategy,
    };
  }

  markGraphCurrent(relPath) {
    this.db.prepare('UPDATE code_files SET graph_version = ? WHERE path = ?')
      .run(CODE_GRAPH_EXTRACTOR_VERSION, relPath);
  }

  clearGraphFor(relPath) {
    this.db.prepare(`
      DELETE FROM code_edges
      WHERE from_id IN (SELECT id FROM code_symbols WHERE path = ?)
         OR to_id IN (SELECT id FROM code_symbols WHERE path = ?)
    `).run(relPath, relPath);
    this.db.prepare('DELETE FROM code_symbols WHERE path = ?').run(relPath);
    this.db.prepare('DELETE FROM code_semantic_anchors WHERE path = ?').run(relPath);
  }

  /**
   * Extract symbols + edges via tree-sitter and persist to code_symbols/code_edges.
   * Idempotent: clears prior rows for this file via FK CASCADE on code_files re-insert.
   */
  async indexGraphFor(absPath, content) {
    const { extractGraph } = await import('./code-graph.mjs');
    const relPath = this.toRel(absPath);

    // Clear old graph rows explicitly; do not rely on host SQLite FK settings.
    this.clearGraphFor(relPath);

    const { symbols, edges } = await extractGraph(content, relPath);
    if (symbols.length === 0 && edges.length === 0) {
      const anchors = this.indexSemanticAnchorsFor(relPath, content);
      return { symbolsAdded: 0, edgesAdded: 0, anchorsAdded: anchors.anchorsAdded };
    }

    const insSym = this.db.prepare(`
      INSERT INTO code_symbols (id, path, kind, name, start_line, end_line, parent_id, signature)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const s of symbols) {
      try {
        insSym.run(s.id, s.path, s.kind, s.name, s.startLine, s.endLine, s.parentId || null, s.signature || null);
      } catch {
        // Same id collisions (e.g. two arrow funcs at same line) — skip duplicates
      }
    }

    const insEdge = this.db.prepare(`
      INSERT OR IGNORE INTO code_edges (from_id, to_id, to_name, kind)
      VALUES (?, ?, ?, ?)
    `);
    for (const e of edges) {
      // Skip edges whose fromId isn't a real symbol (avoid FK error)
      // Synthetic '<module>' fromIds are dropped — top-level imports are still represented
      // via to_name without a symbol source.
      const fromExists = this.db.prepare('SELECT 1 FROM code_symbols WHERE id = ?').get(e.fromId);
      if (!fromExists) continue;
      try {
        insEdge.run(e.fromId, e.toId, e.toName, e.kind);
      } catch {}
    }

    const anchorResult = this.indexSemanticAnchorsFor(relPath, content);

    return { symbolsAdded: symbols.length, edgesAdded: edges.length, anchorsAdded: anchorResult.anchorsAdded };
  }

  indexSemanticAnchorsFor(relPath, content) {
    this.db.prepare('DELETE FROM code_semantic_anchors WHERE path = ?').run(relPath);
    const anchors = parseSemanticAnchors(content, { filePath: relPath });
    if (anchors.length === 0) return { anchorsAdded: 0 };
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO code_semantic_anchors (
        anchor_id, path, symbol_name, visibility, responsibility, invariants_json,
        verification_refs_json, start_line, end_line, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const anchor of anchors) {
      insert.run(
        anchor.anchorId,
        anchor.filePath,
        anchor.symbolName || null,
        anchor.visibility,
        anchor.responsibility || null,
        JSON.stringify(anchor.invariants || []),
        JSON.stringify(anchor.verificationRefs || []),
        anchor.startLine,
        anchor.endLine,
        anchor.source || 'comment',
      );
    }
    return { anchorsAdded: anchors.length };
  }

  /**
   * Resolve toId for unresolved edges with file/import-aware scoring.
   *
   * This deliberately leaves ambiguous edges unresolved instead of linking to
   * the first same-name symbol. False graph confidence is worse than a missing
   * edge for agents doing impact analysis.
   *
   * @returns number of edges that became resolved
   */
  resolveAllEdges({ onProgress = null, progressEvery = 1000 } = {}) {
    if (!this.useGraph) return 0;
    const files = this.db.prepare('SELECT path, language FROM code_files').all();
    const fileSet = new Set(files.map((f) => f.path));
    const langByFile = new Map(files.map((f) => [f.path, f.language]));
    const importMapCache = new Map();
    const symbolLookup = this.db.prepare(`
      SELECT id, path, kind, name, start_line AS startLine
      FROM code_symbols
      WHERE name = ?
      ORDER BY path, start_line
    `);
    const edgeRows = this.db.prepare(`
      SELECT e.rowid AS rowid, e.from_id AS fromId, e.to_name AS toName, e.kind AS edgeKind,
             s.path AS fromPath
      FROM code_edges e
      JOIN code_symbols s ON s.id = e.from_id
      WHERE e.to_id IS NULL
    `).all();
    const update = this.db.prepare('UPDATE code_edges SET to_id = ? WHERE rowid = ?');
    let resolved = 0;
    const total = edgeRows.length;
    onProgress?.({ phase: 'resolving-edges', current: 0, total, resolved });

    const getImportMap = (relPath) => {
      if (importMapCache.has(relPath)) return importMapCache.get(relPath);
      const language = langByFile.get(relPath) || detectLanguage(relPath);
      const absPath = join(this.projectRoot, relPath);
      let content = '';
      try { content = readFileSync(absPath, 'utf8'); } catch {}
      const map = buildImportMapForFile({
        content,
        relPath,
        language,
        fileSet,
      });
      importMapCache.set(relPath, map);
      return map;
    };

    for (const [index, edge] of edgeRows.entries()) {
      const candidates = symbolLookup.all(edge.toName);
      if (candidates.length > 0) {
        const target = selectBestEdgeTarget({
          edge,
          candidates,
          importMap: getImportMap(edge.fromPath),
          fromLanguage: langByFile.get(edge.fromPath),
          langByFile,
        });
        if (target) {
          update.run(target.id, edge.rowid);
          resolved++;
        }
      }
      const current = index + 1;
      if (current === total || current % progressEvery === 0) {
        onProgress?.({ phase: 'resolving-edges', current, total, resolved });
      }
    }
    return resolved;
  }

  /** Walk project directory, index all supported files. */
  async indexAll(rootDir, { onProgress = null, force = false, shouldStop = null, verbose = false } = {}) {
    const inventory = await discoverSourceFiles(rootDir);
    const counts = { indexed: 0, skipped: 0, errors: 0, discovered: inventory.files.length, pruned: 0, processed: 0, bounded: false };
    onProgress?.({ phase: 'discovered', total: inventory.files.length });
    for (const [index, file] of inventory.files.entries()) {
      if (shouldStop?.()) {
        counts.bounded = true;
        break;
      }
      onProgress?.({
        phase: 'file-start',
        current: index + 1,
        total: inventory.files.length,
        path: file.relPath,
        indexed: counts.indexed,
        skipped: counts.skipped,
        errors: counts.errors,
      });
      try {
        const result = await this.indexFile(file.absPath, {
          force,
          onProgress,
          current: index + 1,
          total: inventory.files.length,
          shouldStop,
        });
        if (result.indexed) counts.indexed++;
        else counts.skipped++;
        if (result.partial) {
          counts.errors++;
          await this.recordFailedFile({
            absPath: file.absPath,
            phase: result.phase || 'chunking',
            error: result.error,
            verbose,
            metadata: result.failureMetadata,
          });
        }
      } catch (err) {
        if (err.code === 'SUPERVIBE_INDEX_DEADLINE_EXCEEDED') {
          counts.bounded = true;
          break;
        }
        counts.errors++;
        await this.recordFailedFile({ absPath: file.absPath, phase: err.phase || 'file', error: err, verbose, metadata: err.indexMetadata });
      }
      counts.processed = index + 1;
      onProgress?.({
        phase: 'file',
        current: index + 1,
        total: inventory.files.length,
        path: file.relPath,
        indexed: counts.indexed,
        skipped: counts.skipped,
        errors: counts.errors,
      });
      if (shouldStop?.()) {
        counts.bounded = true;
        break;
      }
    }
    if (!counts.bounded) {
      const prune = await this.pruneToInventory(inventory, rootDir);
      counts.pruned = prune.removed;
      onProgress?.({ phase: 'resolving-edges', total: inventory.files.length });
      // Phase D: resolve cross-file edges after full pass
      counts.edgesResolved = this.resolveAllEdges({ onProgress });
    } else {
      counts.edgesResolved = 0;
      onProgress?.({ phase: 'bounded-timeout', current: counts.processed, total: inventory.files.length, ...counts });
    }
    onProgress?.({ phase: 'done', total: inventory.files.length, ...counts });
    return counts;
  }

  async pruneToInventory(inventory, rootDir = this.projectRoot) {
    return pruneCodeIndex(this, inventory, rootDir);
  }

  /** Index a specific list of absolute file paths (lazy mode). */
  async indexFiles(absPaths, { onProgress = null, force = false, shouldStop = null, verbose = false } = {}) {
    const counts = { indexed: 0, skipped: 0, errors: 0, discovered: absPaths.length, processed: 0, bounded: false };
    onProgress?.({ phase: 'discovered', total: absPaths.length });
    for (const [index, absPath] of absPaths.entries()) {
      if (shouldStop?.()) {
        counts.bounded = true;
        break;
      }
      onProgress?.({
        phase: 'file-start',
        current: index + 1,
        total: absPaths.length,
        path: this.toRel(absPath),
        indexed: counts.indexed,
        skipped: counts.skipped,
        errors: counts.errors,
      });
      try {
        const r = await this.indexFile(absPath, {
          force,
          onProgress,
          current: index + 1,
          total: absPaths.length,
          shouldStop,
        });
        if (r.indexed) counts.indexed++; else counts.skipped++;
        if (r.partial) {
          counts.errors++;
          await this.recordFailedFile({
            absPath,
            phase: r.phase || 'chunking',
            error: r.error,
            verbose,
            metadata: r.failureMetadata,
          });
        }
      } catch (err) {
        if (err.code === 'SUPERVIBE_INDEX_DEADLINE_EXCEEDED') {
          counts.bounded = true;
          break;
        }
        counts.errors++;
        await this.recordFailedFile({ absPath, phase: err.phase || 'file', error: err, verbose, metadata: err.indexMetadata });
      }
      counts.processed = index + 1;
      onProgress?.({
        phase: 'file',
        current: index + 1,
        total: absPaths.length,
        path: this.toRel(absPath),
        indexed: counts.indexed,
        skipped: counts.skipped,
        errors: counts.errors,
      });
      if (shouldStop?.()) {
        counts.bounded = true;
        break;
      }
    }
    if (!counts.bounded) {
      onProgress?.({ phase: 'resolving-edges', total: absPaths.length });
      counts.edgesResolved = this.resolveAllEdges({ onProgress });
    } else {
      counts.edgesResolved = 0;
      onProgress?.({ phase: 'bounded-timeout', current: counts.processed, total: absPaths.length, ...counts });
    }
    onProgress?.({ phase: 'done', total: absPaths.length, ...counts });
    return counts;
  }

  async removeFile(absPath) {
    const relPath = this.toRel(absPath);
    this.db.prepare('DELETE FROM code_chunks_fts WHERE path = ?').run(relPath);
    this.db.prepare('DELETE FROM code_chunks WHERE path = ?').run(relPath);
    this.clearGraphFor(relPath);
    this.db.prepare('DELETE FROM code_files WHERE path = ?').run(relPath);
  }

  async recordFailedFile({ absPath, phase = 'file', error, verbose = false, metadata = null } = {}) {
    const relPath = normalizeRelPath(absPath ? this.toRel(absPath) : error?.relPath);
    const existing = await this.readFailedFilesReport();
    const files = existing.files.filter((item) => item.path !== relPath);
    const extra = {
      ...(error?.indexMetadata || {}),
      ...(metadata || {}),
    };
    if (absPath && !extra.sizeBytes) {
      try {
        const fileStats = await stat(absPath);
        extra.sizeBytes = Number(fileStats.size || 0);
      } catch {}
    }
    files.push({
      path: relPath,
      phase,
      status: extra.status || undefined,
      errorName: error?.name || 'Error',
      message: error?.message || String(error || 'unknown error'),
      stack: verbose ? (error?.stack || '') : undefined,
      ...extra,
      failedAt: new Date().toISOString(),
    });
    await mkdir(dirname(this.failedFilesPath), { recursive: true });
    await writeFile(this.failedFilesPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      files,
    }, null, 2));
  }

  async readFailedFilesReport() {
    try {
      const raw = await readFile(this.failedFilesPath, 'utf8');
      const parsed = JSON.parse(raw);
      return { files: Array.isArray(parsed.files) ? parsed.files : [] };
    } catch {
      return { files: [] };
    }
  }

  stats() {
    const totalFiles = this.db.prepare('SELECT COUNT(*) AS n FROM code_files').get().n;
    const totalChunks = this.db.prepare('SELECT COUNT(*) AS n FROM code_chunks').get().n;
    const totalSymbols = this.db.prepare('SELECT COUNT(*) AS n FROM code_symbols').get().n;
    const totalEdges = this.db.prepare('SELECT COUNT(*) AS n FROM code_edges').get().n;
    const resolvedEdges = this.db.prepare('SELECT COUNT(*) AS n FROM code_edges WHERE to_id IS NOT NULL').get().n;
    const byLang = this.db.prepare('SELECT language, COUNT(*) AS n FROM code_files GROUP BY language ORDER BY n DESC').all();
    return {
      totalFiles, totalChunks, totalSymbols, totalEdges, resolvedEdges,
      edgeResolutionRate: totalEdges === 0 ? 1 : resolvedEdges / totalEdges,
      byLang
    };
  }

  /**
   * Per-language health: indexed files vs files with extracted symbols.
   * Useful for status command — detects broken grammar queries.
   */
  getGrammarHealth() {
    const rows = this.db.prepare(`
      SELECT cf.language AS lang,
             COUNT(DISTINCT cf.path) AS files,
             COUNT(DISTINCT s.path) AS files_with_symbols
      FROM code_files cf
      LEFT JOIN code_symbols s ON s.path = cf.path
      GROUP BY cf.language
      ORDER BY files DESC
    `).all();
    return rows.map(r => ({
      language: r.lang,
      files: r.files,
      filesWithSymbols: r.files_with_symbols,
      healthy: r.files === 0 || r.files_with_symbols > 0,
      coverage: r.files === 0 ? 1 : r.files_with_symbols / r.files,
      reason: r.files > 0 && r.files_with_symbols === 0
        ? `zero symbols extracted for ${r.files} indexed ${r.lang} file(s)`
        : 'symbols extracted',
    }));
  }

  getGraphHealthMetrics({ topSymbolLimit = 30 } = {}) {
    const totalFiles = this.db.prepare('SELECT COUNT(*) AS n FROM code_files').get().n;
    const filesWithSymbols = this.db.prepare('SELECT COUNT(DISTINCT path) AS n FROM code_symbols').get().n;
    const indexedPaths = this.db.prepare('SELECT path FROM code_files').all().map((row) => row.path);
    const generatedIndexedFiles = indexedPaths.filter(isGeneratedPath).length;
    const totalEdges = this.db.prepare('SELECT COUNT(*) AS n FROM code_edges').get().n;
    const resolvedEdges = this.db.prepare('SELECT COUNT(*) AS n FROM code_edges WHERE to_id IS NOT NULL').get().n;
    const topSymbols = this.db.prepare(`
      SELECT s.name AS name, COUNT(DISTINCT e.rowid) + COUNT(DISTINCT inbound.rowid) AS degree
      FROM code_symbols s
      LEFT JOIN code_edges e ON e.from_id = s.id
      LEFT JOIN code_edges inbound ON inbound.to_id = s.id
      GROUP BY s.id
      ORDER BY degree DESC, s.name ASC
      LIMIT ?
    `).all(topSymbolLimit).map((row) => row.name);
    const minifiedTopSymbols = [...new Set(topSymbols.filter(looksMinifiedSymbolName))];

    return {
      symbolNameQuality: {
        topSymbols,
        minifiedTopSymbols,
        minifiedTopSymbolRatio: topSymbols.length === 0 ? 0 : minifiedTopSymbols.length / topSymbols.length,
      },
      sourceFileSymbolCoverage: {
        files: totalFiles,
        filesWithSymbols,
        generatedIndexedFiles,
        coverage: totalFiles === 0 ? 1 : filesWithSymbols / totalFiles,
      },
      unresolvedImportRate: {
        unresolved: Math.max(0, totalEdges - resolvedEdges),
        total: totalEdges,
        rate: totalEdges === 0 ? 0 : (totalEdges - resolvedEdges) / totalEdges,
      },
      crossResolvedEdges: {
        resolved: resolvedEdges,
        total: totalEdges,
        rate: totalEdges === 0 ? 1 : resolvedEdges / totalEdges,
      },
    };
  }

  /** Hybrid search: FTS5 keyword + semantic cosine (max-over-chunks per file) → RRF. */
  async search({ query, language = null, kind = null, limit = 10, semantic = true, queryVector = null } = {}) {
    if (!query || !query.trim()) return [];

    const escapedTerms = query.trim().split(/\s+/).map(t => '"' + t.replace(/"/g, '""') + '"');
    const escapedQuery = escapedTerms.join(' ');
    let sql = `
      SELECT cf.path AS path, cf.language AS language, cf.line_count AS line_count,
             cc.chunk_idx AS chunk_idx, cc.chunk_text AS chunk_text, cc.kind AS kind, cc.name AS name,
             cc.start_line AS start_line, cc.end_line AS end_line, cc.embedding AS embedding,
             bm25(code_chunks_fts) AS bm25
      FROM code_chunks_fts
      JOIN code_chunks cc ON cc.path = code_chunks_fts.path AND cc.chunk_idx = code_chunks_fts.chunk_idx
      JOIN code_files cf ON cf.path = cc.path
      WHERE code_chunks_fts MATCH ?
    `;
    const params = [escapedQuery];
    if (language) { sql += ' AND cf.language = ?'; params.push(language); }
    if (kind) { sql += ' AND cc.kind = ?'; params.push(kind); }
    sql += ' ORDER BY bm25 LIMIT ?';
    params.push(limit * 3);

    const runFts = (ftsQuery) => this.db.prepare(sql).all(ftsQuery, ...params.slice(1));
    let rows;
    let ftsMode = 'fts';
    try { rows = runFts(params[0]); }
    catch { rows = []; }
    if (rows.length === 0 && escapedTerms.length > 1) {
      try {
        rows = runFts(escapedTerms.join(' OR '));
        ftsMode = rows.length > 0 ? 'fts-relaxed' : ftsMode;
      } catch {
        rows = [];
      }
    }

    if (!semantic || !this.useEmbeddings) {
      for (const r of rows) {
        r.retrievalMode = ftsMode;
        r.score = -Math.abs(r.bm25 || 0);
      }
      return this._aggregateByFile(rows, limit);
    }

    let queryVec;
    let embeddingHelpers;
    try {
      embeddingHelpers = await loadEmbeddingHelpers();
      queryVec = queryVector || await embeddingHelpers.embed(query, 'query');
    }
    catch { return this._aggregateByFile(rows, limit); }

    const k = 60;
    const semanticRows = this._loadSemanticCandidates({ language, kind, limit: Math.max(limit * 50, 200) });
    for (const r of semanticRows) {
      r.semanticScore = r.embedding ? embeddingHelpers.cosineSimilarity(queryVec, embeddingHelpers.bufferToVector(r.embedding)) : 0;
    }
    semanticRows.sort((a, b) => b.semanticScore - a.semanticScore);

    if (rows.length === 0) {
      return this._aggregateByFile(
        semanticRows
          .filter((r) => r.semanticScore > 0)
          .slice(0, Math.max(limit * 3, limit))
          .map((r, index) => ({
            ...r,
            score: 1 / (k + index + 1),
            retrievalMode: 'semantic',
          })),
        limit
      );
    }

    const bm25Sorted = [...rows].sort((a, b) => Math.abs(a.bm25) - Math.abs(b.bm25));
    const bm25Ranks = new Map(bm25Sorted.map((r, i) => [`${r.path}#${r.chunk_idx}`, i + 1]));
    const semRanks = new Map(semanticRows.map((r, i) => [`${r.path}#${r.chunk_idx}`, i + 1]));
    const semanticByKey = new Map(semanticRows.map((r) => [`${r.path}#${r.chunk_idx}`, r]));
    const combined = new Map();

    for (const r of rows) {
      const key = `${r.path}#${r.chunk_idx}`;
      const semanticRow = semanticByKey.get(key);
      const semanticScore = semanticRow?.semanticScore || (r.embedding ? embeddingHelpers.cosineSimilarity(queryVec, embeddingHelpers.bufferToVector(r.embedding)) : 0);
      combined.set(key, {
        ...r,
        semanticScore,
        score: 1 / (k + (bm25Ranks.get(key) || 1000)) + 1 / (k + (semRanks.get(key) || 1000)),
        retrievalMode: semanticScore > 0 ? 'hybrid' : ftsMode,
      });
    }

    for (const [index, r] of semanticRows.slice(0, Math.max(limit * 3, limit)).entries()) {
      const key = `${r.path}#${r.chunk_idx}`;
      if (combined.has(key)) continue;
      combined.set(key, {
        ...r,
        score: 1 / (k + index + 1),
        retrievalMode: 'semantic',
      });
    }

    const mergedRows = [...combined.values()].sort((a, b) => b.score - a.score);
    return this._aggregateByFile(mergedRows, limit);
  }

  _loadSemanticCandidates({ language = null, kind = null, limit = 500 } = {}) {
    let sql = `
      SELECT cf.path AS path, cf.language AS language, cf.line_count AS line_count,
             cc.chunk_idx AS chunk_idx, cc.chunk_text AS chunk_text, cc.kind AS kind, cc.name AS name,
             cc.start_line AS start_line, cc.end_line AS end_line, cc.embedding AS embedding,
             0 AS bm25
      FROM code_chunks cc
      JOIN code_files cf ON cf.path = cc.path
      WHERE cc.embedding IS NOT NULL
    `;
    const params = [];
    if (language) { sql += ' AND cf.language = ?'; params.push(language); }
    if (kind) { sql += ' AND cc.kind = ?'; params.push(kind); }
    sql += ' LIMIT ?';
    params.push(limit);
    try { return this.db.prepare(sql).all(...params); }
    catch { return []; }
  }

  _aggregateByFile(rows, limit) {
    const byFile = new Map();
    for (const r of rows) {
      const score = r.score ?? -Math.abs(r.bm25 || 0);
      const existing = byFile.get(r.path);
      const existingScore = existing ? (existing.score ?? -Math.abs(existing.bm25 || 0)) : -Infinity;
      if (!existing || score > existingScore) {
        byFile.set(r.path, r);
      }
    }
    return [...byFile.values()].slice(0, limit).map(r => ({
      file: r.path,
      language: r.language,
      lineCount: r.line_count,
      kind: r.kind,
      name: r.name,
      startLine: r.start_line,
      endLine: r.end_line,
      snippet: r.chunk_text.slice(0, 400),
      score: r.score || 0,
      semantic: r.semanticScore || 0,
      bm25: Math.abs(r.bm25 || 0),
      retrievalMode: r.retrievalMode || 'fts',
      generatedSource: isGeneratedPath(r.path),
      scoreComponents: {
        bm25: Math.abs(r.bm25 || 0),
        semantic: r.semanticScore || 0,
        rrf: r.score || 0,
      },
    }));
  }
}
