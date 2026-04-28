#!/usr/bin/env node
// CLI for the /evolve auto-router. Runs the deterministic state detector
// and prints a human-readable banner + JSON-structured report so the AI
// can both display findings and machine-read the proposed next command.
//
// Usage from /evolve slash command:
//   node $CLAUDE_PLUGIN_ROOT/scripts/evolve-detect.mjs
//
// Flags:
//   --json            print only the JSON, no banner (for scripting)
//   --project=<path>  override project root (defaults to cwd)

import { detectNextPhase } from './lib/evolve-state-detector.mjs';

const args = process.argv.slice(2);
const jsonOnly = args.includes('--json');
const projectArg = args.find(a => a.startsWith('--project='));
const projectRoot = projectArg ? projectArg.slice('--project='.length) : process.cwd();
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || projectRoot;

const result = await detectNextPhase(projectRoot, pluginRoot);

if (jsonOnly) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

console.log('=== Evolve State ===');
console.log(`Project:  ${projectRoot}`);
console.log(`Plugin:   ${pluginRoot}`);
console.log('');

for (const c of result.checks) {
  const flag = c.triggered ? '⚠' : '✓';
  console.log(`  ${flag} ${c.name.padEnd(28)} → ${c.evidence || c.error || 'no result'}`);
}

console.log('');
if (result.proposed.command) {
  console.log(`Proposed: ${result.proposed.command}`);
  console.log(`Why:      ${result.proposed.reason}`);
} else {
  console.log(`Proposed: (none) — ${result.proposed.reason}`);
}
console.log('');
console.log('Confidence: N/A    Rubric: read-only-research');
