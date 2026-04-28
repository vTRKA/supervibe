import { test } from 'node:test';
import assert from 'node:assert';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = process.cwd();
const SH = join(ROOT, 'install.sh');
const PS1 = join(ROOT, 'install.ps1');
const UPD_SH = join(ROOT, 'update.sh');
const UPD_PS1 = join(ROOT, 'update.ps1');

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

test('install.sh writes all three Claude config files (regression: empty banner bug)', () => {
  const src = readFileSync(SH, 'utf8');
  assert.match(src, /installed_plugins\.json/,        'must update installed_plugins.json');
  assert.match(src, /known_marketplaces\.json/,       'must update known_marketplaces.json');
  assert.match(src, /settings\.json/,                 'must update settings.json');
  assert.match(src, /enabledPlugins/,                 'must set enabledPlugins[<key>] = true');
  assert.match(src, /extraKnownMarketplaces/,         'must mirror marketplace into extraKnownMarketplaces');
});

test('install.ps1 writes all three Claude config files (regression: empty banner bug)', () => {
  const src = readFileSync(PS1, 'utf8');
  assert.match(src, /installed_plugins\.json/,        'must update installed_plugins.json');
  assert.match(src, /known_marketplaces\.json/,       'must update known_marketplaces.json');
  assert.match(src, /settings\.json/,                 'must update settings.json');
  assert.match(src, /enabledPlugins/,                 'must set enabledPlugins[<key>] = true');
  assert.match(src, /extraKnownMarketplaces/,         'must mirror marketplace into extraKnownMarketplaces');
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

// --- standalone update scripts ---

test('update.sh and update.ps1 exist and are non-empty', () => {
  assert.ok(existsSync(UPD_SH));
  assert.ok(existsSync(UPD_PS1));
  assert.ok(statSync(UPD_SH).size > 500);
  assert.ok(statSync(UPD_PS1).size > 500);
});

test('update.sh is syntactically valid bash', () => {
  try {
    execSync(`bash -n "${UPD_SH}"`, { stdio: 'pipe' });
  } catch (err) {
    assert.fail(`update.sh syntax error:\n${err.stderr?.toString() || err.message}`);
  }
});

test('update.sh has shebang, set -euo pipefail, refuses to bootstrap', () => {
  const src = readFileSync(UPD_SH, 'utf8');
  assert.match(src, /^#!\/usr\/bin\/env bash/, 'must start with bash shebang');
  assert.match(src, /set -euo pipefail/, 'must enable strict bash mode');
  assert.match(src, /no Evolve install found/, 'must explicitly tell user to run install.sh first when checkout is missing');
  assert.match(src, /git -C .* status --porcelain/, 'must check for uncommitted changes before updating');
  assert.match(src, /npm run evolve:upgrade/, 'must delegate to the canonical upgrade script');
});

test('update.ps1 has Stop ErrorAction + dirty-check + delegation', () => {
  const src = readFileSync(UPD_PS1, 'utf8');
  assert.match(src, /\$ErrorActionPreference\s*=\s*'Stop'/, 'must enable Stop action');
  assert.match(src, /no Evolve install found/, 'must explicitly tell user to run install.ps1 first when checkout is missing');
  assert.match(src, /status --porcelain/, 'must check for uncommitted changes before updating');
  assert.match(src, /npm run evolve:upgrade/, 'must delegate to the canonical upgrade script');
});

test('update scripts use the same plugin-marketplace path layout as install scripts', () => {
  const sh = readFileSync(UPD_SH, 'utf8');
  const ps1 = readFileSync(UPD_PS1, 'utf8');
  assert.match(sh, /\.claude\/plugins\/marketplaces\/evolve-marketplace/);
  assert.match(ps1, /\.claude\\plugins\\marketplaces\\evolve-marketplace/);
});

test('update scripts honor EVOLVE_PLUGIN_ROOT env override', () => {
  const sh = readFileSync(UPD_SH, 'utf8');
  const ps1 = readFileSync(UPD_PS1, 'utf8');
  assert.match(sh,  /EVOLVE_PLUGIN_ROOT/);
  assert.match(ps1, /EVOLVE_PLUGIN_ROOT/);
});
