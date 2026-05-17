import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  AUTO_GC_LOCK_REL_PATH,
  AUTO_GC_STATE_REL_PATH,
  createAutoGcMaintenancePlan,
  formatAutoGcMaintenanceStatus,
  runAutoGcMaintenance,
  spawnDetachedAutoGcMaintenance,
  writeAutoGcMaintenanceState,
} from "../scripts/lib/supervibe-auto-gc-maintenance.mjs";

async function createTempRoot(name) {
  const root = join(tmpdir(), `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(root, { recursive: true });
  return root;
}

test("auto GC applies only due auto-safe artifacts and memory entries", async () => {
  const root = await createTempRoot("supervibe-auto-gc-apply");
  const now = "2026-05-17T00:00:00.000Z";
  try {
    const logPath = join(root, ".supervibe", "servers", "old-preview.log");
    await mkdir(join(root, ".supervibe", "servers"), { recursive: true });
    await writeFile(logPath, "old preview log\n", "utf8");
    await utimes(logPath, new Date("2026-04-01T00:00:00.000Z"), new Date("2026-04-01T00:00:00.000Z"));

    const decisionsDir = join(root, ".supervibe", "memory", "decisions");
    await mkdir(decisionsDir, { recursive: true });
    await writeFile(join(decisionsDir, "new.md"), [
      "---",
      "id: decision-new",
      "date: 2026-05-01",
      "confidence: 10",
      "---",
      "Current decision.",
    ].join("\n"), "utf8");
    await writeFile(join(decisionsDir, "old.md"), [
      "---",
      "id: decision-old",
      "date: 2026-01-01",
      "superseded-by: decision-new",
      "confidence: 10",
      "---",
      "Old decision.",
    ].join("\n"), "utf8");

    const plan = await createAutoGcMaintenancePlan({ rootDir: root, now, throttleMs: 0 });
    assert.equal(plan.status, "due");
    assert.equal(plan.shouldRun, true);
    assert.equal(plan.artifacts.autoSafeCandidates, 1);
    assert.equal(plan.memory.autoSafeCandidates, 1);

    const result = await runAutoGcMaintenance({ rootDir: root, now });
    assert.equal(result.status, "completed");
    assert.equal(result.artifacts.status, "applied");
    assert.equal(result.artifacts.archived, 1);
    assert.equal(result.memory.status, "applied");
    assert.equal(result.memory.archived, 1);
    assert.equal(existsSync(logPath), false);
    assert.equal(existsSync(join(decisionsDir, "old.md")), false);
    assert.equal(existsSync(join(root, ".supervibe", "memory", ".archive", "decisions", "old.md")), true);
    assert.equal(existsSync(join(root, ...AUTO_GC_LOCK_REL_PATH.split("/"))), false);

    const state = JSON.parse(await readFile(join(root, ...AUTO_GC_STATE_REL_PATH.split("/")), "utf8"));
    assert.equal(state.status, "completed");
    assert.equal(state.mode, "session-start-background-auto-safe");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("auto GC applies snapshot retention even when artifact schedule is not due", async () => {
  const root = await createTempRoot("supervibe-auto-gc-snapshots");
  const now = "2026-05-17T00:00:00.000Z";
  try {
    const snapshotRoot = join(root, ".supervibe", "memory", "artifact-snapshots");
    await mkdir(join(snapshotRoot, "latest"), { recursive: true });
    await writeFile(join(snapshotRoot, "latest", "snapshot.json"), JSON.stringify({
      snapshotId: "latest",
      createdAt: now,
      entries: [],
    }, null, 2), "utf8");
    await writeFile(join(snapshotRoot, "latest.json"), JSON.stringify({
      schemaVersion: 1,
      snapshotId: "latest",
      snapshotPath: ".supervibe/memory/artifact-snapshots/latest/snapshot.json",
      createdAt: now,
    }, null, 2), "utf8");
    await mkdir(join(snapshotRoot, "old-heavy"), { recursive: true });
    await writeFile(join(snapshotRoot, "old-heavy", "code.db.snapshot"), "x".repeat(128), "utf8");

    await mkdir(join(root, ".supervibe", "memory"), { recursive: true });
    await writeFile(join(root, ".supervibe", "memory", "artifact-gc-policy.json"), JSON.stringify({
      schemaVersion: 1,
      intervalDays: 7,
      lastRunAt: now,
    }, null, 2), "utf8");

    const plan = await createAutoGcMaintenancePlan({ rootDir: root, now, throttleMs: 0 });
    assert.equal(plan.status, "due");
    assert.equal(plan.shouldRun, true);
    assert.equal(plan.artifacts.due, false);
    assert.equal(plan.snapshots.candidates, 1);

    const result = await runAutoGcMaintenance({ rootDir: root, now });
    assert.equal(result.status, "completed");
    assert.equal(result.snapshots.status, "applied");
    assert.equal(result.snapshots.removed, 1);
    assert.equal(existsSync(join(snapshotRoot, "old-heavy")), false);
    assert.equal(existsSync(join(snapshotRoot, "latest")), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("auto GC plan respects live lock and recent queue throttle", async () => {
  const root = await createTempRoot("supervibe-auto-gc-lock");
  const now = "2026-05-17T00:00:00.000Z";
  try {
    const lockPath = join(root, ...AUTO_GC_LOCK_REL_PATH.split("/"));
    await mkdir(join(root, ".supervibe", "memory"), { recursive: true });
    await writeFile(lockPath, JSON.stringify({ pid: process.pid, startedAt: now }, null, 2), "utf8");
    const locked = await createAutoGcMaintenancePlan({ rootDir: root, now, throttleMs: 0 });
    assert.equal(locked.status, "locked");
    assert.equal(locked.shouldRun, false);

    await rm(lockPath, { force: true });
    await writeAutoGcMaintenanceState({
      rootDir: root,
      state: { status: "queued", lastStartedAt: now },
    });
    const throttled = await createAutoGcMaintenancePlan({
      rootDir: root,
      now: "2026-05-17T00:30:00.000Z",
      throttleMs: 60 * 60 * 1000,
    });
    assert.equal(throttled.status, "throttled");
    assert.equal(throttled.shouldRun, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("session-start auto GC queues a background planner without foreground scans", async () => {
  const root = await createTempRoot("supervibe-auto-gc-background-queue");
  const now = "2026-05-17T00:00:00.000Z";
  try {
    const spawned = [];
    const result = await spawnDetachedAutoGcMaintenance({
      rootDir: root,
      now,
      spawnImpl(command, args, options) {
        spawned.push({ command, args, options });
        return { pid: 12345, unref() {} };
      },
    });

    assert.equal(result.status, "queued");
    assert.equal(result.foregroundScan, false);
    assert.equal(spawned.length, 1);
    assert.ok(spawned[0].args.includes("--run-once"));
    assert.ok(spawned[0].args.includes("--root"));

    const state = JSON.parse(await readFile(join(root, ...AUTO_GC_STATE_REL_PATH.split("/")), "utf8"));
    assert.equal(state.status, "queued");
    assert.equal(state.lastStartedAt, now);
    assert.equal(state.plan.foregroundScan, false);

    const throttled = await spawnDetachedAutoGcMaintenance({
      rootDir: root,
      now: "2026-05-17T00:30:00.000Z",
      spawnImpl() {
        throw new Error("throttled session-start must not spawn or scan");
      },
    });
    assert.equal(throttled.status, "throttled");
    assert.equal(throttled.shouldRun, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("auto GC status is a cheap state read without planning scans", async () => {
  const root = await createTempRoot("supervibe-auto-gc-status");
  try {
    const logPath = join(root, ".supervibe", "servers", "old-preview.log");
    await mkdir(join(root, ".supervibe", "servers"), { recursive: true });
    await writeFile(logPath, "old preview log\n", "utf8");
    await utimes(logPath, new Date("2026-04-01T00:00:00.000Z"), new Date("2026-04-01T00:00:00.000Z"));

    const output = execFileSync(process.execPath, [
      join(process.cwd(), "scripts", "supervibe-auto-gc-maintenance.mjs"),
      "--root",
      root,
      "--status",
    ], { encoding: "utf8" });

    assert.match(output, /SUPERVIBE_AUTO_GC/);
    assert.match(output, /STATUS: never-run/);
    assert.match(output, /ARTIFACTS_CANDIDATES: 0/);
    assert.match(output, /MEMORY_CANDIDATES: 0/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("auto GC status format stays compact for session-start diagnostics", () => {
  const formatted = formatAutoGcMaintenanceStatus({
    status: "queued",
    shouldRun: true,
    artifacts: { due: true, candidates: 3, autoSafeCandidates: 2 },
    memory: { due: false, candidates: 0, autoSafeCandidates: 0 },
    state: { lastStartedAt: "2026-05-17T00:00:00.000Z", status: "queued" },
    nextAction: "auto GC queued in background",
  });
  assert.match(formatted, /SUPERVIBE_AUTO_GC/);
  assert.match(formatted, /STATUS: queued/);
  assert.match(formatted, /ARTIFACTS_AUTO_SAFE: 2/);
  assert.match(formatted, /NEXT_ACTION: auto GC queued in background/);
});
