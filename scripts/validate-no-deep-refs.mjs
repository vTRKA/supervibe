#!/usr/bin/env node
/**
 * Anthropic best practice: skill references must be 1-deep, never 2-deep.
 * Reason: Claude does `head -100` previews on transitive refs and misses content.
 *
 * Rule: skills/<name>/SKILL.md may reference skills/<name>/references/<file>.md.
 * Those reference files MUST NOT reference other refs (1-deep enforcement).
 */
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const REF_LINK_RE = /(?:references|refs)[\\/][\w./-]+\.md/g;

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

export async function checkRefFile(refPath, root) {
  const violations = [];
  const raw = await readFile(refPath, 'utf8');
  const refs = raw.match(REF_LINK_RE) || [];
  for (const ref of refs) {
    violations.push({
      file: refPath.slice(root.length + 1),
      target: ref,
      message: 'references/ files must not reference other refs (Anthropic 1-deep rule)',
    });
  }
  return violations;
}

export async function findAllRefFiles(skillsDir) {
  const all = await walk(skillsDir);
  return all.filter(p => /[\\/](references|refs)[\\/]/.test(p));
}

async function main() {
  const root = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const skillsDir = join(root, 'skills');
  const refFiles = await findAllRefFiles(skillsDir);

  let totalViolations = 0;
  for (const path of refFiles) {
    const violations = await checkRefFile(path, root);
    for (const v of violations) {
      console.error(`[deep-ref] ${v.file} -> ${v.target}: ${v.message}`);
      totalViolations++;
    }
  }

  if (totalViolations > 0) {
    console.error(`\n[X] ${totalViolations} deep-reference violation(s)`);
    process.exit(1);
  }
  console.log(`[OK] All ${refFiles.length} reference file(s) are 1-deep`);
}

const isMainEntry = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}` ||
           fileURLToPath(import.meta.url) === process.argv[1];
  } catch { return false; }
})();
if (isMainEntry) await main();
