import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBackgroundSpawnOptions,
  normalizeProcessPathForPlatform,
  resolvePlatformProcessStrategy,
} from "../scripts/lib/supervibe-process-manager.mjs";
import { normalizeRelPath } from "../scripts/lib/supervibe-index-policy.mjs";
import { normalizeHostPath } from "../scripts/lib/supervibe-host-detector.mjs";

test("platform strategies define daemon stop behavior", () => {
  for (const platform of ["win32", "darwin", "linux"]) {
    const strategy = resolvePlatformProcessStrategy(platform);

    assert.equal(strategy.daemon.detached, true);
    assert.ok(strategy.daemon.stopBehavior, "platform strategy missing daemon stop behavior");
    assert.ok(strategy.heartbeat.fileName.includes("heartbeat"));
    assert.ok(strategy.lock.staleRecovery);
    assert.ok(strategy.logs.pathSeparator);
  }
});

test("Windows background spawn remains hidden and detached", () => {
  const opts = buildBackgroundSpawnOptions({ cwd: "C:/repo", env: {}, logs: {}, platform: "win32" });

  assert.equal(opts.detached, true);
  assert.equal(opts.windowsHide, true);
  assert.equal(opts.stdio, "ignore");
});

test("path normalization is deterministic across Windows and POSIX forms", () => {
  assert.equal(normalizeRelPath("src\\app\\main.ts"), "src/app/main.ts");
  assert.equal(normalizeHostPath("C:\\repo\\.cursor\\rules"), "c:/repo/.cursor/rules");
  assert.equal(normalizeProcessPathForPlatform("C:\\Repo\\App", "win32"), "c:/repo/app");
  assert.equal(normalizeProcessPathForPlatform("/Users/me/App", "darwin"), "/Users/me/App");
});
