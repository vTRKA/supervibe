import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildBackgroundSpawnOptions,
  normalizeProcessPathForPlatform,
  resolvePlatformProcessStrategy,
  startBackgroundNodeScript,
} from "../scripts/lib/supervibe-process-manager.mjs";
import {
  cleanupRuntimeTargets,
  defaultRuntimeCleanupRegistryPath,
  readRuntimeCleanupRegistry,
} from "../scripts/lib/runtime-cleanup-registry.mjs";
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

test("background node scripts write pid files and cleanup registry entries", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-background-process-"));
  const script = join(root, "daemon.mjs");
  await writeFile(script, "setInterval(() => {}, 1000);\n", "utf8");
  try {
    const child = startBackgroundNodeScript({
      scriptPath: script,
      cwd: root,
      name: "test-daemon",
      port: 4010,
    });
    assert.ok(child.pid, "daemon pid should be returned");
    assert.ok(existsSync(child.logs.pid), "daemon pid file should be written");

    const registry = await readRuntimeCleanupRegistry(defaultRuntimeCleanupRegistryPath(root));
    assert.ok(registry.targets.some((target) => target.pid === child.pid && target.id === "test-daemon:4010"));

    const result = await cleanupRuntimeTargets({
      rootDir: root,
      path: defaultRuntimeCleanupRegistryPath(root),
      unusedOnly: true,
      olderThanMinutes: 0,
    });
    assert.ok(result.results.some((item) => item.id === "test-daemon:4010" && item.status === "stopped"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
