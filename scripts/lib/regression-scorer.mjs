#!/usr/bin/env node
/**
 * Score a regression suite output against the baseline.
 * Compares per-task confidence + evidence references.
 * Flags regressions where new < old * 0.95.
 */
import { resolveSupervibePluginRoot } from './supervibe-plugin-root.mjs';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const FILE_LINE_RE = /[\w/.-]+\.\w+:\d+/g;
const CONFIDENCE_RE = /Confidence:\s*([\d.]+)/i;

export async function diffPhases({ baselinePath, currentPath, gate = 0.95 }) {
  let baselineFiles;
  try {
    baselineFiles = await readdir(baselinePath);
  } catch {
    return { regressions: [{ kind: 'baseline-missing', path: baselinePath }], compared: 0 };
  }

  const regressions = [];
  let compared = 0;
  for (const file of baselineFiles) {
    if (!file.endsWith('.md')) continue;
    const oldOutput = await readFile(join(baselinePath, file), 'utf8');
    let newOutput;
    try {
      newOutput = await readFile(join(currentPath, file), 'utf8');
    } catch {
      regressions.push({ kind: 'missing-current-output', file });
      continue;
    }
    compared++;

    const oldConf = CONFIDENCE_RE.exec(oldOutput);
    const newConf = CONFIDENCE_RE.exec(newOutput);
    if (oldConf && newConf) {
      const oldScore = parseFloat(oldConf[1]);
      const newScore = parseFloat(newConf[1]);
      if (newScore < oldScore * gate) {
        regressions.push({
          kind: 'confidence-regression',
          file,
          old: oldScore,
          new: newScore,
          delta: newScore - oldScore,
        });
      }
    }

    const oldRefs = (oldOutput.match(FILE_LINE_RE) || []).length;
    const newRefs = (newOutput.match(FILE_LINE_RE) || []).length;
    if (oldRefs > 5 && newRefs < oldRefs * 0.7) {
      regressions.push({
        kind: 'evidence-regression',
        file,
        oldRefs,
        newRefs,
      });
    }
  }
  return { regressions, compared };
}

async function main() {
  const args = process.argv.slice(2);
  const baselineIdx = args.indexOf('--baseline');
  const currentIdx = args.indexOf('--current');
  if (baselineIdx === -1 || currentIdx === -1) {
    console.error('Usage: node regression-scorer.mjs --baseline <phase> --current <phase>');
    process.exit(2);
  }
  const root = resolveSupervibePluginRoot();
  const baselinePhase = args[baselineIdx + 1];
  const currentPhase = args[currentIdx + 1];
  const baselinePath = join(root, '.supervibe', 'audits', 'regression-suite', baselinePhase);
  const currentPath = join(root, '.supervibe', 'audits', 'regression-suite', currentPhase);

  const { regressions, compared } = await diffPhases({ baselinePath, currentPath });
  console.log(`Compared ${compared} task outputs (${baselinePhase} vs ${currentPhase})`);

  if (regressions.length === 0) {
    console.log('[OK] No regressions');
    return;
  }
  console.error(`[X] ${regressions.length} regression(s):`);
  for (const r of regressions) console.error(`  - ${JSON.stringify(r)}`);
  process.exit(1);
}

const isMainEntry = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}` ||
           fileURLToPath(import.meta.url) === process.argv[1];
  } catch { return false; }
})();
if (isMainEntry) await main();
