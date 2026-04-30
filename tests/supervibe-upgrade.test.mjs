import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("supervibe-upgrade rebuilds generated registry before final audit", async () => {
  const source = await readFile("scripts/supervibe-upgrade.mjs", "utf8");
  const registryBuild = source.indexOf("[supervibe:upgrade] npm run registry:build");
  const finalCheck = source.indexOf("[supervibe:upgrade] npm run check");
  const installDoctor = source.indexOf("[supervibe:upgrade] npm run supervibe:install-doctor");

  assert.notEqual(registryBuild, -1, "upgrade should run npm run registry:build");
  assert.notEqual(finalCheck, -1, "upgrade should run npm run check");
  assert.notEqual(installDoctor, -1, "upgrade should run install lifecycle doctor");
  assert.ok(registryBuild < finalCheck, "registry.yaml must be generated before npm run check");
  assert.ok(finalCheck < installDoctor, "install lifecycle doctor should run after the full check");
  assert.match(source, /generated registry\.yaml is required before final audit/);
  assert.match(source, /install lifecycle audit did not pass/);
});

test("supervibe-upgrade cleans stale untracked plugin files before reinstall", async () => {
  const source = await readFile("scripts/supervibe-upgrade.mjs", "utf8");
  const clean = source.indexOf("clean managed checkout (git clean -ffdx)");
  const install = source.indexOf("[supervibe:upgrade] npm ci");

  assert.notEqual(clean, -1, "upgrade should clean stale plugin checkout files");
  assert.notEqual(install, -1, "upgrade should reinstall dependencies");
  assert.ok(clean < install, "stale files must be cleaned before npm ci");
  assert.match(source, /tracked changes in the plugin checkout/);
});

test("supervibe-upgrade avoids shell true while preserving Windows npm command resolution", async () => {
  const source = await readFile("scripts/supervibe-upgrade.mjs", "utf8");

  assert.match(source, /commandForPlatform/);
  assert.match(source, /cmd === 'npm'/);
  assert.match(source, /\$\{cmd\}\.cmd/);
  assert.doesNotMatch(source, /shell:\s*process\.platform === ['"]win32['"]/);
});

test("supervibe-upgrade self-heals package-lock drift from older installer runs", async () => {
  const source = await readFile("scripts/supervibe-upgrade.mjs", "utf8");

  assert.match(source, /isPackageLockOnlyDrift/);
  assert.match(source, /restoring package-lock\.json drift/);
  assert.match(source, /git', \['checkout', '--', 'package-lock\.json'\]/);
});

test("supervibe-upgrade preserves auto-update lock and state during git clean", async () => {
  const source = await readFile("scripts/supervibe-upgrade.mjs", "utf8");

  assert.match(source, /\.claude-plugin\/\.auto-update\.json/);
  assert.match(source, /\.claude-plugin\/\.auto-update\.lock/);
});

test("supervibe-upgrade skips Git LFS smudge before optional lfs pull", async () => {
  const source = await readFile("scripts/supervibe-upgrade.mjs", "utf8");
  const noSmudge = source.indexOf("runGitNoLfsSmudge(['fetch'");
  const optionalPull = source.indexOf("console.log(`[supervibe:upgrade] git lfs pull");

  assert.notEqual(noSmudge, -1, "upgrade should have an LFS-smudge-free git path");
  assert.notEqual(optionalPull, -1, "upgrade should keep optional git lfs pull");
  assert.ok(noSmudge < optionalPull, "fetch/pull must skip LFS smudge before optional LFS pull");
  assert.match(source, /GIT_LFS_SKIP_SMUDGE/);
});

test("supervibe-upgrade makes optional Git LFS pull bounded and skippable", async () => {
  const source = await readFile("scripts/supervibe-upgrade.mjs", "utf8");

  assert.match(source, /SUPERVIBE_SKIP_LFS/, "upgrade should support skipping optional LFS prefetch");
  assert.match(source, /SUPERVIBE_LFS_TIMEOUT_MS/, "upgrade should support a millisecond LFS timeout override");
  assert.match(source, /SUPERVIBE_LFS_TIMEOUT_SECONDS/, "upgrade should support a seconds-based LFS timeout override");
  assert.match(source, /timeout,/, "upgrade should pass a timeout to spawnSync");
  assert.match(source, /ETIMEDOUT/, "upgrade should detect LFS timeout failures");
  assert.match(source, /join\(PLUGIN_ROOT, '\.git', 'lfs', 'incomplete'\)/, "upgrade should clean incomplete LFS downloads");
  assert.match(source, /rmSync\(incomplete, \{ recursive: true, force: true \}\)/, "upgrade should remove incomplete LFS downloads safely");
});
