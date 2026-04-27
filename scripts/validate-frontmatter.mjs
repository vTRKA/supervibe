#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, sep } from 'node:path';
import matter from 'gray-matter';
import { validateFrontmatter } from './lib/parse-frontmatter.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

async function* walk(dirPath) {
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const entry of entries) {
    const childPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      yield* walk(childPath);
    } else {
      yield childPath;
    }
  }
}

function detectType(path) {
  const norm = path.split(sep).join('/');
  if (norm.includes('/agents/')) return 'agent';
  if (norm.endsWith('SKILL.md')) return 'skill';
  if (norm.includes('/rules/')) return 'rule';
  return null;
}

async function main() {
  let failed = 0;
  let checked = 0;
  for (const dir of ['agents', 'skills', 'rules']) {
    for await (const path of walk(join(ROOT, dir))) {
      if (!path.endsWith('.md')) continue;
      if (path.endsWith('.gitkeep')) continue;
      const type = detectType(path);
      if (!type) continue;
      const content = await readFile(path, 'utf8');
      const { data } = matter(content);
      const result = validateFrontmatter(data, type);
      checked += 1;
      if (result.pass) {
        console.log(`OK   ${type.padEnd(5)} ${path}`);
      } else {
        console.log(`FAIL ${type.padEnd(5)} ${path}: missing [${result.missing.join(', ')}]`);
        failed += 1;
      }
    }
  }

  if (checked === 0) {
    console.log('No agent/skill/rule files found yet.');
    process.exit(0);
  }

  if (failed > 0) {
    console.log(`\n${failed}/${checked} failed`);
    process.exit(1);
  }
  console.log(`\nAll ${checked} files passed`);
}

main().catch(err => { console.error(err); process.exit(2); });
