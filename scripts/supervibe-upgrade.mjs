#!/usr/bin/env node
// Upgrade the Supervibe plugin to the latest commit on the tracked branch.
// Cross-platform (Windows / macOS / Linux). Pure Node - no shell tricks.
//
// Steps:
//   1. Read current version from .claude-plugin/plugin.json
//   2. Refuse tracked local edits, then clean untracked/ignored stale files
//   3. git fetch + git pull --ff-only (refuses to clobber local commits)
//   4. Assert the tracked plugin checkout is a clean mirror of upstream
//   5. ensure the required ONNX embedding model is downloaded and usable
//   6. npm ci (pin versions from lockfile without dirtying package-lock.json)
//   7. npm run registry:build (generated registry.yaml is intentionally not committed)
//   8. npm run supervibe:install-doctor (post-upgrade lifecycle audit)
//   9. Read new version, print diff banner

import { resolveSupervibePluginRoot } from './lib/supervibe-plugin-root.mjs';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { partitionTrackedPorcelainLines } from './lib/installer-managed-checkout.mjs';
import {
  SQLITE_NODE_MIN_VERSION,
  formatNodeRuntimeMode,
  getNodeRuntimeCapability,
} from './lib/node-runtime-requirements.mjs';

const PLUGIN_ROOT = resolveSupervibePluginRoot();

function manifestVersion(root) {
  try {
    return JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version;
  } catch { return null; }
}

function commandInvocation(cmd, args) {
  if (process.platform === 'win32' && (cmd === 'npm' || cmd === 'npx')) {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', `${cmd}.cmd`, ...args],
      display: `cmd.exe /d /s /c ${cmd}.cmd ${args.join(' ')}`,
    };
  }
  return { command: cmd, args, display: `${cmd} ${args.join(' ')}` };
}

function run(cmd, args, opts = {}) {
  const invocation = commandInvocation(cmd, args);
  const r = spawnSync(invocation.command, invocation.args, {
    cwd: PLUGIN_ROOT,
    stdio: 'inherit',
    ...opts,
  });
  if (r.error) {
    console.error(`[supervibe:upgrade] failed to start ${invocation.display}: ${r.error.message}`);
  } else if (r.signal) {
    console.error(`[supervibe:upgrade] ${invocation.display} stopped by signal ${r.signal}`);
  }
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
  const invocation = commandInvocation(cmd, args);
  const r = spawnSync(invocation.command, invocation.args, { cwd: PLUGIN_ROOT, encoding: 'utf8' });
  if (r.error) {
    return { ok: false, stdout: '', stderr: r.error.message };
  }
  return { ok: r.status === 0, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

function statusLines(stdout) {
  return String(stdout || '').split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
}

function isAllowedAutoUpdateStateLine(line) {
  return /^\?\? \.claude-plugin\/\.auto-update\.(json|lock)$/.test(String(line || "").trimEnd());
}

function readDirtyState(stage) {
  const status = runQuiet('git', ['status', '--porcelain']);
  if (!status.ok) {
    fail(`git status failed during ${stage}: ${status.stderr || status.stdout || 'unknown error'}`);
  }
  const dirty = statusLines(status.stdout);
  return { dirty, ...partitionTrackedPorcelainLines(dirty) };
}

function restoreInstallerManagedTrackedEdits(entries) {
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  for (const [path, entry] of byPath) {
    console.log(`[supervibe:upgrade] restoring installer-managed tracked artifact: ${path} (${entry.reason})`);
    if (!runGitNoLfsSmudge(['checkout', '--', path])) fail(`failed to restore installer-managed tracked artifact: ${path}`);
  }
}

function assertMirrorCheckoutClean(stage) {
  const status = runQuiet('git', ['status', '--porcelain', '--untracked-files=all']);
  if (!status.ok) {
    fail(`git status failed during ${stage}: ${status.stderr || status.stdout || 'unknown error'}`);
  }
  const drift = statusLines(status.stdout).filter((line) => !isAllowedAutoUpdateStateLine(line));
  if (drift.length === 0) return;

  console.error(`[supervibe:upgrade] checkout drift after ${stage}:`);
  console.error(drift.slice(0, 30).join('\n'));
  if (drift.length > 30) console.error(`[supervibe:upgrade] ... and ${drift.length - 30} more line(s)`);
  fail('managed plugin checkout is not a clean mirror after cleanup/pull; stale files may remain active.');
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

// Refuse user-owned tracked local edits; clean untracked/ignored stale files from the managed checkout.
let dirtyState = readDirtyState('pre-update dirty check');
if (dirtyState.installerManaged.length > 0) {
  restoreInstallerManagedTrackedEdits(dirtyState.installerManaged);
  dirtyState = readDirtyState('post managed-artifact restore');
}
if (dirtyState.userOwned.length > 0) {
  console.error('[supervibe:upgrade] uncommitted changes in plugin dir:');
  console.error(dirtyState.userOwned.join('\n'));
  fail('Commit/stash tracked changes in the plugin checkout first, then re-run.');
}
if (dirtyState.untracked.length > 0) {
  console.log(`[supervibe:upgrade] removing ${dirtyState.untracked.length} untracked stale file(s) from managed plugin checkout ...`);
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
assertMirrorCheckoutClean('pre-pull cleanup');

console.log('[supervibe:upgrade] git fetch + pull --ff-only ...');
if (!runGitNoLfsSmudge(['fetch', '--tags', '--prune'])) fail('git fetch failed');
if (!runGitNoLfsSmudge(['pull', '--ff-only'])) fail('git pull --ff-only failed (local diverged from upstream)');
assertMirrorCheckoutClean('git pull --ff-only');

console.log('[supervibe:upgrade] ensuring required ONNX embedding model ...');
if (!run('node', ['scripts/ensure-onnx-model.mjs'])) {
  fail('required ONNX model setup failed - install cannot be considered complete without the embedding model.');
}

console.log('[supervibe:upgrade] npm ci ...');
if (!run('npm', ['ci', '--no-audit', '--no-fund'])) fail('npm ci failed');

console.log('[supervibe:upgrade] npm run registry:build ...');
if (!run('npm', ['run', 'registry:build'])) fail('npm run registry:build failed - generated registry.yaml is required before final audit.');

if (process.platform !== 'win32') {
  console.log('[supervibe:upgrade] refreshing macOS/Linux terminal commands ...');
  if (!run('node', ['scripts/install-unix-bin-links.mjs', '--plugin-root', PLUGIN_ROOT])) {
    fail('terminal command link refresh failed - run npm run supervibe:install-bins for details.');
  }
}

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
  console.log(`[supervibe:upgrade] restart your AI CLI to pick up the new plugin code.`);
  console.log(`[supervibe:upgrade] Each project will see [supervibe]  on its next session start.`);
  console.log(`[supervibe:upgrade] To refresh project overrides, send /supervibe-adapt inside that project's AI CLI session, not in the terminal shell.`);
}
console.log('=================================================');

