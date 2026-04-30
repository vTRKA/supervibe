#!/usr/bin/env node
/**
 * Multi-agent regression suite runner.
 * Reads canonical-tasks.json (5 agents x 8 tasks = 40 dispatches).
 * For each task, prints a structured prompt for the user to dispatch the agent
 * via Task tool, then expects the output pasted back via stdin.
 *
 * Saves outputs to .supervibe/audits/regression-suite/<phase>/<agent>-<idx>.md.
 *
 * Compare phases: scripts/lib/regression-scorer.mjs::diffPhases()
 */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const TASKS_PATH = 'tests/fixtures/regression-suite/canonical-tasks.json';

async function loadTasks() {
  const root = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const raw = await readFile(join(root, TASKS_PATH), 'utf8');
  return JSON.parse(raw);
}

async function dispatchManual(agent, task) {
  // Print prompt for user; capture stdin until EOF or sentinel
  process.stdout.write(`\n=== DISPATCH ${agent} ===\n${task}\n=== END TASK ===\nPaste agent output below, then Ctrl-D (or empty line + Ctrl-D on Windows):\n\n`);

  const rl = createInterface({ input: process.stdin });
  let lines = [];
  for await (const line of rl) lines.push(line);
  return lines.join('\n');
}

async function main() {
  const phase = process.argv[2];
  if (!phase) {
    console.error('Usage: node regression-suite.mjs <phase>');
    console.error('Examples: regression-suite.mjs baseline | regression-suite.mjs phase1 | regression-suite.mjs phase4');
    process.exit(2);
  }

  const root = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const tasks = await loadTasks();
  const outDir = join(root, '.supervibe', 'audits', 'regression-suite', phase);
  await mkdir(outDir, { recursive: true });

  let total = 0;
  for (const [agent, agentTasks] of Object.entries(tasks)) {
    if (agent.startsWith('_')) continue;
    for (const [idx, task] of agentTasks.entries()) {
      const outPath = join(outDir, `${agent}-${idx}.md`);

      // Skip if already done (resume-friendly)
      try {
        await access(outPath);
        console.log(`[skip] ${agent}-${idx}.md exists`);
        total++;
        continue;
      } catch {}

      const output = await dispatchManual(agent, task);
      await writeFile(outPath, `# ${agent} task ${idx}\n\n## Task\n${task}\n\n## Output\n\n${output}\n`);
      total++;
      console.log(`[saved] ${outPath}`);
    }
  }

  console.log(`\n[regression-suite] Saved ${total} outputs to ${outDir}`);
  console.log(`Compare against baseline: node scripts/lib/regression-scorer.mjs --baseline baseline --current ${phase}`);
}

const isMainEntry = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}` ||
           fileURLToPath(import.meta.url) === process.argv[1];
  } catch { return false; }
})();
if (isMainEntry) await main();
