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

    return { indexed: true, chunks: chunks.length };
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
    const byLang = this.db.prepare('SELECT language, COUNT(*) AS n FROM code_files GROUP BY language ORDER BY n DESC').all();
    return { totalFiles, totalChunks, byLang };
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
