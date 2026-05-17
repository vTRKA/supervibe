import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  cleanupRuntimeTargets,
  discoverHostManagedSubagentTargets,
  readRuntimeCleanupRegistry,
  registerRuntimeCleanupTarget,
  registerRuntimeCleanupTargetSync,
  summarizeHostManagedSubagentDebtSync,
} from "../scripts/lib/runtime-cleanup-registry.mjs";

test("runtime cleanup registry removes stale pids and preserves host-managed subagents", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-runtime-cleanup-"));
  const registryPath = join(root, "runtime-cleanup-registry.json");
  try {
    await registerRuntimeCleanupTarget({
      id: "dead-preview",
      kind: "preview-server",
      pid: 99999999,
      port: 3099,
    }, { path: registryPath });
    await registerRuntimeCleanupTarget({
      id: "agent-1",
      kind: "subagent",
      stopMode: "host-managed",
    }, { path: registryPath });

    const result = await cleanupRuntimeTargets({ path: registryPath });
    const registry = await readRuntimeCleanupRegistry(registryPath);

    assert.equal(result.checked, 2);
    assert.equal(result.stale, 1);
    assert.equal(result.hostManaged, 1);
    assert.equal(registry.targets.length, 1);
    assert.equal(registry.targets[0].id, "agent-1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime cleanup discovers completed Codex subagents and requires host close before pruning", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-runtime-cleanup-subagent-"));
  const registryPath = join(root, ".supervibe", "memory", "runtime-cleanup-registry.json");
  const invocationLog = join(root, ".supervibe", "memory", "agent-invocations.jsonl");
  try {
    await mkdir(join(root, ".supervibe", "memory"), { recursive: true });
    await writeFile(invocationLog, `${JSON.stringify({
      ts: "2026-05-14T00:00:00.000Z",
      agent_id: "stack-developer",
      host: "codex",
      host_invocation_source: "codex-spawn-agent",
      host_invocation_id: "codex-worker-1",
      invocation_id: "codex-worker-1",
      status: "completed",
    })}\n`, "utf8");

    const discovered = await discoverHostManagedSubagentTargets({ rootDir: root });
    assert.equal(discovered.length, 1);
    assert.equal(discovered[0].hostInvocationId, "codex-worker-1");

    const dryRun = await cleanupRuntimeTargets({ path: registryPath, rootDir: root, dryRun: true });
    assert.equal(dryRun.hostManagedCompleted, 1);
    assert.equal(dryRun.results[0].status, "host-managed-close-required");

    const debt = summarizeHostManagedSubagentDebtSync({ rootDir: root, path: registryPath, includeInvocationLog: true });
    assert.equal(debt.count, 0);
    assert.equal(debt.diagnosticCount, 1);
    assert.equal(debt.globalCount, 1);
    assert.deepEqual(debt.diagnostics.map((item) => item.hostInvocationId), ["codex-worker-1"]);
    const strictDebt = summarizeHostManagedSubagentDebtSync({ rootDir: root, path: registryPath, includeInvocationLog: true, strictRelease: true });
    assert.equal(strictDebt.count, 1);
    assert.deepEqual(strictDebt.closeRequired.map((item) => item.hostInvocationId), ["codex-worker-1"]);
    const defaultDebt = summarizeHostManagedSubagentDebtSync({ rootDir: root, path: registryPath });
    assert.equal(defaultDebt.count, 0);
    assert.equal(defaultDebt.diagnosticCount, 1);
    assert.equal(defaultDebt.discovered, 1);

    const pruned = await cleanupRuntimeTargets({
      path: registryPath,
      rootDir: root,
      confirmHostClosed: true,
    });
    assert.equal(pruned.hostManagedPruned, 1);
    const registry = await readRuntimeCleanupRegistry(registryPath);
    assert.equal(registry.targets.length, 0);
    assert.equal(registry.hostManagedClosedInvocations.length, 1);
    assert.equal(registry.hostManagedClosedInvocations[0].hostInvocationId, "codex-worker-1");

    const secondDryRun = await cleanupRuntimeTargets({ path: registryPath, rootDir: root, dryRun: true });
    assert.equal(secondDryRun.checked, 0);
    assert.equal(secondDryRun.completedHostInvocationsDiscovered, 0);

    const debtAfterPrune = summarizeHostManagedSubagentDebtSync({ rootDir: root, path: registryPath, includeInvocationLog: true });
    assert.equal(debtAfterPrune.count, 0);
    assert.equal(debtAfterPrune.discovered, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime cleanup discovery deduplicates repeated completed Codex invocation log rows", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-runtime-cleanup-dedupe-"));
  const registryPath = join(root, ".supervibe", "memory", "runtime-cleanup-registry.json");
  const invocationLog = join(root, ".supervibe", "memory", "agent-invocations.jsonl");
  try {
    await mkdir(join(root, ".supervibe", "memory"), { recursive: true });
    const row = JSON.stringify({
      ts: "2026-05-14T00:00:00.000Z",
      agent_id: "stack-developer",
      host: "codex",
      host_invocation_source: "codex-spawn-agent",
      host_invocation_id: "codex-worker-1",
      invocation_id: "codex-worker-1",
      status: "completed",
    });
    await writeFile(invocationLog, `${row}\n${row}\n`, "utf8");

    const discovered = await discoverHostManagedSubagentTargets({ rootDir: root });
    assert.equal(discovered.length, 1);

    const debt = summarizeHostManagedSubagentDebtSync({ rootDir: root, path: registryPath });
    assert.equal(debt.count, 0);
    assert.equal(debt.diagnosticCount, 1);
    assert.equal(debt.discovered, 1);
    const strictDebt = summarizeHostManagedSubagentDebtSync({ rootDir: root, path: registryPath, strictRelease: true });
    assert.equal(strictDebt.count, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime cleanup unused mode preserves young live targets and selects old ones", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-runtime-cleanup-unused-"));
  const registryPath = join(root, "runtime-cleanup-registry.json");
  const now = new Date("2026-05-13T12:00:00.000Z");
  try {
    registerRuntimeCleanupTargetSync({
      id: "old-ui",
      kind: "daemon",
      pid: process.pid,
      registeredAt: "2026-05-13T10:00:00.000Z",
      lastSeenAt: "2026-05-13T10:00:00.000Z",
    }, { path: registryPath });
    await registerRuntimeCleanupTarget({
      id: "fresh-ui",
      kind: "daemon",
      pid: process.pid,
      registeredAt: "2026-05-13T11:59:00.000Z",
      lastSeenAt: "2026-05-13T11:59:00.000Z",
    }, { path: registryPath });

    const result = await cleanupRuntimeTargets({
      path: registryPath,
      dryRun: true,
      unusedOnly: true,
      olderThanMinutes: 60,
      now,
    });

    assert.equal(result.checked, 2);
    assert.equal(result.wouldStop, 1);
    assert.equal(result.active, 1);
    assert.ok(result.results.some((item) => item.id === "old-ui" && item.status === "would-stop"));
    assert.ok(result.results.some((item) => item.id === "fresh-ui" && item.status === "kept-active"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime cleanup refuses live orphaned server pid files without ownership proof", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-runtime-cleanup-pid-"));
  const registryPath = join(root, ".supervibe", "memory", "runtime-cleanup-registry.json");
  const pidDir = join(root, ".supervibe", "servers");
  await mkdir(pidDir, { recursive: true });
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
    windowsHide: true,
  });
  try {
    await waitForPid(child.pid);
    const pidFile = join(pidDir, "orphan-ui.pid");
    await writeFile(pidFile, `${child.pid}\n`, "utf8");

    const result = await cleanupRuntimeTargets({
      path: registryPath,
      rootDir: root,
      includeServerPidFiles: true,
      unusedOnly: true,
      olderThanMinutes: 0,
    });

    assert.equal(result.serverPidFilesChecked, 1);
    assert.equal(result.ownershipUnverified, 1);
    assert.ok(result.results.some((item) => item.id === "pid-file:orphan-ui" && item.status === "ownership-unverified"));
    assert.equal(isPidAlive(child.pid), true);
    assert.equal(existsSync(pidFile), true);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await rm(root, { recursive: true, force: true });
  }
});

test("runtime cleanup removes dead orphaned server pid files", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-runtime-cleanup-dead-pid-"));
  const registryPath = join(root, ".supervibe", "memory", "runtime-cleanup-registry.json");
  const pidDir = join(root, ".supervibe", "servers");
  await mkdir(pidDir, { recursive: true });
  try {
    const pidFile = join(pidDir, "dead-ui.pid");
    await writeFile(pidFile, "99999999\n", "utf8");
    const result = await cleanupRuntimeTargets({
      path: registryPath,
      rootDir: root,
      includeServerPidFiles: true,
      unusedOnly: true,
      olderThanMinutes: 0,
    });

    assert.equal(result.serverPidFilesChecked, 1);
    assert.ok(result.results.some((item) => item.id === "pid-file:dead-ui" && item.status === "stale"));
    assert.equal(existsSync(pidFile), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Windows process-tree cleanup requires full registered script path match", async () => {
  if (process.platform !== "win32") {
    assert.ok(true, "Windows-only process command-line ownership check");
    return;
  }
  const root = await mkdtemp(join(tmpdir(), "supervibe-runtime-cleanup-path-check-"));
  const registryPath = join(root, ".supervibe", "memory", "runtime-cleanup-registry.json");
  const expectedDir = join(root, "expected");
  const actualDir = join(root, "actual");
  await mkdir(expectedDir, { recursive: true });
  await mkdir(actualDir, { recursive: true });
  const expectedScript = join(expectedDir, "daemon.mjs");
  const actualScript = join(actualDir, "daemon.mjs");
  await writeFile(expectedScript, "setInterval(() => {}, 1000);\n", "utf8");
  await writeFile(actualScript, "setInterval(() => {}, 1000);\n", "utf8");
  const child = spawn(process.execPath, [actualScript, "--foreground"], {
    stdio: "ignore",
    windowsHide: true,
  });
  try {
    await waitForPid(child.pid);
    await registerRuntimeCleanupTarget({
      id: "wrong-daemon-path",
      kind: "daemon",
      pid: child.pid,
      stopMode: "process-tree",
      scriptPath: expectedScript,
      registeredAt: "2026-05-13T10:00:00.000Z",
      lastSeenAt: "2026-05-13T10:00:00.000Z",
    }, { path: registryPath });

    const result = await cleanupRuntimeTargets({
      path: registryPath,
      rootDir: root,
      dryRun: true,
      unusedOnly: true,
      olderThanMinutes: 0,
      platform: "win32",
    });

    assert.ok(result.results.some((item) => item.id === "wrong-daemon-path" && item.status === "ownership-unverified"));
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await rm(root, { recursive: true, force: true });
  }
});

function waitForPid(pid, timeoutMs = 5000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (isPidAlive(pid)) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`pid ${pid} did not become alive`));
      }
    }, 25);
  });
}

function waitForChildExit(child, timeoutMs = 5000) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`child process ${child.pid} did not exit within ${timeoutMs}ms`));
    }, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
