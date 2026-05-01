// Per-project SQLite index of agent invocations with FTS5 over task summaries.
// Used by the dispatch-suggester to find historically high-confidence agents
// for tasks similar to a current low-confidence one.
//
// Storage: <projectRoot>/.supervibe/memory/agent-tasks.db
// Override path via SUPERVIBE_AGENT_TASK_DB env (used by tests).
//
// Why a separate DB from agent-invocations.jsonl: JSONL is append-only and
// cheap to write but unsearchable. This SQLite mirror gives FTS5 BM25 search
// + indexed numeric filters without slowing the JSONL write path.

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadNodeSqliteDatabaseSync } from './node-sqlite-runtime.mjs';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS agent_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    task_summary TEXT NOT NULL,
    confidence_score REAL NOT NULL,
    override INTEGER NOT NULL DEFAULT 0,
    session_id TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent      ON agent_tasks(agent_id);
  CREATE INDEX IF NOT EXISTS idx_agent_tasks_confidence ON agent_tasks(confidence_score);
  CREATE INDEX IF NOT EXISTS idx_agent_tasks_ts         ON agent_tasks(ts);

  CREATE VIRTUAL TABLE IF NOT EXISTS agent_tasks_fts USING fts5(
    task_summary,
    agent_id UNINDEXED,
    content='agent_tasks',
    content_rowid='id',
    tokenize='porter unicode61'
  );

  CREATE TRIGGER IF NOT EXISTS agent_tasks_ai AFTER INSERT ON agent_tasks BEGIN
    INSERT INTO agent_tasks_fts(rowid, task_summary, agent_id)
      VALUES (new.id, new.task_summary, new.agent_id);
  END;

  CREATE TRIGGER IF NOT EXISTS agent_tasks_ad AFTER DELETE ON agent_tasks BEGIN
    INSERT INTO agent_tasks_fts(agent_tasks_fts, rowid, task_summary, agent_id)
      VALUES ('delete', old.id, old.task_summary, old.agent_id);
  END;
`;

function defaultDbPath(projectRoot) {
  return process.env.SUPERVIBE_AGENT_TASK_DB
    || join(projectRoot, '.supervibe', 'memory', 'agent-tasks.db');
}

// Sanitize a free-text summary into an FTS5 MATCH pattern: each token quoted
// individually so user input (with punctuation, dashes, parens) cannot break
// the parser. Joined with space → AND-of-tokens.
function buildFtsQuery(text) {
  if (!text) return null;
  const tokens = String(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .filter(t => t.length >= 2)
    .slice(0, 20); // cap to avoid pathological inputs
  if (tokens.length === 0) return null;
  // FTS5 requires escaping double-quotes inside quoted tokens
  return tokens.map(t => `"${t.replace(/"/g, '""')}"`).join(' OR ');
}

export class AgentTaskStore {
  constructor(projectRoot, opts = {}) {
    this.projectRoot = projectRoot;
    this.dbPath = opts.dbPath || defaultDbPath(projectRoot);
    this.db = null;
  }

  async init() {
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const DatabaseSync = await loadNodeSqliteDatabaseSync('Agent task memory');
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous  = NORMAL;');
    this.db.exec(SCHEMA);
    return this;
  }

  /**
   * Append one invocation. Always cheap — no embeddings, no network.
   * @param {{agent_id:string, task_summary:string, confidence_score:number,
   *   override?:boolean, session_id?:string|null, ts?:string}} entry
   */
  addTask(entry) {
    if (!entry.agent_id) throw new Error('agent_id required');
    if (!entry.task_summary) throw new Error('task_summary required');
    if (typeof entry.confidence_score !== 'number') throw new Error('confidence_score must be a number');
    const ts = entry.ts || new Date().toISOString();
    this.db.prepare(
      'INSERT INTO agent_tasks (ts, agent_id, task_summary, confidence_score, override, session_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      ts,
      entry.agent_id,
      entry.task_summary,
      entry.confidence_score,
      entry.override ? 1 : 0,
      entry.session_id ?? null,
    );
  }

  /**
   * Retrieve historic invocations whose task summary matches the given text
   * (BM25-ranked), filtered by confidence threshold and optional agent
   * exclusion.
   *
   * @param {string} taskSummary
   * @param {{excludeAgent?:string, minConfidence?:number, limit?:number, includeOverride?:boolean}} opts
   * @returns {Array<{agent_id, task_summary, confidence_score, ts, bm25_rank}>}
   */
  findSimilar(taskSummary, opts = {}) {
    const ftsQuery = buildFtsQuery(taskSummary);
    if (!ftsQuery) return [];

    const minConfidence = opts.minConfidence ?? 8.5;
    const limit = opts.limit ?? 30;
    const includeOverride = !!opts.includeOverride;

    const params = [ftsQuery, minConfidence];
    let sql = `
      SELECT t.agent_id, t.task_summary, t.confidence_score, t.ts, agent_tasks_fts.rank AS bm25_rank
        FROM agent_tasks_fts
        JOIN agent_tasks t ON t.id = agent_tasks_fts.rowid
       WHERE agent_tasks_fts MATCH ?
         AND t.confidence_score >= ?
    `;
    if (!includeOverride) sql += ' AND t.override = 0';
    if (opts.excludeAgent) {
      sql += ' AND t.agent_id != ?';
      params.push(opts.excludeAgent);
    }
    sql += ' ORDER BY agent_tasks_fts.rank LIMIT ?';
    params.push(limit);

    return this.db.prepare(sql).all(...params);
  }

  stats() {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM agent_tasks').get();
    return { totalTasks: row?.n ?? 0 };
  }

  close() {
    if (this.db) {
      try { this.db.close(); } catch {}
      this.db = null;
    }
  }
}
