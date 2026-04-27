// Memory v2: SQLite FTS5-backed semantic-ish search.
// Replaces markdown+grep with BM25-ranked full-text + tag filtering.
// Zero external deps — uses Node 22+ built-in node:sqlite.
//
// Schema:
//   entries(id PK, type, date, tags_csv, agent, confidence, file, content, summary)
//   entries_fts (FTS5 virtual table for content+summary+tags_csv)
//   tags(tag, entry_id) — for tag-overlap fast lookup
//
// Index file: .claude/memory/memory.db  (gitignored)

import { DatabaseSync } from 'node:sqlite';
import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import matter from 'gray-matter';

const CATEGORIES = ['decisions', 'patterns', 'incidents', 'learnings', 'solutions'];

export class MemoryStore {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.memoryDir = join(projectRoot, '.claude', 'memory');
    this.dbPath = join(this.memoryDir, 'memory.db');
    this.db = null;
  }

  async init() {
    await mkdir(this.memoryDir, { recursive: true });
    for (const cat of CATEGORIES) {
      await mkdir(join(this.memoryDir, cat), { recursive: true });
    }

    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        date TEXT,
        tags_csv TEXT,
        agent TEXT,
        confidence INTEGER,
        file TEXT NOT NULL,
        summary TEXT,
        content TEXT,
        indexed_at TEXT
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
        id UNINDEXED,
        content,
        summary,
        tags_csv,
        tokenize='porter unicode61'
      );
      CREATE TABLE IF NOT EXISTS tags (
        tag TEXT NOT NULL,
        entry_id TEXT NOT NULL,
        PRIMARY KEY(tag, entry_id)
      );
      CREATE INDEX IF NOT EXISTS idx_entries_type ON entries(type);
      CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date);
      CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
    `);
    return this;
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  toRelativePath(absPath) {
    return relative(this.projectRoot, absPath).split(sep).join('/');
  }

  // Rebuild from filesystem source-of-truth.
  // Idempotent: clears + reindexes.
  async rebuildIndex() {
    if (!this.db) await this.init();
    this.db.exec('DELETE FROM entries; DELETE FROM entries_fts; DELETE FROM tags;');

    let count = 0;
    for (const category of CATEGORIES) {
      const dir = join(this.memoryDir, category);
      let entries;
      try { entries = await readdir(dir, { withFileTypes: true }); }
      catch (err) { if (err.code === 'ENOENT') continue; throw err; }

      for (const entry of entries) {
        if (entry.isDirectory()) continue;
        if (!entry.name.endsWith('.md')) continue;
        if (entry.name.startsWith('_')) continue;

        const filePath = join(dir, entry.name);
        const content = await readFile(filePath, 'utf8');
        const parsed = matter(content);
        const data = parsed.data;
        const body = parsed.content || '';

        if (!data.id) continue;

        const tagsArr = Array.isArray(data.tags) ? data.tags : [];
        const tagsCSV = tagsArr.join(',');
        const summary = body.split('\n').slice(0, 5).join(' ').slice(0, 500);

        const insertEntry = this.db.prepare(`
          INSERT OR REPLACE INTO entries
            (id, type, date, tags_csv, agent, confidence, file, summary, content, indexed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `);
        const dateStr = data.date instanceof Date
          ? data.date.toISOString().slice(0, 10)
          : (data.date ? String(data.date) : null);
        insertEntry.run(
          String(data.id),
          String(data.type || category.slice(0, -1)),
          dateStr,
          String(tagsCSV),
          String(data.agent || 'unknown'),
          Number(data.confidence || 0),
          String(this.toRelativePath(filePath)),
          String(summary),
          String(body)
        );

        const insertFTS = this.db.prepare(`
          INSERT INTO entries_fts (id, content, summary, tags_csv) VALUES (?, ?, ?, ?)
        `);
        insertFTS.run(data.id, body, summary, tagsCSV);

        const insertTag = this.db.prepare('INSERT OR IGNORE INTO tags (tag, entry_id) VALUES (?, ?)');
        for (const tag of tagsArr) {
          insertTag.run(tag, data.id);
        }
        count += 1;
      }
    }

    return { entriesIndexed: count };
  }

  // Search by query (BM25-ranked full-text) + optional tag filter + type filter.
  // Returns top-N entries with: id, type, date, tags, summary, confidence, file, score.
  search({ query, tags = [], type = null, limit = 5, minConfidence = 0 } = {}) {
    if (!this.db) throw new Error('Call init() first');

    const params = [];
    const conditions = [];

    // Escape FTS5 query: split into tokens, quote each separately to avoid operator parsing.
    // "idempotency redis" → "idempotency" "redis" (implicit AND in FTS5)
    // "completely-unmatched-string" → "completely-unmatched-string" (hyphens safe inside quotes)
    const escapedQuery = query && query.trim().length > 0
      ? query.trim().split(/\s+/).map(tok => '"' + tok.replace(/"/g, '""') + '"').join(' ')
      : null;

    let sql;
    const useFTS = escapedQuery !== null;

    if (useFTS) {
      sql = `
        SELECT e.id AS id, e.type AS type, e.date AS date, e.tags_csv AS tags_csv,
               e.agent AS agent, e.confidence AS confidence, e.file AS file, e.summary AS summary,
               bm25(entries_fts) AS score
        FROM entries_fts
        JOIN entries e ON e.id = entries_fts.id
        WHERE entries_fts MATCH ?
      `;
      params.push(escapedQuery);
    } else {
      sql = `
        SELECT e.id AS id, e.type AS type, e.date AS date, e.tags_csv AS tags_csv,
               e.agent AS agent, e.confidence AS confidence, e.file AS file, e.summary AS summary,
               0 AS score
        FROM entries e WHERE 1=1
      `;
    }

    if (type) {
      sql += ' AND e.type = ?';
      params.push(type);
    }
    if (minConfidence > 0) {
      sql += ' AND e.confidence >= ?';
      params.push(minConfidence);
    }
    if (tags.length > 0) {
      const placeholders = tags.map(() => '?').join(',');
      sql += ` AND e.id IN (SELECT entry_id FROM tags WHERE tag IN (${placeholders}) GROUP BY entry_id HAVING COUNT(DISTINCT tag) = ?)`;
      params.push(...tags, tags.length);
    }

    sql += useFTS ? ' ORDER BY score LIMIT ?' : ' ORDER BY e.date DESC LIMIT ?';
    params.push(limit);

    let rows;
    try {
      rows = this.db.prepare(sql).all(...params);
    } catch (err) {
      // FTS5 may reject malformed queries (rare with our quoting). Treat as no-match.
      if (err.code === 'ERR_SQLITE_ERROR' && useFTS) return [];
      throw err;
    }
    return rows.map(row => ({
      id: row.id,
      type: row.type,
      date: row.date,
      tags: row.tags_csv ? row.tags_csv.split(',') : [],
      agent: row.agent,
      confidence: row.confidence,
      file: row.file,
      summary: row.summary,
      score: typeof row.score === 'number' ? Math.abs(row.score) : 0
    }));
  }

  stats() {
    if (!this.db) throw new Error('Call init() first');
    const total = this.db.prepare('SELECT COUNT(*) AS n FROM entries').get().n;
    const byType = this.db.prepare('SELECT type, COUNT(*) AS n FROM entries GROUP BY type').all();
    const tagCount = this.db.prepare('SELECT COUNT(DISTINCT tag) AS n FROM tags').get().n;
    return { totalEntries: total, byType, uniqueTags: tagCount };
  }
}

// Singleton helper for one-shot usage from scripts
export async function rebuildMemory(projectRoot) {
  const store = new MemoryStore(projectRoot);
  await store.init();
  const result = await store.rebuildIndex();
  store.close();
  return result;
}

export async function searchMemory(projectRoot, opts) {
  const store = new MemoryStore(projectRoot);
  await store.init();
  const results = store.search(opts);
  store.close();
  return results;
}
