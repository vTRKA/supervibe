// SQLite-backed code RAG with hybrid (FTS5 + semantic) search.
// Mirrors MemoryStore but for source code: per-file rows + per-chunk embeddings.
// Hash-based change detection skips unchanged files on re-index.

import { DatabaseSync } from 'node:sqlite';
import { readdir, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { hashFile } from './file-hash.mjs';
import { chunkCode, detectLanguage } from './code-chunker.mjs';
import { embed, cosineSimilarity, vectorToBuffer, bufferToVector } from './embeddings.mjs';

const SUPPORTED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.mts', '.cts',
  '.js', '.jsx', '.mjs', '.cjs',
  '.py',
  '.php',
  '.rs',
  '.go',
  '.java',
  '.rb',
  '.vue', '.svelte'
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', 'coverage',
  '.turbo', 'vendor', '__pycache__', 'target', 'venv', '.venv'
]);
const SKIP_FILE_PATTERNS = [/\.min\.(js|css)$/, /\.bundle\./, /\.test\./, /\.spec\./, /\.d\.ts$/];

export class CodeStore {
  constructor(projectRoot, opts = {}) {
    this.projectRoot = projectRoot;
    this.dbDir = join(projectRoot, '.claude', 'memory');
    this.dbPath = join(this.dbDir, 'code.db');
    this.db = null;
    this.useEmbeddings = opts.useEmbeddings !== false;
  }

  async init() {
    if (!existsSync(this.dbDir)) {
      await mkdir(this.dbDir, { recursive: true });
    }
    this.db = new DatabaseSync(this.dbPath);
    // WAL mode: allow concurrent readers + one writer (e.g. watcher + manual code:index)
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS code_files (
        path TEXT PRIMARY KEY,
        language TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        line_count INTEGER NOT NULL,
        indexed_at TEXT NOT NULL
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
    `);
    return this;
  }

  close() {
    if (this.db) { this.db.close(); this.db = null; }
  }

  toRel(absPath) {
    return relative(this.projectRoot, absPath).split(sep).join('/');
  }

  /** Index a single file. Skips if hash unchanged (idempotent). */
  async indexFile(absPath) {
    const lang = detectLanguage(absPath);
    if (!lang) return { skipped: 'unsupported-language' };

    const relPath = this.toRel(absPath);
    let content;
    try { content = await readFile(absPath, 'utf8'); }
    catch (err) {
      if (err.code === 'ENOENT') {
        await this.removeFile(absPath);
        return { skipped: 'file-deleted' };
      }
      throw err;
    }

    const hash = await hashFile(absPath);
    const existing = this.db.prepare('SELECT content_hash FROM code_files WHERE path = ?').get(relPath);
    if (existing && existing.content_hash === hash) {
      // Hash unchanged, but the file may have been indexed before code graph existed.
      // Heal-on-skip: if no symbols exist for this file, run graph extraction.
      const symCount = this.db.prepare('SELECT COUNT(*) AS n FROM code_symbols WHERE path = ?').get(relPath).n;
      if (symCount === 0) {
        try {
          const c = await readFile(absPath, 'utf8');
          await this.indexGraphFor(absPath, c);
          return { skipped: 'unchanged-graph-healed' };
        } catch {}
      }
      return { skipped: 'unchanged' };
    }

    this.db.prepare('DELETE FROM code_chunks WHERE path = ?').run(relPath);
    this.db.prepare('DELETE FROM code_chunks_fts WHERE path = ?').run(relPath);

    const chunks = await chunkCode(content, absPath);
    const lines = content.split('\n').length;

    this.db.prepare(`
      INSERT OR REPLACE INTO code_files (path, language, content_hash, line_count, indexed_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(relPath, lang, hash, lines);

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
        try {
          const vec = await embed(c.text, 'passage');
          embeddingBuf = vectorToBuffer(vec);
        } catch {}
      }
      insertChunk.run(relPath, i, c.text, c.kind, c.name || null, c.startLine, c.endLine, c.tokens || 0, embeddingBuf);
      insertFTS.run(relPath, i, c.text, c.name || '');
    }

    // Phase D: also extract code graph (symbols + edges) for this file.
    // Failure here is non-fatal — graph stays empty for this file, semantic RAG still works.
    try {
      await this.indexGraphFor(absPath, content);
    } catch (err) {
      if (process.env.SUPERVIBE_VERBOSE === '1') {
        console.warn(`[code-graph] failed for ${relPath}: ${err.message}`);
      }
    }

    return { indexed: true, chunks: chunks.length };
  }

  /**
   * Extract symbols + edges via tree-sitter and persist to code_symbols/code_edges.
   * Idempotent: clears prior rows for this file via FK CASCADE on code_files re-insert.
   */
  async indexGraphFor(absPath, content) {
    const { extractGraph } = await import('./code-graph.mjs');
    const relPath = this.toRel(absPath);

    // Clear old graph rows for this file (CASCADE handles edges via from_id FK)
    this.db.prepare('DELETE FROM code_symbols WHERE path = ?').run(relPath);

    const { symbols, edges } = await extractGraph(content, relPath);
    if (symbols.length === 0 && edges.length === 0) {
      return { symbolsAdded: 0, edgesAdded: 0 };
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

    return { symbolsAdded: symbols.length, edgesAdded: edges.length };
  }

  /**
   * Resolve toId for unresolved edges by name lookup across whole project.
   * Run once at end of indexAll() for consistent picture.
   * @returns number of edges that became resolved
   */
  resolveAllEdges() {
    const result = this.db.prepare(`
      UPDATE code_edges
      SET to_id = (
        SELECT id FROM code_symbols
        WHERE name = code_edges.to_name
        ORDER BY id
        LIMIT 1
      )
      WHERE to_id IS NULL
    `).run();
    return result.changes;
  }

  /** Walk project directory, index all supported files. */
  async indexAll(rootDir) {
    const counts = { indexed: 0, skipped: 0, errors: 0 };
    const queue = [rootDir];
    while (queue.length > 0) {
      const dir = queue.shift();
      let entries;
      try { entries = await readdir(dir, { withFileTypes: true }); }
      catch { continue; }
      for (const e of entries) {
        if (e.name.startsWith('.') && e.name !== '.') continue;
        const full = join(dir, e.name);
        if (e.isDirectory()) {
          if (SKIP_DIRS.has(e.name)) continue;
          queue.push(full);
        } else if (e.isFile()) {
          const dotIdx = e.name.lastIndexOf('.');
          if (dotIdx < 0) continue;
          const ext = e.name.slice(dotIdx).toLowerCase();
          if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
          if (SKIP_FILE_PATTERNS.some(p => p.test(e.name))) continue;
          try {
            const result = await this.indexFile(full);
            if (result.indexed) counts.indexed++;
            else counts.skipped++;
          } catch {
            counts.errors++;
          }
        }
      }
    }
    // Phase D: resolve cross-file edges after full pass
    counts.edgesResolved = this.resolveAllEdges();
    return counts;
  }

  /** Index a specific list of absolute file paths (lazy mode). */
  async indexFiles(absPaths) {
    const counts = { indexed: 0, skipped: 0, errors: 0 };
    for (const absPath of absPaths) {
      try {
        const r = await this.indexFile(absPath);
        if (r.indexed) counts.indexed++; else counts.skipped++;
      } catch { counts.errors++; }
    }
    counts.edgesResolved = this.resolveAllEdges();
    return counts;
  }

  async removeFile(absPath) {
    const relPath = this.toRel(absPath);
    this.db.prepare('DELETE FROM code_chunks_fts WHERE path = ?').run(relPath);
    this.db.prepare('DELETE FROM code_files WHERE path = ?').run(relPath);
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
      coverage: r.files === 0 ? 1 : r.files_with_symbols / r.files
    }));
  }

  /** Hybrid search: FTS5 keyword + semantic cosine (max-over-chunks per file) → RRF. */
  async search({ query, language = null, kind = null, limit = 10, semantic = true } = {}) {
    if (!query || !query.trim()) return [];

    const escapedQuery = query.trim().split(/\s+/).map(t => '"' + t.replace(/"/g, '""') + '"').join(' ');
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

    let rows;
    try { rows = this.db.prepare(sql).all(...params); }
    catch { rows = []; }

    if (!semantic || !this.useEmbeddings || rows.length === 0) {
      return this._aggregateByFile(rows, limit);
    }

    let queryVec;
    try { queryVec = await embed(query, 'query'); }
    catch { return this._aggregateByFile(rows, limit); }

    for (const r of rows) {
      r.semanticScore = r.embedding ? cosineSimilarity(queryVec, bufferToVector(r.embedding)) : 0;
    }

    const k = 60;
    const bm25Sorted = [...rows].sort((a, b) => Math.abs(a.bm25) - Math.abs(b.bm25));
    const semSorted = [...rows].sort((a, b) => b.semanticScore - a.semanticScore);
    const bm25Ranks = new Map(bm25Sorted.map((r, i) => [`${r.path}#${r.chunk_idx}`, i + 1]));
    const semRanks = new Map(semSorted.map((r, i) => [`${r.path}#${r.chunk_idx}`, i + 1]));

    for (const r of rows) {
      const key = `${r.path}#${r.chunk_idx}`;
      r.score = 1 / (k + (bm25Ranks.get(key) || 1000)) + 1 / (k + (semRanks.get(key) || 1000));
    }
    rows.sort((a, b) => b.score - a.score);
    return this._aggregateByFile(rows, limit);
  }

  _aggregateByFile(rows, limit) {
    const byFile = new Map();
    for (const r of rows) {
      const score = r.score || -Math.abs(r.bm25 || 0);
      const existing = byFile.get(r.path);
      const existingScore = existing ? (existing.score || -Math.abs(existing.bm25 || 0)) : -Infinity;
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
      bm25: Math.abs(r.bm25 || 0)
    }));
  }
}
