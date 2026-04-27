#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import matter from 'gray-matter';
import { checkTriggerClarity } from './lib/trigger-clarity.mjs';

const SKILLS_DIR = fileURLToPath(new URL('../skills/', import.meta.url));

async function findSkillFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findSkillFiles(path));
    } else if (entry.name === 'SKILL.md') {
      files.push(path);
    }
  }
  return files;
}

async function main() {
  const skillFiles = await findSkillFiles(SKILLS_DIR);

  if (skillFiles.length === 0) {
    console.log('No SKILL.md files found, nothing to lint.');
    process.exit(0);
  }

  let failed = 0;
  for (const file of skillFiles) {
    const content = await readFile(file, 'utf8');
    const { data } = matter(content);
    const description = data.description || '';
    const check = checkTriggerClarity(description);
    if (check.pass) {
      console.log(`OK   ${file}`);
    } else {
      console.log(`FAIL ${file}: ${check.reason}`);
      failed += 1;
    }
  }

  if (failed > 0) {
    console.log(`\n${failed} skill(s) failed trigger-clarity check`);
    process.exit(1);
  }
  console.log(`\nAll ${skillFiles.length} skill(s) passed`);
}

main().catch(err => { console.error(err); process.exit(2); });
