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
import { embed, cosineSimilarity, vectorToBuffer, bufferToVector, EMBEDDING_DIM } from './embeddings.mjs';
import { chunkText, countTokens } from './chunker.mjs';

const CATEGORIES = ['decisions', 'patterns', 'incidents', 'learnings', 'solutions'];

export class MemoryStore {
  constructor(projectRoot, opts = {}) {
    this.projectRoot = projectRoot;
    this.memoryDir = join(projectRoot, '.claude', 'memory');
    this.dbPath = join(this.memoryDir, 'memory.db');
    this.db = null;
    // useEmbeddings: enable semantic search (downloads ~25MB model first time)
    // Set to false for fast tests / minimal install
    this.useEmbeddings = opts.useEmbeddings !== false;
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
        embedding BLOB,
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

      -- Per-chunk embeddings (real chunking, no truncation).
      -- Each entry has 1+ chunks; query similarity = MAX over its chunks.
      CREATE TABLE IF NOT EXISTS entry_chunks (
        entry_id TEXT NOT NULL,
        chunk_idx INTEGER NOT NULL,
        chunk_text TEXT NOT NULL,
        token_count INTEGER NOT NULL,
        embedding BLOB NOT NULL,
        PRIMARY KEY(entry_id, chunk_idx),
        FOREIGN KEY(entry_id) REFERENCES entries(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_entry ON entry_chunks(entry_id);
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
    this.db.exec('DELETE FROM entry_chunks; DELETE FROM entries; DELETE FROM entries_fts; DELETE FROM tags;');

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

        // Entry-level "summary" embedding for fast filter (id + tags + summary, NO truncation of useful info)
        let summaryEmbeddingBuf = null;
        // Per-chunk embeddings for full-content search (NO truncation — covers entire document)
        const chunkEmbeddings = [];
        if (this.useEmbeddings) {
          try {
            // Summary embedding: short metadata signal (id + tags + first paragraph), always fits in budget
            const summaryText = `${data.id}\n${tagsCSV}\n${summary}`;
            const summaryVec = await embed(summaryText, 'passage');
            summaryEmbeddingBuf = vectorToBuffer(summaryVec);

            // Chunk embeddings: split FULL body into overlapping windows, embed each
            // No truncation — every word of every entry is reachable by semantic search
            const chunks = await chunkText(body, { targetTokens: 200, overlapTokens: 32 });
            for (let i = 0; i < chunks.length; i++) {
              const chunkVec = await embed(chunks[i], 'passage');
              const chunkTokens = await countTokens(chunks[i]);
              chunkEmbeddings.push({
                idx: i,
                text: chunks[i],
                tokens: chunkTokens,
                buf: vectorToBuffer(chunkVec)
              });
            }
          } catch (err) {
            console.warn(`embed failed for ${data.id}: ${err.message} — entry indexed without embeddings`);
          }
        }

        const insertEntry = this.db.prepare(`
          INSERT OR REPLACE INTO entries
            (id, type, date, tags_csv, agent, confidence, file, summary, content, embedding, indexed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
          String(body),
          summaryEmbeddingBuf
        );

        // Insert per-chunk embeddings for full-content semantic search
        if (chunkEmbeddings.length > 0) {
          const insertChunk = this.db.prepare(`
            INSERT INTO entry_chunks (entry_id, chunk_idx, chunk_text, token_count, embedding)
            VALUES (?, ?, ?, ?, ?)
          `);
          for (const c of chunkEmbeddings) {
            insertChunk.run(String(data.id), c.idx, String(c.text), c.tokens, c.buf);
          }
        }

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

  // HYBRID search: combines FTS5 BM25 keyword score + semantic cosine similarity (RRF).
  // Falls back to FTS5-only if embeddings disabled or query unembeddable.
  // Returns top-N entries with: id, type, date, tags, summary, confidence, file, score, semantic.
  async search({ query, tags = [], type = null, limit = 5, minConfidence = 0, semantic = true } = {}) {
    // Sync FTS5 path (existing) + async semantic rerank if enabled
    const ftsResults = this._searchFTS({ query, tags, type, limit: limit * 3, minConfidence });

    if (!query || !semantic || !this.useEmbeddings) {
      return ftsResults.slice(0, limit);
    }

    // Compute query embedding once (e5 'query' mode is asymmetric vs 'passage')
    let queryVec;
    try {
      queryVec = await embed(query, 'query');
    } catch (err) {
      // If embedding fails (no model / network issue), return FTS-only
      return ftsResults.slice(0, limit);
    }

    // Compute MAX semantic score per entry across its chunks (no truncation — every word is reachable)
    const computeChunkMaxSimilarity = (entryId) => {
      const chunkRows = this.db.prepare('SELECT chunk_idx, embedding FROM entry_chunks WHERE entry_id = ?').all(entryId);
      if (chunkRows.length === 0) return { score: 0, bestChunkIdx: -1 };
      let best = -1, bestIdx = -1;
      for (const cr of chunkRows) {
        const cVec = bufferToVector(cr.embedding);
        const sim = cosineSimilarity(queryVec, cVec);
        if (sim > best) { best = sim; bestIdx = cr.chunk_idx; }
      }
      return { score: best, bestChunkIdx: bestIdx };
    };

    // SEMANTIC-ONLY FALLBACK: if FTS empty, score ALL entries via chunks (max-over-chunks per entry)
    if (ftsResults.length === 0) {
      const allParams = [];
      let allSql = `
        SELECT id, type, date, tags_csv, agent, confidence, file, summary
        FROM entries WHERE 1=1
      `;
      if (type) { allSql += ' AND type = ?'; allParams.push(type); }
      if (minConfidence > 0) { allSql += ' AND confidence >= ?'; allParams.push(minConfidence); }
      if (tags.length > 0) {
        const ph = tags.map(() => '?').join(',');
        allSql += ` AND id IN (SELECT entry_id FROM tags WHERE tag IN (${ph}) GROUP BY entry_id HAVING COUNT(DISTINCT tag) = ?)`;
        allParams.push(...tags, tags.length);
      }
      const allRows = this.db.prepare(allSql).all(...allParams);
      // e5 baseline cosine is high (~0.78 unrelated); related ≥0.82, very-related ≥0.86
      const E5_RELATED_THRESHOLD = 0.82;
      return allRows
        .map(r => {
          const { score: chunkMax, bestChunkIdx } = computeChunkMaxSimilarity(r.id);
          return {
            id: r.id, type: r.type, date: r.date,
            tags: r.tags_csv ? r.tags_csv.split(',') : [],
            agent: r.agent, confidence: r.confidence,
            file: r.file, summary: r.summary,
            score: chunkMax, semantic: chunkMax,
            bestChunkIdx
          };
        })
        .filter(r => r.semantic >= E5_RELATED_THRESHOLD)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    }

    // Reciprocal Rank Fusion (RRF) over BM25 + semantic (using chunk-max per entry)
    const k = 60; // RRF constant
    const ftsRanks = new Map(ftsResults.map((r, i) => [r.id, i + 1]));

    // Compute semantic scores for FTS candidates via MAX over their chunks
    const candidatesWithSemantic = [];
    for (const r of ftsResults) {
      const { score: chunkMax, bestChunkIdx } = computeChunkMaxSimilarity(r.id);
      candidatesWithSemantic.push({ ...r, semanticScore: chunkMax, bestChunkIdx });
    }

    // Sort by semantic score (high to low) for ranking
    const semanticRanked = [...candidatesWithSemantic].sort((a, b) => b.semanticScore - a.semanticScore);
    const semRanks = new Map(semanticRanked.map((r, i) => [r.id, i + 1]));

    // RRF combined score
    for (const r of candidatesWithSemantic) {
      const ftsRank = ftsRanks.get(r.id) || 1000;
      const semRank = semRanks.get(r.id) || 1000;
      r.score = 1 / (k + ftsRank) + 1 / (k + semRank);
      r.semantic = r.semanticScore;
      delete r.embedding; // don't return raw embedding
    }

    candidatesWithSemantic.sort((a, b) => b.score - a.score);
    return candidatesWithSemantic.slice(0, limit);
  }

  // Sync FTS5-only search (used internally by hybrid search and as fallback).
  _searchFTS({ query, tags = [], type = null, limit = 5, minConfidence = 0 } = {}) {
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
               e.embedding AS embedding,
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
               e.embedding AS embedding,
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
      score: typeof row.score === 'number' ? Math.abs(row.score) : 0,
      embedding: row.embedding  // raw Buffer, used by hybrid search; stripped before public return
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
export async function rebuildMemory(projectRoot, opts = {}) {
  const store = new MemoryStore(projectRoot, opts);
  await store.init();
  const result = await store.rebuildIndex();
  store.close();
  return result;
}

export async function searchMemory(projectRoot, opts = {}) {
  const store = new MemoryStore(projectRoot, { useEmbeddings: opts.semantic !== false });
  await store.init();
  const results = await store.search(opts);
  store.close();
  return results;
}
