#!/usr/bin/env node
// Upgrade the Supervibe plugin to the latest commit on the tracked branch.
// Cross-platform (Windows / macOS / Linux). Pure Node - no shell tricks.
//
// Steps:
//   1. Read current version from .claude-plugin/plugin.json
//   2. Refuse tracked local edits, then clean untracked/ignored stale files
//   3. git fetch + git pull --ff-only (refuses to clobber local commits)
//   4. git lfs pull (model + grammars)
//   5. npm ci (pin versions from lockfile without dirtying package-lock.json)
//   6. npm run registry:build (generated registry.yaml is intentionally not committed)
//   7. npm run check (must stay green before declaring success)
//   8. npm run supervibe:install-doctor (post-upgrade lifecycle audit)
//   9. Read new version, print diff banner

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

function commandForPlatform(cmd) {
  if (process.platform !== 'win32') return cmd;
  if (cmd === 'npm' || cmd === 'npx') return `${cmd}.cmd`;
  return cmd;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(commandForPlatform(cmd), args, {
    cwd: PLUGIN_ROOT,
    stdio: 'inherit',
    ...opts,
  });
  return r.status === 0;
}

function runGitNoLfsSmudge(args) {
  return run('git', [
    '-c',
    'filter.lfs.smudge=',
    '-c',
    'filter.lfs.required=false',
    ...args,
  ], {
    env: {
      ...process.env,
      GIT_LFS_SKIP_SMUDGE: '1',
    },
  });
}

function runQuiet(cmd, args) {
  const r = spawnSync(commandForPlatform(cmd), args, { cwd: PLUGIN_ROOT, encoding: 'utf8' });
  return { ok: r.status === 0, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

function statusLines(stdout) {
  return String(stdout || '').split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
}

function isPackageLockOnlyDrift(lines) {
  return lines.length === 1 && /^[ MARCUD?!]{2} package-lock\.json$/.test(lines[0]);
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
  fail('Not a git checkout - upgrade only works for symlink/clone installs. Re-clone from upstream.');
}

const before = manifestVersion(PLUGIN_ROOT);
console.log(`[supervibe:upgrade] current version: ${before || 'unknown'}`);

// Refuse tracked local edits; clean untracked/ignored stale files from the managed checkout.
let status = runQuiet('git', ['status', '--porcelain']);
let dirty = status.ok ? statusLines(status.stdout) : [];
let trackedDirty = dirty.filter((line) => !line.startsWith('?? '));
let untrackedDirty = dirty.filter((line) => line.startsWith('?? '));
if (isPackageLockOnlyDrift(trackedDirty)) {
  console.log('[supervibe:upgrade] restoring package-lock.json drift from previous installer npm install');
  if (!run('git', ['checkout', '--', 'package-lock.json'])) fail('failed to restore package-lock.json drift');
  status = runQuiet('git', ['status', '--porcelain']);
  dirty = status.ok ? statusLines(status.stdout) : [];
  trackedDirty = dirty.filter((line) => !line.startsWith('?? '));
  untrackedDirty = dirty.filter((line) => line.startsWith('?? '));
}
if (trackedDirty.length > 0) {
  console.error('[supervibe:upgrade] uncommitted changes in plugin dir:');
  console.error(trackedDirty.join('\n'));
  fail('Commit/stash tracked changes in the plugin checkout first, then re-run.');
}
if (untrackedDirty.length > 0) {
  console.log(`[supervibe:upgrade] removing ${untrackedDirty.length} untracked stale file(s) from managed plugin checkout ...`);
}

console.log('[supervibe:upgrade] clean managed checkout (git clean -ffdx) ...');
if (!run('git', [
  'clean',
  '-ffdx',
  '-e',
  '.claude-plugin/.auto-update.json',
  '-e',
  '.claude-plugin/.auto-update.lock',
])) fail('git clean failed');

console.log('[supervibe:upgrade] git fetch + pull --ff-only ...');
if (!runGitNoLfsSmudge(['fetch', '--tags', '--prune'])) fail('git fetch failed');
if (!runGitNoLfsSmudge(['pull', '--ff-only'])) fail('git pull --ff-only failed (local diverged from upstream)');

const lfsCheck = runQuiet('git', ['lfs', 'version']);
if (lfsCheck.ok) {
  console.log('[supervibe:upgrade] git lfs pull ...');
  run('git', ['lfs', 'pull']);
} else {
  console.log('[supervibe:upgrade] git-lfs not installed; skipping (model will lazy-fetch from HF on first use)');
}

console.log('[supervibe:upgrade] npm ci ...');
if (!run('npm', ['ci', '--no-audit', '--no-fund'])) fail('npm ci failed');

console.log('[supervibe:upgrade] npm run registry:build ...');
if (!run('npm', ['run', 'registry:build'])) fail('npm run registry:build failed - generated registry.yaml is required before final audit.');

console.log('[supervibe:upgrade] npm run check ...');
if (!run('npm', ['run', 'check'])) fail('npm run check failed - upgrade applied but tests are red. Investigate before using.');

console.log('[supervibe:upgrade] npm run supervibe:install-doctor ...');
if (!run('npm', ['run', 'supervibe:install-doctor'])) fail('npm run supervibe:install-doctor failed - install lifecycle audit did not pass.');

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
  console.log(`[supervibe:upgrade] upgraded ${before} -> ${after}`);
  console.log(`[supervibe:upgrade] restart Claude Code to pick up the new plugin code.`);
  console.log(`[supervibe:upgrade] Each project will see [supervibe]  on its next session start.`);
}
console.log('=================================================');

