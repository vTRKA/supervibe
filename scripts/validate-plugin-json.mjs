#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const ALLOWED_FIELDS = new Set([
  'name', 'description', 'version', 'author', 'homepage', 'repository', 'license', 'keywords', 'agents', 'skills', 'commands', 'hooks'
]);
const REQUIRED_FIELDS = ['name', 'description', 'version'];

const MANIFEST_PATH = new URL('../.claude-plugin/plugin.json', import.meta.url);

async function main() {
  let content;
  try {
    content = await readFile(MANIFEST_PATH, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error('FAIL: .claude-plugin/plugin.json not found');
      process.exit(1);
    }
    throw err;
  }

  let data;
  try {
    data = JSON.parse(content);
  } catch (err) {
    console.error(`FAIL: plugin.json is not valid JSON: ${err.message}`);
    process.exit(1);
  }

  const missing = REQUIRED_FIELDS.filter(f => !(f in data));
  if (missing.length > 0) {
    console.error(`FAIL: plugin.json missing required fields: ${missing.join(', ')}`);
    process.exit(1);
  }

  const unknown = Object.keys(data).filter(k => !ALLOWED_FIELDS.has(k));
  if (unknown.length > 0) {
    console.error(`FAIL: plugin.json contains unknown fields: ${unknown.join(', ')}`);
    console.error(`Allowed: ${[...ALLOWED_FIELDS].join(', ')}`);
    process.exit(1);
  }

  console.log(`OK plugin.json valid (${Object.keys(data).length} fields)`);
}

main().catch(err => { console.error(err); process.exit(2); });
