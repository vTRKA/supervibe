import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  acquireAutoUpdateLock,
  createAutoUpdatePlan,
  isManagedInstallPath,
  resolveAutoUpdateMode,
} from "../scripts/lib/supervibe-auto-update.mjs";

test("auto-update mode defaults to managed and honors explicit env overrides", () => {
  assert.equal(resolveAutoUpdateMode({}), "managed");
  assert.equal(resolveAutoUpdateMode({ SUPERVIBE_AUTO_UPDATE: "apply" }), "apply");
  assert.equal(resolveAutoUpdateMode({ SUPERVIBE_AUTO_UPDATE: "1" }), "apply");
  assert.equal(resolveAutoUpdateMode({ SUPERVIBE_AUTO_UPDATE: "check" }), "check");
  assert.equal(resolveAutoUpdateMode({ SUPERVIBE_AUTO_UPDATE: "off" }), "off");
});

test("auto-update applies by default only for managed installer checkout", async () => {
  const home = join(tmpdir(), `supervibe-auto-home-${Date.now()}`);
  const managedRoot = join(home, ".claude", "plugins", "marketplaces", "supervibe-marketplace");
  const devRoot = join(home, "dev", "supervibe");
  await mkdir(join(managedRoot, ".git"), { recursive: true });
  await mkdir(join(devRoot, ".git"), { recursive: true });

  try {
    assert.equal(isManagedInstallPath(managedRoot, home), true);
    assert.equal(isManagedInstallPath(devRoot, home), false);

    const cache = { checkedAt: Date.now(), behind: 2 };
    const runtimeCapability = { installSupported: true, version: "25.0.0" };

    const managedPlan = createAutoUpdatePlan({
      pluginRoot: managedRoot,
      homeDir: home,
      cache,
      env: {},
      runtimeCapability,
    });
    assert.equal(managedPlan.apply, true);

    const devPlan = createAutoUpdatePlan({
      pluginRoot: devRoot,
      homeDir: home,
      cache,
      env: {},
      runtimeCapability,
    });
    assert.equal(devPlan.apply, false);
    assert.ok(devPlan.applyBlocked.includes("manual-host"));

    const forcedPlan = createAutoUpdatePlan({
      pluginRoot: devRoot,
      homeDir: home,
      cache,
      env: { SUPERVIBE_AUTO_UPDATE: "apply" },
      runtimeCapability,
    });
    assert.equal(forcedPlan.apply, true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("auto-update plan schedules stale checks without applying when mode is check", async () => {
  const root = join(tmpdir(), `supervibe-auto-root-${Date.now()}`);
  await mkdir(join(root, ".git"), { recursive: true });
  try {
    const plan = createAutoUpdatePlan({
      pluginRoot: root,
      cache: { checkedAt: Date.now() - 25 * 60 * 60 * 1000, behind: 3 },
      env: { SUPERVIBE_AUTO_UPDATE: "check" },
      runtimeCapability: { installSupported: true, version: "25.0.0" },
    });
    assert.equal(plan.check, true);
    assert.equal(plan.apply, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("auto-update lock prevents concurrent runners", async () => {
  const root = join(tmpdir(), `supervibe-auto-lock-${Date.now()}`);
  await mkdir(join(root, ".claude-plugin"), { recursive: true });
  try {
    const first = await acquireAutoUpdateLock(root);
    assert.equal(first.acquired, true);

    const second = await acquireAutoUpdateLock(root);
    assert.equal(second.acquired, false);

    await first.release();
    const third = await acquireAutoUpdateLock(root);
    assert.equal(third.acquired, true);
    await third.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
