#!/usr/bin/env node
// CLI: query upstream for newer plugin versions and update the local cache.
// Run via `npm run evolve:upgrade-check` (foreground, prints result) or
// auto-spawned in background by SessionStart hook (--background, silent).

import { performUpstreamCheck, readUpgradeCache } from './lib/upgrade-check.mjs';

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
const isBackground = process.argv.includes('--background');

async function main() {
  const result = await performUpstreamCheck(PLUGIN_ROOT);

  if (isBackground) return; // silent: cache is the only side-effect

  if (result.error) {
    console.log(`[evolve:upgrade-check] could not check upstream: ${result.error}`);
    return;
  }

  if (result.behind > 0) {
    const tagInfo = result.latestTag ? ` (latest tag: ${result.latestTag})` : '';
    console.log(`[evolve:upgrade-check] ⬆ ${result.behind} commit(s) behind upstream${tagInfo}`);
    console.log(`[evolve:upgrade-check] run \`npm run evolve:upgrade\` to apply`);
  } else {
    console.log(`[evolve:upgrade-check] ✓ up to date with upstream`);
  }
}

main().catch(() => { /* errors persisted in cache */ });
