import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { scanSupervibeArtifactGc } from "../scripts/lib/supervibe-artifact-gc.mjs";
import { createArtifactSnapshot } from "../scripts/supervibe-artifact-snapshot.mjs";

const NOW = "2026-05-06T00:00:00.000Z";

test("archive budget keeps newest N and protects live compact archive blobs", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-archive-budget-"));
  try {
    const old = await writeText(root, ".supervibe/.archive/gc/old/file.json", "old archive payload\n");
    const newer = await writeText(root, ".supervibe/.archive/gc/new/file.json", "new archive payload\n");
    const liveBlob = await writeText(root, ".supervibe/.archive/agent-outputs/live/agent-output.json.gz", "live compact blob\n");
    await writeText(root, ".supervibe/artifacts/_agent-outputs/live/agent-output.json", JSON.stringify({
      type: "supervibe-agent-output-compact-manifest",
      archivePath: ".supervibe/.archive/agent-outputs/live/agent-output.json.gz",
      originalPath: ".supervibe/artifacts/_agent-outputs/live/agent-output.json",
    }, null, 2) + "\n");
    await utimes(old, new Date("2026-01-01T00:00:00.000Z"), new Date("2026-01-01T00:00:00.000Z"));
    await utimes(newer, new Date("2026-05-05T00:00:00.000Z"), new Date("2026-05-05T00:00:00.000Z"));
    await utimes(liveBlob, new Date("2026-01-01T00:00:00.000Z"), new Date("2026-01-01T00:00:00.000Z"));

    const scan = await scanSupervibeArtifactGc({ rootDir: root, now: NOW, archiveRetentionDays: 1, maxArchiveBytes: 10, archiveKeepLast: 1 });
    assert.ok(scan.archiveCleanup.some((item) => item.relPath === ".supervibe/.archive/gc/old/file.json"));
    assert.equal(scan.archiveCleanup.some((item) => item.relPath === ".supervibe/.archive/gc/new/file.json"), false);
    assert.equal(scan.archiveCleanup.some((item) => item.relPath === ".supervibe/.archive/agent-outputs/live/agent-output.json.gz"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("artifact snapshots exclude rebuildable sqlite caches by default", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-snapshot-budget-"));
  try {
    await writeText(root, ".supervibe/memory/active-workflow.json", "{}\n");
    await writeText(root, ".supervibe/memory/workflow-invocation-ledger.jsonl", "{}\n");
    await writeText(root, ".supervibe/memory/work-items/epic/graph.json", JSON.stringify({ graph_id: "epic", items: [{ itemId: "epic", type: "epic", status: "open" }] }) + "\n");
    await writeText(root, ".supervibe/memory/memory.db", "memory db\n");
    await writeText(root, ".supervibe/memory/code.db", "code db\n");
    await writeText(root, ".supervibe/memory/code-index-checkpoint.json", "{}\n");
    const result = await createArtifactSnapshot({ rootDir: root, snapshotId: "no-cache" });
    const paths = result.manifest.entries.map((entry) => entry.path);
    assert.equal(paths.includes(".supervibe/memory/memory.db"), false);
    assert.equal(paths.includes(".supervibe/memory/code.db"), false);
    assert.ok(result.manifest.excludedRebuildableCaches.includes(".supervibe/memory/code.db"));
    assert.ok(result.manifest.rebuildCommands.some((command) => command.includes("build-code-index")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writeText(root, relPath, value) {
  const abs = join(root, ...relPath.split("/"));
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, value, "utf8");
  return abs;
}
