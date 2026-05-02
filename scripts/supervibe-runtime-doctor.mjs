#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { hasNodeSqliteSupport } from './lib/node-sqlite-runtime.mjs';

export function buildRuntimeDoctorReport({
  rootDir = process.cwd(),
  dryRun = true,
} = {}) {
  const packageJsonPresent = existsSync(join(rootDir, 'package.json'));
  const stackPacksPresent = existsSync(join(rootDir, 'stack-packs'));
  const registryPresent = existsSync(join(rootDir, 'registry.yaml'));
  const devServer = packageJsonPresent ? 'npm run dev when project defines it' : 'not detected';
  const nextRepair = !hasNodeSqliteSupport()
    ? 'Install Node.js 22.5+ before running Code RAG/CodeGraph.'
    : (!registryPresent && stackPacksPresent ? 'Run npm run registry:build.' : 'Run npm run supervibe:status -- --index-health --no-gc-hints.');

  return {
    pass: hasNodeSqliteSupport(),
    mode: dryRun ? 'dry-run' : 'inspect',
    nodeSqlite: hasNodeSqliteSupport() ? 'ready' : 'missing',
    packageJsonPresent,
    stackPacks: stackPacksPresent ? 'present' : 'missing',
    scaffoldReadiness: packageJsonPresent ? 'project-manifest-present' : 'empty-or-non-node-project',
    devServer,
    smokeTest: dryRun ? 'not-run-dry-run' : 'manual',
    browserMcp: 'optional',
    nextRepair,
  };
}

export function formatRuntimeDoctorReport(report) {
  return [
    'SUPERVIBE_RUNTIME_DOCTOR',
    `MODE: ${report.mode}`,
    `PASS: ${report.pass ? 'true' : 'false'}`,
    `NODE_SQLITE: ${report.nodeSqlite}`,
    `PACKAGE_JSON: ${report.packageJsonPresent ? 'present' : 'missing'}`,
    `STACK_PACKS: ${report.stackPacks}`,
    `SCAFFOLD_READY: ${report.scaffoldReadiness}`,
    `DEV_SERVER: ${report.devServer}`,
    `SMOKE_TEST: ${report.smokeTest}`,
    `BROWSER_MCP: ${report.browserMcp}`,
    `NEXT_REPAIR: ${report.nextRepair}`,
  ].join('\n');
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const report = buildRuntimeDoctorReport({ dryRun: args.has('--dry-run') || !args.has('--apply') });
  console.log(formatRuntimeDoctorReport(report));
  if (!report.pass) process.exitCode = 2;
}

const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('supervibe-runtime-doctor.mjs');
if (isMain) main().catch((err) => {
  console.error(`supervibe-runtime-doctor error: ${err.message}`);
  process.exit(1);
});
