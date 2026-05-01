import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import matter from 'gray-matter';
import { getHostAdapterMatrix } from './supervibe-host-adapters.mjs';

async function walkMarkdown(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walkMarkdown(path));
    else if (entry.name.endsWith('.md')) out.push(path);
  }
  return out;
}

export async function listKnownAgentIds({ rootDir = process.cwd(), extraDirs = [] } = {}) {
  const dirs = [
    join(rootDir, 'agents'),
    ...getHostAdapterMatrix().map((adapter) => join(rootDir, adapter.agentsFolder)),
    ...extraDirs,
  ];
  const ids = new Set();

  for (const dir of dirs) {
    for (const file of await walkMarkdown(dir)) {
      const fallback = basename(file, '.md');
      try {
        const parsed = matter(await readFile(file, 'utf8'));
        ids.add(parsed.data.name || fallback);
      } catch {
        ids.add(fallback);
      }
    }
  }

  return ids;
}
