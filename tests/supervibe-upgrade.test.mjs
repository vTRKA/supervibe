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
  const install = source.indexOf("[supervibe:upgrade] npm install");

  assert.notEqual(clean, -1, "upgrade should clean stale plugin checkout files");
  assert.notEqual(install, -1, "upgrade should reinstall dependencies");
  assert.ok(clean < install, "stale files must be cleaned before npm install");
  assert.match(source, /tracked changes in the plugin checkout/);
});

test("supervibe-upgrade preserves auto-update lock and state during git clean", async () => {
  const source = await readFile("scripts/supervibe-upgrade.mjs", "utf8");

  assert.match(source, /\.claude-plugin\/\.auto-update\.json/);
  assert.match(source, /\.claude-plugin\/\.auto-update\.lock/);
});

test("supervibe-upgrade skips Git LFS smudge before optional lfs pull", async () => {
  const source = await readFile("scripts/supervibe-upgrade.mjs", "utf8");
  const noSmudge = source.indexOf("runGitNoLfsSmudge(['fetch'");
  const optionalPull = source.indexOf("console.log('[supervibe:upgrade] git lfs pull");

  assert.notEqual(noSmudge, -1, "upgrade should have an LFS-smudge-free git path");
  assert.notEqual(optionalPull, -1, "upgrade should keep optional git lfs pull");
  assert.ok(noSmudge < optionalPull, "fetch/pull must skip LFS smudge before optional LFS pull");
  assert.match(source, /GIT_LFS_SKIP_SMUDGE/);
});
