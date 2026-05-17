import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  ARTIFACT_SNAPSHOT_CONFIRM,
  applyArtifactSnapshotRetention,
  buildArtifactSnapshotStatus,
  createArtifactSnapshot,
  restoreArtifactSnapshot,
  scanArtifactSnapshotRetention,
} from "../scripts/supervibe-artifact-snapshot.mjs";

test("artifact snapshot captures workflow graph ledgers indexes locks and heartbeat without secrets", async () => {
  const root = await makeTempRoot("supervibe-artifact-snapshot-");
  try {
    await writeJson(join(root, ".supervibe/memory/active-workflow.json"), { stage: "execution" });
    await writeJson(join(root, ".supervibe/memory/work-items/epic-a/graph.json"), {
      graph_id: "epic-a",
      epicId: "epic-a",
      items: [{ itemId: "epic-a", type: "epic", status: "open" }],
      tasks: [],
    });
    await writeFile(join(root, ".supervibe/memory/workflow-invocation-ledger.jsonl"), "{\"receiptId\":\"r1\"}\n", "utf8");
    await writeFile(join(root, ".supervibe/memory/evidence-ledger.jsonl"), "{\"evidence\":\"e1\"}\n", "utf8");
    await writeFile(join(root, ".supervibe/memory/memory.db"), "memory-index", "utf8");
    await writeFile(join(root, ".supervibe/memory/code.db"), "code-index", "utf8");
    await writeJson(join(root, ".supervibe/memory/code-index-checkpoint.json"), { checkpoint: true });
    await writeFile(join(root, ".supervibe/memory/session.lock"), "locked", "utf8");
    await writeJson(join(root, ".supervibe/memory/worker-heartbeat.json"), { alive: true });
    await writeFile(join(root, ".supervibe/memory/workflow-receipt-runtime.key"), "secret", "utf8");

    const result = await createArtifactSnapshot({ rootDir: root, reason: "test snapshot", snapshotId: "snapshot-test" });
    const kinds = new Set(result.manifest.entries.map((entry) => entry.kind));
    const paths = result.manifest.entries.map((entry) => entry.path);

    assert.equal(result.manifest.snapshotId, "snapshot-test");
    assert.ok(kinds.has("active-workflow"));
    assert.ok(kinds.has("work-graph"));
    assert.ok(kinds.has("receipt-ledger"));
    assert.equal(kinds.has("memory-index"), false);
    assert.equal(kinds.has("code-index"), false);
    assert.ok(kinds.has("code-index-metadata"));
    assert.ok(result.manifest.excludedRebuildableCaches.includes(".supervibe/memory/code.db"));
    assert.ok(kinds.has("lock-or-heartbeat"));
    assert.equal(paths.some((path) => path.endsWith(".key")), false);
    assert.match(result.manifest.restoreCommand, new RegExp(`--confirm ${ARTIFACT_SNAPSHOT_CONFIRM}`));

    const status = await buildArtifactSnapshotStatus({ rootDir: root });
    assert.equal(status.status, "snapshot-present");
    assert.equal(status.mutationBlocked, false);
    assert.equal(status.latest.snapshotId, "snapshot-test");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("artifact snapshot restore is explicit and non-default", async () => {
  const root = await makeTempRoot("supervibe-artifact-restore-");
  try {
    const activeWorkflow = join(root, ".supervibe/memory/active-workflow.json");
    await writeJson(activeWorkflow, { stage: "before" });
    await writeJson(join(root, ".supervibe/memory/work-items/epic-a/graph.json"), {
      graph_id: "epic-a",
      epicId: "epic-a",
      items: [{ itemId: "epic-a", type: "epic", status: "open" }],
      tasks: [],
    });
    await writeFile(join(root, ".supervibe/memory/workflow-invocation-ledger.jsonl"), "{}\n", "utf8");
    await createArtifactSnapshot({ rootDir: root, snapshotId: "restore-test" });
    await writeJson(activeWorkflow, { stage: "after" });

    await assert.rejects(
      () => restoreArtifactSnapshot({ rootDir: root, snapshotId: "restore-test" }),
      /restore requires --confirm/,
    );

    const restored = await restoreArtifactSnapshot({
      rootDir: root,
      snapshotId: "restore-test",
      confirm: ARTIFACT_SNAPSHOT_CONFIRM,
    });
    assert.ok(restored.restored.includes(".supervibe/memory/active-workflow.json"));
    const current = JSON.parse(await readFile(activeWorkflow, "utf8"));
    assert.equal(current.stage, "before");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("artifact snapshot retention keeps latest and removes unreferenced heavy snapshots", async () => {
  const root = await makeTempRoot("supervibe-artifact-retention-");
  try {
    const snapshotRoot = join(root, ".supervibe", "memory", "artifact-snapshots");
    await writeJson(join(snapshotRoot, "latest-keep", "snapshot.json"), {
      snapshotId: "latest-keep",
      createdAt: "2026-05-17T00:00:00.000Z",
      entries: [],
    });
    await writeJson(join(snapshotRoot, "latest.json"), {
      schemaVersion: 1,
      snapshotId: "latest-keep",
      snapshotPath: ".supervibe/memory/artifact-snapshots/latest-keep/snapshot.json",
      createdAt: "2026-05-17T00:00:00.000Z",
    });
    await mkdir(join(snapshotRoot, "old-heavy"), { recursive: true });
    await writeFile(join(snapshotRoot, "old-heavy", "code.db.snapshot"), "x".repeat(64), "utf8");

    const scan = await scanArtifactSnapshotRetention({
      rootDir: root,
      now: "2026-05-18T00:00:00.000Z",
      maxBytes: 32,
      keepLast: 1,
    });
    assert.equal(scan.summary.snapshots, 2);
    assert.equal(scan.summary.candidates, 1);
    assert.equal(scan.candidates[0].snapshotId, "old-heavy");
    assert.equal(scan.protectedSnapshots[0].snapshotId, "latest-keep");

    const preview = await applyArtifactSnapshotRetention(scan, { rootDir: root, dryRun: true });
    assert.equal(preview.previewed, 1);
    assert.equal(existsSync(join(snapshotRoot, "old-heavy")), true);

    const applied = await applyArtifactSnapshotRetention(scan, {
      rootDir: root,
      dryRun: false,
      now: "2026-05-18T00:00:00.000Z",
    });
    assert.equal(applied.removed, 1);
    assert.equal(existsSync(join(snapshotRoot, "old-heavy")), false);
    assert.equal(existsSync(join(snapshotRoot, "latest-keep")), true);
    assert.equal(existsSync(join(root, ".supervibe", "memory", "artifact-snapshot-retention-log.jsonl")), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("artifact snapshot blocks unsafe snapshot root outside workspace snapshot area", async () => {
  const root = await makeTempRoot("supervibe-artifact-unsafe-");
  try {
    await assert.rejects(
      () => createArtifactSnapshot({ rootDir: root, snapshotRoot: "../outside" }),
      /snapshot root must stay under/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writeJson(file, data) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function makeTempRoot(prefix) {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(join(tmpdir(), prefix));
}
