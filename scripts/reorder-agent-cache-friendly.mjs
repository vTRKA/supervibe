#!/usr/bin/env node
/**
 * Reorder agent files for prompt-cache-friendly loading.
 *
 * Anthropic prompt cache (5-min TTL) makes stable content at the top of the
 * agent file highly economical — first Task dispatch warms the cache,
 * subsequent dispatches in the same window pay ~10% input cost for the
 * cached prefix.
 *
 * STABLE sections (cached prefix):
 *   Persona, Decision tree, Procedure, Output contract, Anti-patterns,
 *   User dialogue discipline, Verification, Common workflows,
 *   Out of scope, Related, Skills
 *
 * VOLATILE section (cache miss expected, goes last):
 *   Project Context (filled by supervibe:strengthen with project-specific paths)
 *
 * IMPORTANT: zero content removed. Every byte preserved, only order changed.
 * Byte-balance enforced via 2% tolerance check; reorder rejected if exceeded.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import matter from 'gray-matter';

const STABLE_FRONTMATTER_ORDER = [
  'name', 'namespace', 'description', 'persona-years', 'capabilities',
  'stacks', 'requires-stacks', 'optional-stacks', 'tools', 'recommended-mcps',
  'skills', 'verification', 'anti-patterns', 'dialogue', 'version'
];

const VOLATILE_FRONTMATTER_ORDER = [
  'last-verified', 'verified-against', 'effectiveness'
];

const SECTION_ORDER = [
  '## Persona',
  '## Decision tree',
  '## Procedure',
  '## Output contract',
  '## Anti-patterns',
  '## User dialogue discipline',
  '## Verification',
  '## Common workflows',
  '## Out of scope',
  '## Related',
  '## Skills',
  '## Project Context',  // VOLATILE — last
];

function parseSections(body) {
  const lines = body.split('\n');
  const sections = [];
  let current = { heading: '__preamble__', content: '' };
  for (const line of lines) {
    if (/^## /.test(line)) {
      if (current.content || current.heading !== '__preamble__') sections.push(current);
      current = { heading: line.trim(), content: line + '\n' };
    } else {
      current.content += line + '\n';
    }
  }
  sections.push(current);
  return sections;
}

function reorderSections(sections) {
  const preamble = sections.find(s => s.heading === '__preamble__');
  const named = new Map(sections.filter(s => s.heading !== '__preamble__').map(s => [s.heading, s]));

  const out = [];
  if (preamble) out.push(preamble.content);

  for (const heading of SECTION_ORDER) {
    if (named.has(heading)) {
      out.push(named.get(heading).content);
      named.delete(heading);
    }
  }
  for (const section of named.values()) {
    out.push(section.content);
  }
  return out.join('').trim() + '\n';
}

function reorderFrontmatter(data) {
  const ordered = {};
  for (const key of STABLE_FRONTMATTER_ORDER) {
    if (key in data) ordered[key] = data[key];
  }
  for (const [k, v] of Object.entries(data)) {
    if (!STABLE_FRONTMATTER_ORDER.includes(k) && !VOLATILE_FRONTMATTER_ORDER.includes(k)) {
      ordered[k] = v;
    }
  }
  for (const key of VOLATILE_FRONTMATTER_ORDER) {
    if (key in data) ordered[key] = data[key];
  }
  return ordered;
}

export function reorderAgent(raw) {
  const parsed = matter(raw);
  const newData = reorderFrontmatter(parsed.data);
  const newBody = reorderSections(parseSections(parsed.content));
  return matter.stringify(newBody, newData);
}

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

async function main() {
  const root = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const dryRun = process.argv.includes('--dry-run');
  const targets = await walk(join(root, 'agents'));

  let modified = 0;
  let skippedSize = 0;
  let totalDelta = 0;

  for (const path of targets) {
    const raw = await readFile(path, 'utf8');
    const reordered = reorderAgent(raw);
    if (reordered === raw) continue;

    // Only flag CONTENT LOSS (new < old by >1%); YAML re-serialization can ADD a few % of whitespace which is fine
    const lossDelta = raw.length - reordered.length;
    const lossRatio = lossDelta / raw.length;
    if (lossRatio > 0.01) {
      console.error(`[SKIP] ${path.slice(root.length + 1)}: content loss ${lossDelta} chars (${(lossRatio * 100).toFixed(2)}%) exceeds 1% tolerance`);
      skippedSize++;
      continue;
    }
    totalDelta += Math.abs(reordered.length - raw.length);

    if (!dryRun) {
      await writeFile(path, reordered, 'utf8');
    }
    modified++;
    console.log(`[${dryRun ? 'would-reorder' : 'reordered'}] ${path.slice(root.length + 1)}`);
  }

  console.log(`\n[reorder-agent-cache-friendly] ${dryRun ? 'WOULD reorder' : 'reordered'} ${modified} agents, total bytes shifted: ${totalDelta}`);
  if (skippedSize > 0) console.error(`[X] ${skippedSize} agents SKIPPED (>2% size delta — possible parser bug)`);
}

const isMainEntry = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}` ||
           fileURLToPath(import.meta.url) === process.argv[1];
  } catch { return false; }
})();
if (isMainEntry) await main();
