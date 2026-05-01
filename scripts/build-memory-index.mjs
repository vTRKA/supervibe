#!/usr/bin/env node
// Memory v2 builder: SQLite FTS5 with BM25 ranking + tag table.
// Replaces v1 (markdown+grep+JSON index).
// Idempotent: clears + reindexes from filesystem source-of-truth.

import { curateProjectMemory, formatMemoryCurationReport } from './lib/supervibe-memory-curator.mjs';
import { createWorkspaceNamespace } from './lib/supervibe-workspace-isolation.mjs';

const PROJECT_ROOT = process.cwd();
const args = parseArgs(process.argv.slice(2));

async function main() {
  const result = await curateProjectMemory({
    rootDir: PROJECT_ROOT,
    rebuildSqlite: true,
    useEmbeddings: Boolean(args.semantic),
    now: args.now || new Date().toISOString(),
  });
  console.log(`Memory index built (SQLite FTS5): ${result.sqliteEntries} entries indexed`);
  console.log(`Workspace namespace: ${createWorkspaceNamespace({ projectRoot: PROJECT_ROOT }).workspaceId}`);
  console.log(formatMemoryCurationReport(result));

  if (result.sqliteEntries === 0) {
    console.log('Memory directory is empty. Add entries via supervibe:add-memory skill.');
  }
  if (!result.pass) process.exitCode = 2;
}

main().catch(err => { console.error('build-memory-index error:', err); process.exit(1); });

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--semantic") parsed.semantic = true;
    else if (arg.startsWith("--now=")) parsed.now = arg.slice("--now=".length);
    else if (arg === "--now") parsed.now = argv[++i];
  }
  return parsed;
}
