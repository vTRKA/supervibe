// Graph traversal queries over code_symbols + code_edges.
// Pure SQL via node:sqlite prepared statements. No external deps.
//
// Accepts either a bare symbol name (matches all symbols with that name)
// OR a full symbol ID like "src/auth.ts:function:login:5" for disambiguation.

function isFullId(s) {
  // Full ID has at least 3 colons (path:kind:name:line)
  return typeof s === 'string' && /^[^:]*:[^:]+:[^:]+:\d+$/.test(s);
}

/**
 * Find symbols that call (or import / extend / reference) a given target.
 * @param db        better-sqlite3 / node:sqlite DatabaseSync handle
 * @param target    symbol name OR full symbol ID
 * @param opts.kinds edge kinds to traverse (default ['calls'])
 * @returns Array<{id, path, kind, name, startLine, endLine, edgeKind}>
 */
export function findCallers(db, target, { kinds = ['calls'] } = {}) {
  const placeholders = kinds.map(() => '?').join(',');
  const isId = isFullId(target);

  const sql = isId
    ? `SELECT s.id, s.path, s.kind, s.name, s.start_line AS startLine, s.end_line AS endLine,
              e.kind AS edgeKind
       FROM code_edges e
       JOIN code_symbols s ON s.id = e.from_id
       WHERE e.to_id = ? AND e.kind IN (${placeholders})
       ORDER BY s.path, s.start_line`
    : `SELECT s.id, s.path, s.kind, s.name, s.start_line AS startLine, s.end_line AS endLine,
              e.kind AS edgeKind
       FROM code_edges e
       JOIN code_symbols s ON s.id = e.from_id
       WHERE e.to_name = ? AND e.kind IN (${placeholders})
       ORDER BY s.path, s.start_line`;

  return db.prepare(sql).all(target, ...kinds);
}

/**
 * Find what a given symbol calls (outgoing edges).
 * @returns Array<{toId, toName, kind}>
 */
export function findCallees(db, source, { kinds = ['calls'] } = {}) {
  const placeholders = kinds.map(() => '?').join(',');
  const isId = isFullId(source);

  const sql = isId
    ? `SELECT e.to_id AS toId, e.to_name AS toName, e.kind
       FROM code_edges e
       WHERE e.from_id = ? AND e.kind IN (${placeholders})
       ORDER BY e.to_name`
    : `SELECT e.to_id AS toId, e.to_name AS toName, e.kind
       FROM code_edges e
       JOIN code_symbols s ON s.id = e.from_id
       WHERE s.name = ? AND e.kind IN (${placeholders})
       ORDER BY e.to_name`;

  return db.prepare(sql).all(source, ...kinds);
}

/**
 * BFS neighborhood from a starting symbol (by name or ID).
 * Walks both incoming and outgoing edges.
 * @returns Array<{id, path, kind, name, startLine, endLine, distance}>
 */
export function neighborhood(db, start, {
  depth = 1,
  kinds = ['calls', 'imports', 'extends', 'implements']
} = {}) {
  const visited = new Map();

  const isId = isFullId(start);
  const startSyms = isId
    ? db.prepare('SELECT * FROM code_symbols WHERE id = ?').all(start)
    : db.prepare('SELECT * FROM code_symbols WHERE name = ?').all(start);
  if (startSyms.length === 0) return [];

  const queue = startSyms.map(s => ({ sym: s, dist: 0 }));
  const kindPh = kinds.map(() => '?').join(',');

  while (queue.length > 0) {
    const { sym, dist } = queue.shift();
    if (visited.has(sym.id)) continue;
    visited.set(sym.id, { sym, dist });
    if (dist >= depth) continue;

    // Outgoing
    const outRows = db.prepare(`
      SELECT s.* FROM code_edges e JOIN code_symbols s ON s.id = e.to_id
      WHERE e.from_id = ? AND e.kind IN (${kindPh})
    `).all(sym.id, ...kinds);
    for (const r of outRows) queue.push({ sym: r, dist: dist + 1 });

    // Incoming
    const inRows = db.prepare(`
      SELECT s.* FROM code_edges e JOIN code_symbols s ON s.id = e.from_id
      WHERE e.to_id = ? AND e.kind IN (${kindPh})
    `).all(sym.id, ...kinds);
    for (const r of inRows) queue.push({ sym: r, dist: dist + 1 });
  }

  return [...visited.values()]
    .filter(v => v.dist > 0) // exclude start symbols themselves
    .map(({ sym, dist }) => ({
      id: sym.id, path: sym.path, kind: sym.kind, name: sym.name,
      startLine: sym.start_line, endLine: sym.end_line, distance: dist
    }))
    .sort((a, b) => a.distance - b.distance || a.path.localeCompare(b.path));
}

/**
 * When a name has multiple matches, return the list for user-side disambiguation.
 * Useful when CLI receives bare name and wants to ask "which one?".
 */
export function disambiguate(db, name) {
  return db.prepare('SELECT * FROM code_symbols WHERE name = ? ORDER BY path, start_line').all(name);
}

/**
 * Top-K symbols by combined in-degree + out-degree.
 * Cheap centrality heuristic — captures highly-connected symbols.
 * @returns Array<{id, path, name, kind, inDegree, outDegree, totalDegree}>
 */
export function topSymbolsByDegree(db, { limit = 20, kind = null } = {}) {
  let sql = `
    SELECT s.id, s.path, s.name, s.kind,
           (SELECT COUNT(*) FROM code_edges WHERE to_id = s.id) AS inDegree,
           (SELECT COUNT(*) FROM code_edges WHERE from_id = s.id) AS outDegree
    FROM code_symbols s
  `;
  const params = [];
  if (kind) { sql += ' WHERE s.kind = ?'; params.push(kind); }
  sql += ` ORDER BY (
    (SELECT COUNT(*) FROM code_edges WHERE to_id = s.id) +
    (SELECT COUNT(*) FROM code_edges WHERE from_id = s.id)
  ) DESC LIMIT ?`;
  params.push(limit);
  const rows = db.prepare(sql).all(...params);
  return rows.map(r => ({
    id: r.id, path: r.path, name: r.name, kind: r.kind,
    inDegree: r.inDegree, outDegree: r.outDegree,
    totalDegree: r.inDegree + r.outDegree
  }));
}
