#!/usr/bin/env node
// Validate that every agent's Output contract section contains the canonical footer.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

const PROJECT_ROOT = process.cwd();
// Accept real digits, N/A, or template placeholders (<N>, <N>.<dd>, <score>) — Output contract is documentation.
const FOOTER_PATTERN = /confidence\s*[:=]\s*(?:\d+(?:\.\d+)?\s*\/\s*10|N\/A|n\/a|<[\w.<>-]+>(?:\.<[\w.<>-]+>)?\s*\/\s*10)/i;
const RUBRIC_PATTERN = /rubric\s*[:=]\s*[\w<>-]+/i;

async function findAllAgentFiles() {
  const result = [];
  const dirs = ['agents/_core', 'agents/_meta', 'agents/_design', 'agents/_ops', 'agents/_product'];
  for (const dir of dirs) {
    try {
      const files = await readdir(join(PROJECT_ROOT, dir));
      for (const f of files.filter(f => f.endsWith('.md'))) {
        result.push(join(dir, f));
      }
    } catch {}
  }
  const stacksDir = join(PROJECT_ROOT, 'agents', 'stacks');
  try {
    const stacks = await readdir(stacksDir);
    for (const s of stacks) {
      try {
        const files = await readdir(join(stacksDir, s));
        for (const f of files.filter(f => f.endsWith('.md'))) {
          result.push(join('agents', 'stacks', s, f));
        }
      } catch {}
    }
  } catch {}
  return result;
}

export function hasCanonicalFooter(content) {
  const sectionMatch = content.match(/##\s*Output contract([\s\S]*?)(?=\n##\s|$)/i);
  if (!sectionMatch) return { ok: false, reason: 'no-output-contract' };
  const section = sectionMatch[1];
  if (!FOOTER_PATTERN.test(section)) return { ok: false, reason: 'no-confidence-line' };
  if (!RUBRIC_PATTERN.test(section)) return { ok: false, reason: 'no-rubric-line' };
  return { ok: true };
}

async function main() {
  const files = await findAllAgentFiles();
  const failed = [];
  for (const file of files) {
    const content = await readFile(join(PROJECT_ROOT, file), 'utf8');
    const result = hasCanonicalFooter(content);
    if (!result.ok) {
      failed.push({ file, reason: result.reason });
    }
  }
  if (failed.length > 0) {
    console.error(`${failed.length} agent(s) missing canonical output footer:`);
    for (const f of failed) console.error(`  ${f.file}: ${f.reason}`);
    process.exit(1);
  }
  console.log(`All ${files.length} agents have canonical Output contract footer ✓`);
}

const thisPath = fileURLToPath(import.meta.url);
const argvPath = process.argv[1] ? realpathSync(process.argv[1]) : '';
if (thisPath === argvPath) {
  main().catch(err => { console.error(err); process.exit(1); });
}
