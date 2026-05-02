import { readdir, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { resolveSupervibeProjectRoot } from './lib/supervibe-plugin-root.mjs';
import { artifactRel, artifactRoot } from './lib/supervibe-artifact-roots.mjs';

const DEFAULT_CONFIG = {
  target: 'web',
  viewports: [
    { name: 'mobile', width: 375, height: 812 },
    { name: 'desktop', width: 1440, height: 900 },
  ],
  runtime: 'browser',
  migrated: true,
  note: 'Auto-migrated by scripts/migrate-prototype-configs.mjs. Verify viewports match this prototype intent.',
};

const RESERVED = new Set(['_design-system', '_brandbook']);

export async function migratePrototypeConfigs({ projectRoot }) {
  const protoRoot = artifactRoot(projectRoot, 'prototypes');
  const created = [];
  const skipped = [];

  let dirents;
  try {
    dirents = await readdir(protoRoot, { withFileTypes: true });
  } catch {
    return { created, skipped, note: `no ${artifactRel('prototypes')} directory — nothing to migrate` };
  }

  for (const entry of dirents) {
    if (!entry.isDirectory()) continue;
    if (RESERVED.has(entry.name)) continue;

    const cfgPath = join(protoRoot, entry.name, 'config.json');
    try {
      await access(cfgPath);
      skipped.push(entry.name);
      continue;
    } catch {
      // does not exist
    }

    await writeFile(cfgPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n', 'utf8');
    created.push(entry.name);
  }

  return { created, skipped };
}

export async function main() {
  const projectRoot = resolveSupervibeProjectRoot();
  const result = await migratePrototypeConfigs({ projectRoot });
  if (result.created.length) {
    console.log(`[migrate-prototype-configs] backfilled config.json for: ${result.created.join(', ')}`);
    console.log(`  Edit each ${artifactRel('prototypes', '<slug>/config.json')} to confirm target + viewports match design intent.`);
  } else if (result.skipped.length) {
    console.log(`[migrate-prototype-configs] all ${result.skipped.length} prototype(s) already have config.json`);
  } else {
    console.log(`[migrate-prototype-configs] ${result.note || 'nothing to do'}`);
  }
}

const isMain = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}` ||
           fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();
if (isMain) {
  await main();
}
