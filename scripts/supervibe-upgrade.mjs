#!/usr/bin/env node
// Upgrade the Supervibe plugin to the latest commit on the tracked branch.
// Cross-platform (Windows / macOS / Linux). Pure Node - no shell tricks.
//
// Steps:
//   1. Read current version from .claude-plugin/plugin.json
//   2. Restore managed checkout tracked drift, then clean untracked/ignored stale files
//   3. git fetch + git pull --ff-only (refuses to clobber local commits)
//   4. Assert the tracked plugin checkout is a clean mirror of upstream
//   5. ensure the required ONNX embedding model is downloaded and usable
//   6. npm ci (pin versions from lockfile without dirtying package-lock.json)
//   7. npm run registry:build (generated registry.yaml is intentionally not committed)
//   8. npm run supervibe:install-doctor (post-upgrade lifecycle audit)
//   9. Read new version, print diff banner

import { resolveSupervibePluginRoot } from './lib/supervibe-plugin-root.mjs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { readFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { partitionTrackedPorcelainLines } from './lib/installer-managed-checkout.mjs';
import { isManagedInstallPath } from './lib/supervibe-auto-update.mjs';
import { MODEL_RELATIVE_PATH } from './ensure-onnx-model.mjs';
import {
  SQLITE_NODE_MIN_VERSION,
  formatNodeRuntimeMode,
  getNodeRuntimeCapability,
} from './lib/node-runtime-requirements.mjs';

const PLUGIN_ROOT = resolveSupervibePluginRoot();
const UPDATE_STATE_PATH = join(PLUGIN_ROOT, '.supervibe', 'memory', '.supervibe-update-state.json');
const args = parseArgs(process.argv.slice(2));

function envFlag(value) {
  return /^(1|true|yes|y|on)$/i.test(String(value || '').trim());
}

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

function parseArgs(argv) {
  const parsed = { help: false, check: false, dryRun: false, rollback: false, to: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--check') parsed.check = true;
    else if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--rollback') parsed.rollback = true;
    else if (arg === '--to') {
      parsed.to = argv[i + 1] || '';
      i += 1;
    } else if (arg.startsWith('--to=')) {
      parsed.to = arg.slice('--to='.length);
    } else {
      parsed.unknown = arg;
    }
  }
  return parsed;
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
  const value = String(line || "").trimEnd();
  return /^\?\? \.claude-plugin\/\.auto-update\.(json|lock)$/.test(value)
    || value === '?? .supervibe/memory/.supervibe-update-state.json';
}

function readDirtyState(stage) {
  const status = runQuiet('git', ['status', '--porcelain']);
  if (!status.ok) {
    fail(`git status failed during ${stage}: ${status.stderr || status.stdout || 'unknown error'}`);
  }
  const dirty = statusLines(status.stdout);
  return { dirty, ...partitionTrackedPorcelainLines(dirty, { restoreAllTracked: restoreAllTrackedDrift }) };
}

function restoreInstallerManagedTrackedEdits(entries) {
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  for (const [path, entry] of byPath) {
    console.log(`[supervibe:upgrade] restoring managed checkout tracked drift: ${path} (${entry.reason})`);
    if (!run('git', ['checkout', '--', path])) fail(`failed to restore managed checkout tracked drift: ${path}`);
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

function formatUpgradeHelp() {
  return [
    'SUPERVIBE_UPDATE_HELP',
    'Usage:',
    '  supervibe-update',
    '  supervibe-update --check',
    '  supervibe-update --dry-run',
    '  supervibe-update --rollback',
    '  supervibe-update --to <git-ref>',
    '',
    'Modes:',
    '  --check     Fetch upstream metadata and report whether the plugin is behind.',
    '  --dry-run   Print the planned update steps without git pull, npm ci, or file mutation.',
    '  --rollback  Restore the pre-upgrade git ref recorded in .supervibe-update-state.json.',
    '  --to        Checkout a specific git ref, then run the same install/audit cycle.',
    '',
    'Next after a successful update:',
    '  Restart the AI CLI, then run /supervibe-adapt inside each project that has overrides.',
  ].join('\n');
}

function writeUpgradeState(state) {
  mkdirSync(join(PLUGIN_ROOT, '.supervibe', 'memory'), { recursive: true });
  writeFileSync(UPDATE_STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function readUpgradeState() {
  if (!existsSync(UPDATE_STATE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(UPDATE_STATE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function clearUpgradeState() {
  rmSync(UPDATE_STATE_PATH, { force: true });
}

function currentHeadSha() {
  const head = runQuiet('git', ['rev-parse', 'HEAD']);
  return head.ok ? head.stdout : null;
}

function printDryRun() {
  const current = manifestVersion(PLUGIN_ROOT);
  const head = currentHeadSha();
  const branch = runQuiet('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const status = runQuiet('git', ['status', '--porcelain', '--untracked-files=all']);
  const cachePath = join(PLUGIN_ROOT, '.claude-plugin', '.upgrade-check.json');
  let cache = null;
  if (existsSync(cachePath)) {
    try { cache = JSON.parse(readFileSync(cachePath, 'utf8')); } catch {}
  }
  console.log('SUPERVIBE_UPDATE_DRY_RUN');
  console.log(`PLUGIN_ROOT: ${PLUGIN_ROOT}`);
  console.log(`CURRENT_VERSION: ${current || 'unknown'}`);
  console.log(`HEAD: ${head || 'unknown'}`);
  console.log(`BRANCH: ${branch.ok ? branch.stdout : 'unknown'}`);
  console.log(`DIRTY_LINES: ${status.ok && status.stdout ? statusLines(status.stdout).length : 0}`);
  console.log(`TARGET_REF: ${args.to || 'tracked-upstream'}`);
  console.log(`UPSTREAM_CACHE_BEHIND: ${cache?.behind ?? 'unknown'}`);
  console.log('WOULD_RUN: restore managed drift -> git clean -> fetch -> pull/checkout -> ensure ONNX -> npm ci -> registry:build -> terminal shim refresh -> provider hook config refresh -> install doctor');
  console.log('MUTATES: false');
}

async function runCheckMode() {
  console.log(`[supervibe:upgrade] plugin root: ${PLUGIN_ROOT}`);
  const { performUpstreamCheck } = await import('./lib/upgrade-check.mjs');
  const result = await performUpstreamCheck(PLUGIN_ROOT);
  if (result.error) {
    console.log(`[supervibe:upgrade] check failed: ${result.error}`);
    process.exit(1);
  }
  const tag = result.latestTag ? ` (latest tag: ${result.latestTag})` : '';
  if (result.behind > 0) {
    console.log(`[supervibe:upgrade] ${result.behind} commit(s) behind upstream${tag}`);
  } else {
    console.log('[supervibe:upgrade] up to date with upstream');
  }
}

function runInstallCycleAfterCheckout(label) {
  console.log(`[supervibe:upgrade] ${label}: ensuring required ONNX embedding model ...`);
  if (!run('node', ['scripts/ensure-onnx-model.mjs'])) fail('required ONNX model setup failed - install cannot be considered complete without the embedding model.');
  console.log(`[supervibe:upgrade] ${label}: npm ci ...`);
  if (!run('npm', ['ci', '--no-audit', '--no-fund'])) fail('npm ci failed');
  console.log(`[supervibe:upgrade] ${label}: npm run registry:build ...`);
  if (!run('npm', ['run', 'registry:build'])) fail('npm run registry:build failed - generated registry.yaml is required before final audit.');
  refreshTerminalCommands();
  refreshCodexPluginHooksConfig();
  refreshGeminiSessionHooksConfig();
  console.log(`[supervibe:upgrade] ${label}: npm run supervibe:install-doctor ...`);
  if (!run('npm', ['run', 'supervibe:install-doctor'])) fail('npm run supervibe:install-doctor failed - install lifecycle audit did not pass.');
}

function refreshCodexPluginHooksConfig() {
  const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex');
  const configPath = join(codexHome, 'config.toml');
  const cachePath = join(codexHome, 'plugins', 'cache', 'supervibe-marketplace', 'supervibe', 'local');
  const legacyPath = join(codexHome, 'plugins', 'supervibe');
  const shouldRepair = existsSync(configPath) || existsSync(cachePath) || existsSync(legacyPath);
  if (!shouldRepair) return;

  mkdirSync(codexHome, { recursive: true });
  let text = '';
  try {
    text = readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  text = upsertTomlSectionSetting(text, '[features]', 'plugins', 'plugins = true');
  text = upsertTomlSectionSetting(text, '[features]', 'hooks', 'hooks = true');
  text = upsertTomlSectionSetting(text, '[features]', 'codex_hooks', 'codex_hooks = true');
  text = upsertTomlSectionSetting(text, '[features]', 'plugin_hooks', 'plugin_hooks = true');
  text = upsertTomlSectionSetting(text, '[plugins."supervibe@supervibe-marketplace"]', 'enabled', 'enabled = true');
  writeFileSync(configPath, `${text.trimEnd()}\n`, 'utf8');
  console.log('[supervibe:upgrade] refreshed Codex plugin hook config');
}

function refreshGeminiSessionHooksConfig() {
  const ok = run('node', ['scripts/register-gemini-hooks.mjs', '--plugin-root', PLUGIN_ROOT, '--if-registered']);
  if (!ok) fail('Gemini session hook config refresh failed - run node scripts/register-gemini-hooks.mjs for details.');
}

function upsertTomlSectionSetting(text, sectionHeader, settingKey, settingLine) {
  const headerRe = new RegExp(`^${escapeRegExp(sectionHeader)}[ \t]*$`, 'm');
  const match = headerRe.exec(text);
  if (!match) {
    return `${text.trimEnd()}\n\n${sectionHeader}\n${settingLine}\n`;
  }
  const bodyStart = match.index + match[0].length;
  const rest = text.slice(bodyStart);
  const nextRel = rest.search(/^\s*\[/m);
  const bodyEnd = nextRel === -1 ? text.length : bodyStart + nextRel;
  let body = text.slice(bodyStart, bodyEnd);
  const settingRe = new RegExp(`^\\s*${escapeRegExp(settingKey)}\\s*=.*$`, 'm');
  if (settingRe.test(body)) {
    body = body.replace(settingRe, settingLine);
  } else {
    body = body.endsWith('\n') || body === '' ? `${body}${settingLine}\n` : `${body}\n${settingLine}\n`;
  }
  return text.slice(0, bodyStart) + body + text.slice(bodyEnd);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function refreshTerminalCommands() {
  if (process.platform === 'win32') {
    console.log('[supervibe:upgrade] refreshing Windows terminal commands ...');
    if (!run('node', ['scripts/install-windows-bin-shims.mjs', '--plugin-root', PLUGIN_ROOT])) {
      fail('Windows terminal command shim refresh failed - run node scripts/install-windows-bin-shims.mjs for details.');
    }
    return;
  }
  console.log('[supervibe:upgrade] refreshing macOS/Linux terminal commands ...');
  if (!run('node', ['scripts/install-unix-bin-links.mjs', '--plugin-root', PLUGIN_ROOT])) {
    fail('terminal command link refresh failed - run npm run supervibe:install-bins for details.');
  }
}

function rollbackFromState() {
  const state = readUpgradeState();
  if (!state?.preSha) fail('No rollback anchor found at .supervibe/memory/.supervibe-update-state.json.');
  console.log(`[supervibe:upgrade] rollback to ${state.preSha} (was v${state.preVersion || 'unknown'}) ...`);
  if (!run('git', ['reset', '--hard', state.preSha])) fail('git reset --hard rollback failed');
  runInstallCycleAfterCheckout('rollback');
  clearUpgradeState();
  console.log(`[supervibe:upgrade] rollback complete; plugin restored to ${state.preSha}.`);
}

if (args.help) {
  console.log(formatUpgradeHelp());
  process.exit(0);
}
if (args.unknown) fail(`Unknown option: ${args.unknown}. Run supervibe-update --help.`);
if (args.check) await runCheckMode();
if (args.check) process.exit(0);
if (args.dryRun) {
  printDryRun();
  process.exit(0);
}
if (args.rollback) {
  rollbackFromState();
  process.exit(0);
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
const preSha = currentHeadSha();
writeUpgradeState({
  schemaVersion: 1,
  preSha,
  preVersion: before,
  targetRef: args.to || null,
  startedAt: new Date().toISOString(),
});

const restoreAllTrackedDrift =
  isManagedInstallPath(PLUGIN_ROOT) || envFlag(process.env.SUPERVIBE_RESTORE_PLUGIN_DRIFT);

if (!restoreAllTrackedDrift) {
  console.log('[supervibe:upgrade] non-managed checkout mode: only legacy installer-managed drift will be restored');
}

// Restore tracked plugin drift in managed installs; clean untracked/ignored stale files from the managed checkout.
let dirtyState = readDirtyState('pre-update dirty check');
if (dirtyState.installerManaged.length > 0) {
  restoreInstallerManagedTrackedEdits(dirtyState.installerManaged);
  dirtyState = readDirtyState('post managed checkout drift restore');
}
if (dirtyState.userOwned.length > 0) {
  console.error('[supervibe:upgrade] uncommitted changes in plugin dir:');
  console.error(dirtyState.userOwned.join('\n'));
  fail('Non-managed development checkout has tracked changes in the plugin checkout. Commit/stash them or set SUPERVIBE_RESTORE_PLUGIN_DRIFT=1 for a managed plugin repair run.');
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
  '-e',
  MODEL_RELATIVE_PATH,
  '-e',
  '.supervibe/memory/.supervibe-update-state.json',
])) fail('git clean failed');
assertMirrorCheckoutClean('pre-pull cleanup');

console.log('[supervibe:upgrade] git fetch + pull --ff-only ...');
if (!run('git', ['fetch', '--tags', '--prune'])) fail('git fetch failed');
if (args.to) {
  if (!run('git', ['checkout', '--quiet', args.to])) fail(`git checkout ${args.to} failed`);
  assertMirrorCheckoutClean(`git checkout ${args.to}`);
} else {
  if (!run('git', ['pull', '--ff-only'])) fail('git pull --ff-only failed (local diverged from upstream)');
  assertMirrorCheckoutClean('git pull --ff-only');
}

console.log('[supervibe:upgrade] ensuring required ONNX embedding model ...');
if (!run('node', ['scripts/ensure-onnx-model.mjs'])) {
  fail('required ONNX model setup failed - install cannot be considered complete without the embedding model.');
}

console.log('[supervibe:upgrade] npm ci ...');
if (!run('npm', ['ci', '--no-audit', '--no-fund'])) fail('npm ci failed');

console.log('[supervibe:upgrade] npm run registry:build ...');
if (!run('npm', ['run', 'registry:build'])) fail('npm run registry:build failed - generated registry.yaml is required before final audit.');

refreshTerminalCommands();
refreshCodexPluginHooksConfig();
refreshGeminiSessionHooksConfig();

console.log('[supervibe:upgrade] npm run supervibe:install-doctor ...');
if (!run('npm', ['run', 'supervibe:install-doctor'])) fail('npm run supervibe:install-doctor failed - install lifecycle audit did not pass.');

const after = manifestVersion(PLUGIN_ROOT);

// Refresh upstream-check cache so SessionStart doesn't keep showing "behind"
try {
  const { performUpstreamCheck } = await import('./lib/upgrade-check.mjs');
  await performUpstreamCheck(PLUGIN_ROOT);
} catch { /* non-fatal */ }
clearUpgradeState();

console.log('\n=================================================');
if (before === after) {
  console.log(`[supervibe:upgrade] already up to date (v${after})`);
} else {
  console.log(`[supervibe:upgrade] upgraded ${before} -> ${after}`);
  console.log(`[supervibe:upgrade] restart your AI CLI to pick up the new plugin code.`);
  console.log(`[supervibe:upgrade] Next: restart your AI CLI, then run /supervibe-adapt inside each project that has overrides.`);
  console.log(`[supervibe:upgrade] Terminal aliases are refreshed for this OS: supervibe-update and supervibe-adapt.`);
}
console.log('=================================================');

