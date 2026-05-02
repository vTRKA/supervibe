import { test } from 'node:test';
import assert from 'node:assert';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = process.cwd();
const SH = join(ROOT, 'install.sh');
const PS1 = join(ROOT, 'install.ps1');
const UPD_SH = join(ROOT, 'update.sh');
const UPD_PS1 = join(ROOT, 'update.ps1');
const GITATTRIBUTES = join(ROOT, '.gitattributes');

function bashSyntaxCheck(filePath) {
  try {
    execFileSync('bash', ['-n', '-s'], {
      cwd: ROOT,
      input: readFileSync(filePath),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return;
  } catch (err) {
    throw err;
  }
}

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
    bashSyntaxCheck(SH);
  } catch (err) {
    assert.fail(`install.sh syntax error:\n${err.stderr?.toString() || err.message}`);
  }
});

test('install.sh has shebang, set -euo pipefail, idempotency markers', () => {
  const src = readFileSync(SH, 'utf8');
  assert.match(src, /^#!\/usr\/bin\/env bash/, 'must start with bash shebang');
  assert.match(src, /set -euo pipefail/, 'must enable strict bash mode');
  assert.match(src, /supervibe-plugin-include: do-not-edit/, 'must use idempotent Gemini marker');
  assert.match(src, /node -e/, 'must use node -e for JSON upsert (not heredoc string-interpolation)');
  assert.match(src, /process\.env\.SUPERVIBE_/, 'must read paths from env in node, not interpolate into source');
});

test('shell installers stay LF under Windows autocrlf checkouts', () => {
  const attrs = readFileSync(GITATTRIBUTES, 'utf8');
  assert.match(attrs, /\*\.sh text eol=lf/, 'bash installer/update scripts must not be checked out with CRLF');
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
  assert.match(src, /supervibe-plugin-include: do-not-edit/, 'must use idempotent Gemini marker');
  assert.match(src, /process\.env\.SUPERVIBE_/, 'must read paths from env in node, not interpolate');
  assert.match(src, /SymbolicLink/, 'must prefer native PowerShell symlink before falling back to copy');
  assert.match(src, /Junction/, 'must try a Windows junction before copying the whole checkout');
  assert.match(src, /\$safeLogName/, 'must sanitize npm script names before using them as Windows log filenames');
  assert.match(src, /Write-Utf8NoBom/, 'must write Claude JSON files without UTF-8 BOM');
  assert.match(src, /replace\(\/\^\\uFEFF\//, 'must tolerate existing BOM-prefixed JSON files');
  assert.doesNotMatch(src, /param\(\[string\[\]\]\$Args/, 'must not shadow PowerShell automatic $args variable');
  assert.match(src, /\$ErrorActionPreference\s*=\s*'Continue'/, 'must let native stderr warnings pass through log capture');
  assert.match(src, /Restore-InstallerManagedTrackedEdits/, 'must self-heal package-lock/model drift left by older installer runs');
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

test('Codex installer registration includes native skills for Zed ACP sessions', () => {
  const sh = readFileSync(SH, 'utf8');
  const ps1 = readFileSync(PS1, 'utf8');

  assert.match(sh, /\.codex\/plugins/, 'bash installer must keep Codex plugin registration');
  assert.match(sh, /plugins\/cache\/\$MARKETPLACE_NAME\/\$PLUGIN_NAME/, 'bash installer must write the Codex official plugin cache');
  assert.match(sh, /SUPERVIBE_CODEX_CONFIG/, 'bash installer must update Codex config.toml through env-based node script');
  assert.match(sh, /\[plugins\."\$\{pluginKey\}"\]/, 'bash installer must enable the plugin key in Codex config.toml');
  assert.match(sh, /\.agents\/skills/, 'bash installer must link native skills for Codex/Zed ACP');
  assert.match(ps1, /Join-Path \$CodexDir 'plugins'/, 'PowerShell installer must keep Codex plugin registration');
  assert.match(ps1, /plugins\\cache\\\$MarketplaceName\\\$PluginName/, 'PowerShell installer must write the Codex official plugin cache');
  assert.match(ps1, /SUPERVIBE_CODEX_CONFIG/, 'PowerShell installer must update Codex config.toml through env-based node script');
  assert.match(ps1, /\[plugins\."\$\{pluginKey\}"\]/, 'PowerShell installer must enable the plugin key in Codex config.toml');
  assert.match(ps1, /Join-Path \$HOME '\.agents\\skills'/, 'PowerShell installer must link native skills for Codex/Zed ACP');
});

test('macOS/Linux installer and updater refresh terminal command shims', () => {
  const sh = readFileSync(SH, 'utf8');
  const updateSh = readFileSync(UPD_SH, 'utf8');
  const upgradeMjs = readFileSync(join(ROOT, 'scripts', 'supervibe-upgrade.mjs'), 'utf8');
  const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

  assert.equal(packageJson.bin['supervibe-adapt'], 'bin/supervibe.mjs');
  assert.match(sh, /install-unix-bin-links\.mjs/, 'bash installer must link terminal shims');
  assert.match(updateSh, /install-unix-bin-links\.mjs/, 'bash updater must refresh terminal shims');
  assert.match(upgradeMjs, /install-unix-bin-links\.mjs/, 'canonical upgrader must refresh terminal shims on Unix');
  assert.match(sh, /\.local\/bin/, 'bash installer must use a user-writable Unix bin dir');
});

test('installers require Node 22.5+ and offer consent-based bootstrap before registration', () => {
  const sh = readFileSync(SH, 'utf8');
  const ps1 = readFileSync(PS1, 'utf8');
  const updateSh = readFileSync(UPD_SH, 'utf8');
  const updatePs1 = readFileSync(UPD_PS1, 'utf8');

  for (const [name, src] of [['install.sh', sh], ['install.ps1', ps1], ['update.sh', updateSh], ['update.ps1', updatePs1]]) {
    assert.match(src, /22\.5/, `${name} must preserve the node:sqlite runtime floor`);
    assert.match(src, /SUPERVIBE_INSTALL_NODE/, `${name} must support explicit bootstrap consent`);
    assert.match(src, /node:sqlite/, `${name} must verify the SQLite runtime`);
  }
  for (const [name, src] of [['install.sh', sh], ['install.ps1', ps1]]) {
    assert.doesNotMatch(src, /npm\s+run\s+check|['"]run['"]\s*,\s*['"]check['"]/, `${name} must not run the dev test suite for user installs`);
    assert.match(src, /registry:build/, `${name} must generate registry.yaml before install lifecycle audit`);
    assert.match(src, /supervibe:install-doctor/, `${name} must run the install lifecycle doctor`);
    assert.doesNotMatch(src, /supervibe:install-check/, `${name} must not install a reduced runtime`);
  }
  assert.match(sh, /assert_checkout_mirror_clean/, 'bash installer must assert checkout mirror cleanup');
  assert.match(ps1, /Assert-CheckoutMirrorClean/, 'PowerShell installer must assert checkout mirror cleanup');
  assert.doesNotMatch(sh, /SUPERVIBE_COMPAT_INSTALL/, 'bash installer must not branch into reduced compatibility mode');
  assert.doesNotMatch(ps1, /\$CompatInstall/, 'PowerShell installer must not branch into reduced compatibility mode');
  assert.match(sh, /npm ci --no-audit --no-fund/, 'bash installer must not dirty package-lock.json');
  assert.match(sh, /restore_installer_managed_tracked_edits/, 'bash installer must self-heal package-lock drift left by older installer runs');
  assert.match(ps1, /Run-NpmStep 'npm ci' @\('ci', '--no-audit', '--no-fund'\)/, 'PowerShell installer must not dirty package-lock.json');
});

test('install and update scripts self-heal installer-managed package-lock before refusing user edits', () => {
  const sh = readFileSync(SH, 'utf8');
  const ps1 = readFileSync(PS1, 'utf8');
  const updateSh = readFileSync(UPD_SH, 'utf8');
  const updatePs1 = readFileSync(UPD_PS1, 'utf8');

  for (const [name, src] of [['install.sh', sh], ['update.sh', updateSh]]) {
    assert.match(src, /restore_installer_managed_tracked_edits/, `${name} must restore managed tracked artifacts before dirty refusal`);
    assert.match(src, /installer-managed tracked artifact/, `${name} must explain managed artifact restoration`);
    assert.match(src, /package-lock\.json/, `${name} must self-heal package-lock drift`);
    assert.doesNotMatch(src, /INSTALLER_MANAGED_MODEL_PATH|GIT_LFS_SKIP_SMUDGE|filter\.lfs|git lfs/i, `${name} must not require repository large-file smudge handling`);
  }

  for (const [name, src] of [['install.ps1', ps1], ['update.ps1', updatePs1]]) {
    assert.match(src, /Restore-InstallerManagedTrackedEdits/, `${name} must restore managed tracked artifacts before dirty refusal`);
    assert.match(src, /installer-managed tracked artifact/, `${name} must explain managed artifact restoration`);
    assert.match(src, /package-lock\.json/, `${name} must self-heal package-lock drift`);
    assert.doesNotMatch(src, /\$InstallerManagedModelPath|GIT_LFS_SKIP_SMUDGE|SkipLfsSmudge|Invoke-GitNoLfsSmudge|filter\.lfs|git lfs/i, `${name} must not require repository large-file smudge handling`);
  }

  assert.match(sh, /git -C "\$root" clean -ffdx -e "\$LOCAL_ONNX_MODEL_PATH"/, 'bash installer must preserve an already-downloaded ignored ONNX model during cleanup');
  assert.match(ps1, /'clean', '-ffdx', '-e', \$LocalOnnxModelPath/, 'PowerShell installer must preserve an already-downloaded ignored ONNX model during cleanup');
});

test('dead-code lint is stable in installed checkouts', () => {
  const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const knip = JSON.parse(readFileSync(join(ROOT, 'knip.json'), 'utf8'));
  const commitMsgHook = readFileSync(join(ROOT, '.husky', 'commit-msg'), 'utf8');
  const prePushHook = readFileSync(join(ROOT, '.husky', 'pre-push'), 'utf8');

  assert.match(packageJson.scripts['lint:dead-code'], /--no-config-hints/, 'install check must not fail or warn on Knip config hints');
  assert.ok(knip.entry.includes('bin/*.mjs'), 'Knip must treat shipped terminal dispatchers as entrypoints');
  assert.ok(knip.entry.includes('scripts/*.mjs'), 'Knip must treat shipped CLI scripts as entrypoints');
  assert.ok(knip.entry.includes('scripts/hooks/*.mjs'), 'Knip must treat Claude hook scripts as entrypoints');
  assert.ok(knip.entry.includes('.husky/*'), 'Knip must see Husky hook entrypoints');
  assert.equal(packageJson.devDependencies['lint-staged'], undefined, 'installer check must not depend on lint-staged');
  assert.equal(packageJson.devDependencies['@commitlint/cli'], undefined, 'installer check must not depend on commitlint');
  assert.doesNotMatch(commitMsgHook, /commitlint/, 'commit-msg hook must not require commitlint binaries');
  assert.match(commitMsgHook, /validate-commit-message\.mjs/, 'commit-msg hook must use the shipped validator');
  assert.doesNotMatch(prePushHook, /npm\s+run\s+check|npm\s+test|node\s+--test/, 'pre-push must not run the full test suite for user/developer pushes');
});

test('installers use plain git clone and checkout without large-file smudge hooks', () => {
  const sh = readFileSync(SH, 'utf8');
  const ps1 = readFileSync(PS1, 'utf8');

  assert.match(sh, /run_git clone --quiet/, 'bash installer must clone through the normal git path');
  assert.match(sh, /run_git -C "\$TARGET" checkout --quiet/, 'bash installer must checkout through the normal git path');
  assert.match(ps1, /Run-Git @\('clone', '--quiet'/, 'PowerShell installer must clone through the normal git path');
  assert.doesNotMatch(`${sh}\n${ps1}`, /GIT_LFS_SKIP_SMUDGE|filter\.lfs|git lfs|SkipLfsSmudge/i, 'installers must not depend on repository large-file filters');
});

test('installers require the ONNX embedding model before registration', () => {
  const sh = readFileSync(SH, 'utf8');
  const ps1 = readFileSync(PS1, 'utf8');
  const modelScript = readFileSync(join(ROOT, 'scripts', 'ensure-onnx-model.mjs'), 'utf8');
  const shModelSetup = sh.indexOf('scripts/ensure-onnx-model.mjs');
  const ps1ModelSetup = ps1.indexOf('ensure-onnx-model.mjs');
  const shRegistration = sh.indexOf('# ---- register with each detected CLI ----');
  const ps1Registration = ps1.indexOf('# ---- register with each detected CLI ----');

  for (const [name, src] of [['install.sh', sh], ['install.ps1', ps1]]) {
    assert.match(src, /required ONNX embedding model/, `${name} must treat the ONNX model as required`);
    assert.match(src, /ensure-onnx-model\.mjs/, `${name} must use the shared ONNX model setup`);
    assert.doesNotMatch(src, /SUPERVIBE_SKIP_LFS|SUPERVIBE_PREFETCH_LFS|GIT_LFS_SKIP_SMUDGE|filter\.lfs/i, `${name} must not let users skip the required ONNX model or depend on repository large-file filters`);
    assert.doesNotMatch(src, /lazy-fetch/, `${name} must not complete install with lazy model fetch`);
  }
  assert.notEqual(shModelSetup, -1, 'bash installer must call model setup');
  assert.notEqual(ps1ModelSetup, -1, 'PowerShell installer must call model setup');
  assert.ok(shModelSetup < shRegistration, 'bash installer must prepare model before CLI registration');
  assert.ok(ps1ModelSetup < ps1Registration, 'PowerShell installer must prepare model before CLI registration');
  assert.match(modelScript, /MODEL_DOWNLOAD_URL/, 'shared model setup must have a direct HuggingFace source');
  assert.match(modelScript, /no total timeout and no stall timeout/, 'shared model setup must not interrupt direct downloads');
  assert.doesNotMatch(modelScript, /DEFAULT_DOWNLOAD_STALL_MS|SUPERVIBE_MODEL_STALL_TIMEOUT|SUPERVIBE_MODEL_DOWNLOAD_TIMEOUT|DEFAULT_DOWNLOAD_TIMEOUT|request\.setTimeout|setTimeout\(|GIT_LFS_SKIP_SMUDGE|filter\.lfs|git lfs/i, 'direct model download must not have stall/absolute time limits or repository large-file fallback');
});

test('install.sh refuses accidental WSL install unless explicitly allowed', () => {
  const sh = readFileSync(SH, 'utf8');

  assert.match(sh, /SUPERVIBE_ALLOW_WSL_INSTALL/, 'bash installer must provide an explicit WSL opt-in');
  assert.match(sh, /WSL detected/, 'bash installer must explain WSL/Windows profile split');
  assert.match(sh, /install\.ps1/, 'bash installer must direct Windows users to the PowerShell installer');
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
    bashSyntaxCheck(UPD_SH);
  } catch (err) {
    assert.fail(`update.sh syntax error:\n${err.stderr?.toString() || err.message}`);
  }
});

test('update.sh has shebang, set -euo pipefail, and bootstraps first install', () => {
  const src = readFileSync(UPD_SH, 'utf8');
  assert.match(src, /^#!\/usr\/bin\/env bash/, 'must start with bash shebang');
  assert.match(src, /set -euo pipefail/, 'must enable strict bash mode');
  assert.match(src, /bootstrap_first_install/, 'must handle first-time install when checkout is missing');
  assert.match(src, /SUPERVIBE_INSTALL_URL/, 'must allow overriding the delegated installer URL');
  assert.match(src, /install\.sh/, 'must delegate missing checkouts to install.sh');
  assert.match(src, /git -C .* status --porcelain/, 'must check for uncommitted changes before updating');
  assert.match(src, /tracked_dirty/, 'must refuse tracked edits specifically');
  assert.match(src, /untracked stale file/, 'must allow stale untracked cleanup through canonical upgrader');
  assert.match(src, /npm run supervibe:upgrade/, 'must delegate to the canonical upgrade script');
});

test('update scripts explain slash commands run inside the AI CLI, not the terminal shell', () => {
  const sh = readFileSync(UPD_SH, 'utf8');
  const ps1 = readFileSync(UPD_PS1, 'utf8');

  for (const [name, src] of [['update.sh', sh], ['update.ps1', ps1]]) {
    assert.match(src, /AI CLI session/, `${name} must name where slash commands run`);
    assert.match(src, /not .*terminal shell|not .*zsh|not .*PowerShell/i, `${name} must prevent users from running /supervibe-adapt in the OS shell`);
    assert.match(src, /\/supervibe-adapt/, `${name} must keep the project refresh command visible`);
  }
});

test('update.ps1 has Stop ErrorAction + dirty-check + delegation', () => {
  const src = readFileSync(UPD_PS1, 'utf8');
  assert.match(src, /\$ErrorActionPreference\s*=\s*'Stop'/, 'must enable Stop action');
  assert.match(src, /Invoke-FirstInstall/, 'must handle first-time install when checkout is missing');
  assert.match(src, /SUPERVIBE_INSTALL_URL/, 'must allow overriding the delegated installer URL');
  assert.match(src, /install\.ps1/, 'must delegate missing checkouts to install.ps1');
  assert.match(src, /status --porcelain/, 'must check for uncommitted changes before updating');
  assert.match(src, /\$trackedDirty/, 'must refuse tracked edits specifically');
  assert.match(src, /untracked stale file/, 'must allow stale untracked cleanup through canonical upgrader');
  assert.match(src, /npm run supervibe:upgrade/, 'must delegate to the canonical upgrade script');
});

test('update scripts use the same plugin-marketplace path layout as install scripts', () => {
  const sh = readFileSync(UPD_SH, 'utf8');
  const ps1 = readFileSync(UPD_PS1, 'utf8');
  assert.match(sh, /\.claude\/plugins\/marketplaces\/supervibe-marketplace/);
  assert.match(ps1, /\.claude\\plugins\\marketplaces\\supervibe-marketplace/);
});

test('update scripts honor SUPERVIBE_PLUGIN_ROOT env override', () => {
  const sh = readFileSync(UPD_SH, 'utf8');
  const ps1 = readFileSync(UPD_PS1, 'utf8');
  assert.match(sh,  /SUPERVIBE_PLUGIN_ROOT/);
  assert.match(ps1, /SUPERVIBE_PLUGIN_ROOT/);
});
