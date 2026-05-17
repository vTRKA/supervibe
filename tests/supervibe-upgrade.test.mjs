import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

test("supervibe-upgrade rebuilds generated registry before final audit without running dev tests", async () => {
  const source = await readFile("scripts/supervibe-upgrade.mjs", "utf8");
  const registryBuild = source.indexOf("[supervibe:upgrade] npm run registry:build");
  const installDoctor = source.indexOf("[supervibe:upgrade] npm run supervibe:install-doctor");

  assert.notEqual(registryBuild, -1, "upgrade should run npm run registry:build");
  assert.notEqual(installDoctor, -1, "upgrade should run install lifecycle doctor");
  assert.ok(registryBuild < installDoctor, "registry.yaml must be generated before install lifecycle doctor");
  assert.doesNotMatch(source, /npm\s+run\s+check|['"]run['"]\s*,\s*['"]check['"]/, "user upgrade must not run the dev test suite");
  assert.match(source, /generated registry\.yaml is required before final audit/);
  assert.match(source, /install lifecycle audit did not pass/);
});

test("supervibe-upgrade cleans stale untracked plugin files before reinstall", async () => {
  const source = await readFile("scripts/supervibe-upgrade.mjs", "utf8");
  const clean = source.indexOf("clean managed checkout (git clean -ffdx)");
  const install = source.indexOf("[supervibe:upgrade] npm ci");
  const mirror = source.indexOf("assertMirrorCheckoutClean('git pull --ff-only')");

  assert.notEqual(clean, -1, "upgrade should clean stale plugin checkout files");
  assert.notEqual(install, -1, "upgrade should reinstall dependencies");
  assert.notEqual(mirror, -1, "upgrade should assert checkout mirror after pull");
  assert.ok(clean < install, "stale files must be cleaned before npm ci");
  assert.ok(mirror < install, "mirror assertion must happen before generated install files");
  assert.match(source, /tracked changes in the plugin checkout/);
});

test("supervibe-upgrade avoids shell true while preserving Windows npm command resolution", async () => {
  const source = await readFile("scripts/supervibe-upgrade.mjs", "utf8");

  assert.match(source, /commandInvocation/);
  assert.match(source, /cmd\.exe/);
  assert.match(source, /'\/d', '\/s', '\/c'/);
  assert.match(source, /\$\{cmd\}\.cmd/);
  assert.match(source, /r\.error/);
  assert.match(source, /failed to start/);
  assert.doesNotMatch(source, /shell:\s*process\.platform === ['"]win32['"]/);
});

test("supervibe-upgrade self-heals managed checkout tracked drift before refusing user edits", async () => {
  const source = await readFile("scripts/supervibe-upgrade.mjs", "utf8");
  const helper = await readFile("scripts/lib/installer-managed-checkout.mjs", "utf8");

  assert.match(source, /partitionTrackedPorcelainLines/);
  assert.match(source, /isManagedInstallPath/);
  assert.match(source, /SUPERVIBE_RESTORE_PLUGIN_DRIFT/);
  assert.match(source, /restoreAllTracked/);
  assert.match(source, /restoreInstallerManagedTrackedEdits/);
  assert.match(source, /managed checkout tracked drift|tracked local plugin drift/);
  assert.match(source, /run\('git', \['checkout', '--', path\]\)/);
  assert.doesNotMatch(helper, /models\/Xenova\/multilingual-e5-small\/onnx\/model_quantized\.onnx|MODEL_RELATIVE_PATH/);
  assert.match(helper, /package-lock\.json/);
  assert.match(helper, /tracked local plugin drift in managed checkout/);
});

test("supervibe-upgrade preserves auto-update lock and state during git clean", async () => {
  const source = await readFile("scripts/supervibe-upgrade.mjs", "utf8");

  assert.match(source, /\.claude-plugin\/\.auto-update\.json/);
  assert.match(source, /\.claude-plugin\/\.auto-update\.lock/);
  assert.match(source, /MODEL_RELATIVE_PATH/);
  assert.match(source, /'-e',\s*MODEL_RELATIVE_PATH/s);
});

test("supervibe-upgrade implements documented safe modes and rollback anchor", async () => {
  const source = await readFile("scripts/supervibe-upgrade.mjs", "utf8");

  assert.match(source, /SUPERVIBE_UPDATE_HELP/);
  assert.match(source, /--check/);
  assert.match(source, /--dry-run/);
  assert.match(source, /--rollback/);
  assert.match(source, /--to <git-ref>/);
  assert.match(source, /performUpstreamCheck/);
  assert.match(source, /SUPERVIBE_UPDATE_DRY_RUN/);
  assert.match(source, /\.supervibe-update-state\.json/);
  assert.match(source, /writeUpgradeState/);
  assert.match(source, /rollbackFromState/);
  assert.match(source, /git', \['checkout', '--quiet', args\.to\]/);
  assert.match(source, /install-windows-bin-shims\.mjs/);
  assert.match(source, /install-unix-bin-links\.mjs/);
});

test("supervibe-upgrade uses plain git before required ONNX setup", async () => {
  const source = await readFile("scripts/supervibe-upgrade.mjs", "utf8");
  const fetch = source.indexOf("run('git', ['fetch'");
  const modelSetup = source.indexOf("[supervibe:upgrade] ensuring required ONNX embedding model");

  assert.notEqual(fetch, -1, "upgrade should fetch through the normal git path");
  assert.notEqual(modelSetup, -1, "upgrade should run required ONNX model setup");
  assert.ok(fetch < modelSetup, "fetch/pull must run before required model setup");
  assert.doesNotMatch(source, /GIT_LFS_SKIP_SMUDGE|filter\.lfs|git lfs|runGitNoLfsSmudge/i);
});

test("supervibe-upgrade requires ONNX model setup before npm ci", async () => {
  const source = await readFile("scripts/supervibe-upgrade.mjs", "utf8");
  const modelScript = await readFile("scripts/ensure-onnx-model.mjs", "utf8");
  const modelSetup = source.indexOf("[supervibe:upgrade] ensuring required ONNX embedding model");
  const npmCi = source.indexOf("[supervibe:upgrade] npm ci");

  assert.notEqual(modelSetup, -1, "upgrade should announce required ONNX setup");
  assert.notEqual(npmCi, -1, "upgrade should still run npm ci");
  assert.ok(modelSetup < npmCi, "upgrade must prepare the required model before npm ci/check declares success");
  assert.doesNotMatch(source, /SUPERVIBE_SKIP_LFS|SUPERVIBE_PREFETCH_LFS|GIT_LFS_SKIP_SMUDGE|filter\.lfs/i, "upgrade must not let users skip the required ONNX model or depend on repository large-file filters");
  assert.match(modelScript, /no total timeout/, "shared setup should not impose a total model download limit");
  assert.match(modelScript, /no stall timeout/, "shared setup should not interrupt direct downloads");
  assert.match(modelScript, /content-length/, "shared setup should report percent when the server provides model size");
  assert.doesNotMatch(modelScript, /DEFAULT_DOWNLOAD_STALL_MS|SUPERVIBE_MODEL_STALL_TIMEOUT|SUPERVIBE_MODEL_DOWNLOAD_TIMEOUT|DEFAULT_DOWNLOAD_TIMEOUT|request\.setTimeout|setTimeout\(|GIT_LFS_SKIP_SMUDGE|filter\.lfs|git lfs/i, "direct model download must not use stall/absolute timeouts or repository large-file fallback");
});

test("supervibe-upgrade normalizes duplicate and inline Codex plugin config sections", async () => {
  const source = await readFile("scripts/supervibe-upgrade.mjs", "utf8");

  assert.match(source, /normalizeCodexPluginHooksConfigText/);
  assert.match(source, /splitInlineTomlSectionSetting/);
  assert.match(source, /dedupeTomlSection/);
  assert.match(source, /[plugins.\"${pluginKey}\"]/);
  assert.match(source, /upsertTomlSectionSetting\(output, pluginHeader, 'enabled', 'enabled = true'\)/);

  const helperStart = source.indexOf("function normalizeCodexPluginHooksConfigText");
  const helperEnd = source.indexOf("function refreshTerminalCommands");
  assert.ok(helperStart >= 0 && helperEnd > helperStart, "normalizer helper block should be extractable");
  const normalize = runInNewContext(`${source.slice(helperStart, helperEnd)}; normalizeCodexPluginHooksConfigText;`);
  const input = [
    "[features]",
    "plugins = false",
    "",
    "[plugins.\"supervibe@supervibe-marketplace\"]enabled = true",
    "",
    "[[hooks.SessionStart]]",
    "matcher = \"startup|resume|clear|compact\"",
    "",
    "[plugins.\"supervibe@supervibe-marketplace\"]",
    "enabled = true",
    "",
  ].join("\n");
  const output = normalize(input);

  assert.equal((output.match(/\[plugins\."supervibe@supervibe-marketplace"\]/g) || []).length, 1);
  assert.match(output, /\[plugins\."supervibe@supervibe-marketplace"\]\nenabled = true/);
  assert.doesNotMatch(output, /\[plugins\."supervibe@supervibe-marketplace"\]enabled/);
  assert.match(output, /\[features\][\s\S]*plugins = true/);
  assert.match(output, /\[\[hooks\.SessionStart\]\][\s\S]*matcher = "startup\|resume\|clear\|compact"/);
});
