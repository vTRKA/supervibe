import { test } from 'node:test';
import assert from 'node:assert';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = process.cwd();
const SH = join(ROOT, 'install.sh');
const PS1 = join(ROOT, 'install.ps1');

test('install.sh exists and is non-empty', () => {
  assert.ok(existsSync(SH));
  assert.ok(statSync(SH).size > 1000);
});

test('install.ps1 exists and is non-empty', () => {
  assert.ok(existsSync(PS1));
  assert.ok(statSync(PS1).size > 1000);
});

test('install.sh is syntactically valid bash', () => {
  // bash -n parses without executing. Available on macOS / Linux / Git Bash.
  try {
    execSync(`bash -n "${SH}"`, { stdio: 'pipe' });
  } catch (err) {
    assert.fail(`install.sh syntax error:\n${err.stderr?.toString() || err.message}`);
  }
});

test('install.sh has shebang, set -euo pipefail, idempotency markers', () => {
  const src = readFileSync(SH, 'utf8');
  assert.match(src, /^#!\/usr\/bin\/env bash/, 'must start with bash shebang');
  assert.match(src, /set -euo pipefail/, 'must enable strict bash mode');
  assert.match(src, /evolve-plugin-include: do-not-edit/, 'must use idempotent Gemini marker');
  assert.match(src, /node -e/, 'must use node -e for JSON upsert (not heredoc string-interpolation)');
  assert.match(src, /process\.env\.EVOLVE_/, 'must read paths from env in node, not interpolate into source');
});

test('install.ps1 has strict-mode + Stop action + env-based JSON upsert', () => {
  const src = readFileSync(PS1, 'utf8');
  assert.match(src, /\$ErrorActionPreference\s*=\s*'Stop'/, 'must enable Stop action');
  assert.match(src, /evolve-plugin-include: do-not-edit/, 'must use idempotent Gemini marker');
  assert.match(src, /process\.env\.EVOLVE_/, 'must read paths from env in node, not interpolate');
  assert.match(src, /SymbolicLink/, 'must prefer native PowerShell symlink before falling back to copy');
});

test('install.sh and install.ps1 reference the same marketplace name', () => {
  const sh = readFileSync(SH, 'utf8');
  const ps1 = readFileSync(PS1, 'utf8');
  const shName = sh.match(/MARKETPLACE_NAME="([^"]+)"/)?.[1];
  const psName = ps1.match(/\$MarketplaceName\s*=\s*'([^']+)'/)?.[1];
  assert.strictEqual(shName, psName, `marketplace name mismatch: bash=${shName} ps1=${psName}`);
});

test('install.sh and install.ps1 reference the same plugin name', () => {
  const sh = readFileSync(SH, 'utf8');
  const ps1 = readFileSync(PS1, 'utf8');
  const shName = sh.match(/PLUGIN_NAME="([^"]+)"/)?.[1];
  const psName = ps1.match(/\$PluginName\s*=\s*'([^']+)'/)?.[1];
  assert.strictEqual(shName, psName, `plugin name mismatch: bash=${shName} ps1=${psName}`);
});

test('marketplace name in installers matches marketplace.json file', () => {
  const sh = readFileSync(SH, 'utf8');
  const shName = sh.match(/MARKETPLACE_NAME="([^"]+)"/)?.[1];
  const mp = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.strictEqual(mp.name, shName, 'marketplace.json name must match installer constant');
});

test('plugin name in installers matches plugin.json file', () => {
  const sh = readFileSync(SH, 'utf8');
  const shName = sh.match(/PLUGIN_NAME="([^"]+)"/)?.[1];
  const pj = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.strictEqual(pj.name, shName, 'plugin.json name must match installer constant');
});
