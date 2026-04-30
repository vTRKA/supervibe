#!/usr/bin/env node
// Upgrade the Supervibe plugin to the latest commit on the tracked branch.
// Cross-platform (Windows / macOS / Linux). Pure Node — no shell tricks.
//
// Steps:
//   1. Read current version from .claude-plugin/plugin.json
//   2. git fetch + git pull --ff-only (refuses to clobber local commits)
//   3. git lfs pull (model + grammars)
//   4. npm install (pin versions from lockfile)
//   5. npm run check (must stay green before declaring success)
//   6. Read new version, print diff banner

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  SQLITE_NODE_MIN_VERSION,
  formatNodeRuntimeMode,
  getNodeRuntimeCapability,
} from './lib/node-runtime-requirements.mjs';

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT
  || process.cwd();

function manifestVersion(root) {
  try {
    return JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version;
  } catch { return null; }
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: PLUGIN_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  });
  return r.status === 0;
}

function runQuiet(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: PLUGIN_ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
  return { ok: r.status === 0, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

function fail(msg) {
  console.error(`\n[supervibe:upgrade] ${msg}`);
  process.exit(1);
}

console.log(`[supervibe:upgrade] plugin root: ${PLUGIN_ROOT}`);

const nodeCapability = getNodeRuntimeCapability();
if (!nodeCapability.installSupported) {
  fail(`${formatNodeRuntimeMode()} Run install.sh/install.ps1 and approve the Node.js upgrade prompt, or install Node.js ${SQLITE_NODE_MIN_VERSION}+ manually.`);
}

if (!existsSync(join(PLUGIN_ROOT, '.git'))) {
  fail('Not a git checkout — upgrade only works for symlink/clone installs. Re-clone from upstream.');
}

const before = manifestVersion(PLUGIN_ROOT);
console.log(`[supervibe:upgrade] current version: ${before || 'unknown'}`);

// Refuse to upgrade with uncommitted changes — protects user mods
const status = runQuiet('git', ['status', '--porcelain']);
if (status.ok && status.stdout) {
  console.error('[supervibe:upgrade] uncommitted changes in plugin dir:');
  console.error(status.stdout);
  fail('Commit/stash your changes in the plugin checkout first, then re-run.');
}

console.log('[supervibe:upgrade] git fetch + pull --ff-only ...');
if (!run('git', ['fetch', '--tags', '--prune'])) fail('git fetch failed');
if (!run('git', ['pull', '--ff-only'])) fail('git pull --ff-only failed (local diverged from upstream)');

const lfsCheck = runQuiet('git', ['lfs', 'version']);
if (lfsCheck.ok) {
  console.log('[supervibe:upgrade] git lfs pull ...');
  run('git', ['lfs', 'pull']);
} else {
  console.log('[supervibe:upgrade] git-lfs not installed; skipping (model will lazy-fetch from HF on first use)');
}

console.log('[supervibe:upgrade] npm install ...');
if (!run('npm', ['install'])) fail('npm install failed');

console.log('[supervibe:upgrade] npm run check ...');
if (!run('npm', ['run', 'check'])) fail('npm run check failed — upgrade applied but tests are red. Investigate before using.');

const after = manifestVersion(PLUGIN_ROOT);

// Refresh upstream-check cache so SessionStart doesn't keep showing "behind"
try {
  const { performUpstreamCheck } = await import('./lib/upgrade-check.mjs');
  await performUpstreamCheck(PLUGIN_ROOT);
} catch { /* non-fatal */ }

console.log('\n=================================================');
if (before === after) {
  console.log(`[supervibe:upgrade] already up to date (v${after})`);
} else {
  console.log(`[supervibe:upgrade] ✓ upgraded ${before} → ${after}`);
  console.log(`[supervibe:upgrade] restart Claude Code to pick up the new plugin code.`);
  console.log(`[supervibe:upgrade] Each project will see [supervibe] ⬆ on its next session start.`);
}
console.log('=================================================');
