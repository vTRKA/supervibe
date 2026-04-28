import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function readCursor(cursorPath) {
  try {
    const raw = await readFile(cursorPath, 'utf8');
    const obj = JSON.parse(raw);
    return Number.isFinite(obj.offset) ? obj.offset : 0;
  } catch {
    return 0;
  }
}

export async function writeCursor(cursorPath, offset) {
  await mkdir(dirname(cursorPath), { recursive: true });
  await writeFile(cursorPath, JSON.stringify({ offset, updated: new Date().toISOString() }) + '\n', 'utf8');
}

export async function drainNewEntries({ queuePath, cursorPath }) {
  let size;
  try { size = (await stat(queuePath)).size; } catch { return { entries: [], newOffset: 0 }; }
  const cursor = await readCursor(cursorPath);
  if (cursor >= size) return { entries: [], newOffset: cursor };

  const raw = await readFile(queuePath, 'utf8');
  const slice = raw.slice(cursor);
  const lines = slice.split('\n').filter(l => l.trim().length > 0);
  const entries = [];
  for (const line of lines) {
    try { entries.push(JSON.parse(line)); } catch {}
  }
  return { entries, newOffset: size };
}
