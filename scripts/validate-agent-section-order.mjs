#!/usr/bin/env node
/**
 * Enforce cache-friendly section order: stable sections first, volatile last.
 * Persona must come BEFORE Project Context (the latter is filled per-project).
 *
 * Anthropic prompt cache (5-min TTL) requires stable prefix to maximize hit rate.
 */
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import matter from 'gray-matter';

const REQUIRED_FIRST_SECTION = '## Persona';
const REQUIRED_LAST_SECTION = '## Project Context';

async function walk(dir) {
  const out = [];
  try {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...await walk(full));
      else if (entry.name.endsWith('.md')) out.push(full);
    }
  } catch {}
  return out;
}

export function checkAgentSectionOrder(rel, body) {
  const personaIdx = body.indexOf(REQUIRED_FIRST_SECTION);
  const projectIdx = body.indexOf(REQUIRED_LAST_SECTION);

  // tolerate older agents that don't have one or the other
  if (personaIdx === -1 || projectIdx === -1) return null;

  if (projectIdx < personaIdx) {
    return {
      file: rel,
      message: `'## Project Context' must come AFTER '## Persona' (cache-friendly order). Persona at ${personaIdx}, Project Context at ${projectIdx}.`,
    };
  }
  return null;
}

async function main() {
  const root = process.env.SUPERVIBE_PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const agents = (await walk(join(root, 'agents'))).filter(p => p.endsWith('.md'));
  const violations = [];

  for (const path of agents) {
    const raw = await readFile(path, 'utf8');
    const body = matter(raw).content;
    const v = checkAgentSectionOrder(path.slice(root.length + 1), body);
    if (v) violations.push(v);
  }

  if (violations.length > 0) {
    console.error('Section order violations:');
    for (const v of violations) console.error(`  - ${v.file}: ${v.message}`);
    process.exit(1);
  }
  console.log(`[OK] All ${agents.length} agents have cache-friendly section order`);
}

const isMainEntry = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}` ||
           fileURLToPath(import.meta.url) === process.argv[1];
  } catch { return false; }
})();
if (isMainEntry) await main();
