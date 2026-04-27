// Cheap mtime-based scan: catches files that changed BETWEEN sessions
// (external editor, git pull, CI). Runs at SessionStart after the existing
// "skip if DB present" path. Pure stat() — does not read file content
// unless mtime indicates a change.

import { stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';

function toAbs(projectRoot, relPath) {
  return isAbsolute(relPath) ? relPath : join(projectRoot, relPath);
}

/**
 * Compare every code_files row to disk mtime. Reindex changed, remove deleted.
 * Returns { reindexed, removed, scanned, errors }.
 */
export async function scanCodeChanges(codeStore, projectRoot) {
  const rows = codeStore.db.prepare('SELECT path, indexed_at FROM code_files').all();
  const counts = { reindexed: 0, removed: 0, scanned: rows.length, errors: 0 };

  for (const row of rows) {
    const abs = toAbs(projectRoot, row.path);
    if (!existsSync(abs)) {
      try {
        await codeStore.removeFile(abs);
        counts.removed++;
      } catch { counts.errors++; }
      continue;
    }
    try {
      const s = await stat(abs);
      const indexedMs = Date.parse(row.indexed_at + 'Z'); // SQLite datetime() is UTC
      if (s.mtimeMs > indexedMs) {
        const r = await codeStore.indexFile(abs);
        if (r.indexed) counts.reindexed++;
      }
    } catch { counts.errors++; }
  }
  return counts;
}

/**
 * Same for memory entries. Returns { reindexed, removed, scanned, errors }.
 */
export async function scanMemoryChanges(memoryStore, projectRoot) {
  const rows = memoryStore.db.prepare('SELECT file, indexed_at FROM entries').all();
  const counts = { reindexed: 0, removed: 0, scanned: rows.length, errors: 0 };

  for (const row of rows) {
    const abs = toAbs(projectRoot, row.file);
    if (!existsSync(abs)) {
      try {
        const r = await memoryStore.removeEntryByPath(abs);
        if (r) counts.removed++;
      } catch { counts.errors++; }
      continue;
    }
    try {
      const s = await stat(abs);
      const indexedMs = row.indexed_at ? Date.parse(row.indexed_at + 'Z') : 0;
      if (s.mtimeMs > indexedMs) {
        const r = await memoryStore.incrementalUpdate(abs);
        if (r.indexed) counts.reindexed++;
      }
    } catch { counts.errors++; }
  }
  return counts;
}
