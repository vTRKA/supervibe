import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("supervibe-upgrade self-heals installer-managed tracked artifacts before refusing user edits", async () => {
  const source = await readFile("scripts/supervibe-upgrade.mjs", "utf8");
  const helper = await readFile("scripts/lib/installer-managed-checkout.mjs", "utf8");

  assert.match(source, /partitionTrackedPorcelainLines/);
  assert.match(source, /restoreInstallerManagedTrackedEdits/);
  assert.match(source, /installer-managed tracked artifact/);
  assert.match(source, /runGitNoLfsSmudge\(\['checkout', '--', path\]\)/);
  assert.match(helper, /models\/Xenova\/multilingual-e5-small\/onnx\/model_quantized\.onnx|MODEL_RELATIVE_PATH/);
  assert.match(helper, /package-lock\.json/);
});

test("supervibe-upgrade preserves auto-update lock and state during git clean", async () => {
  const source = await readFile("scripts/supervibe-upgrade.mjs", "utf8");

  assert.match(source, /\.claude-plugin\/\.auto-update\.json/);
  assert.match(source, /\.claude-plugin\/\.auto-update\.lock/);
});

test("supervibe-upgrade skips Git LFS smudge before required ONNX setup", async () => {
  const source = await readFile("scripts/supervibe-upgrade.mjs", "utf8");
  const noSmudge = source.indexOf("runGitNoLfsSmudge(['fetch'");
  const modelSetup = source.indexOf("scripts/ensure-onnx-model.mjs");

  assert.notEqual(noSmudge, -1, "upgrade should have an LFS-smudge-free git path");
  assert.notEqual(modelSetup, -1, "upgrade should run required ONNX model setup");
  assert.ok(noSmudge < modelSetup, "fetch/pull must skip LFS smudge before required model setup");
  assert.match(source, /GIT_LFS_SKIP_SMUDGE/);
});

test("supervibe-upgrade requires ONNX model setup before npm ci", async () => {
  const source = await readFile("scripts/supervibe-upgrade.mjs", "utf8");
  const modelScript = await readFile("scripts/ensure-onnx-model.mjs", "utf8");
  const modelSetup = source.indexOf("[supervibe:upgrade] ensuring required ONNX embedding model");
  const npmCi = source.indexOf("[supervibe:upgrade] npm ci");

  assert.notEqual(modelSetup, -1, "upgrade should announce required ONNX setup");
  assert.notEqual(npmCi, -1, "upgrade should still run npm ci");
  assert.ok(modelSetup < npmCi, "upgrade must prepare the required model before npm ci/check declares success");
  assert.doesNotMatch(source, /SUPERVIBE_SKIP_LFS|SUPERVIBE_PREFETCH_LFS/, "upgrade must not let users skip the required ONNX model");
  assert.match(modelScript, /SUPERVIBE_LFS_STALL_TIMEOUT_MS/, "shared setup should support a millisecond LFS stall override");
  assert.match(modelScript, /SUPERVIBE_LFS_STALL_TIMEOUT_SECONDS/, "shared setup should support a seconds-based LFS stall override");
  assert.match(modelScript, /SUPERVIBE_MODEL_STALL_TIMEOUT_MS/, "shared setup should support a direct download stall override");
  assert.match(modelScript, /no total timeout/, "shared setup should not impose a total model download limit");
  assert.match(modelScript, /download stalled with no progress/, "shared setup should fail only on stalled direct download progress");
  assert.match(modelScript, /content-length/, "shared setup should report percent when the server provides model size");
  assert.doesNotMatch(modelScript, /SUPERVIBE_MODEL_DOWNLOAD_TIMEOUT_MS|DEFAULT_DOWNLOAD_TIMEOUT_MS|request\.setTimeout/, "direct model download must not use an absolute timeout");
  assert.match(modelScript, /join\(rootDir, "\.git", "lfs", "incomplete"\)/, "shared setup should clean incomplete LFS downloads");
  assert.match(modelScript, /rmSync\(incomplete, \{ recursive: true, force: true \}\)/, "shared setup should remove incomplete LFS downloads safely");
});
