import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { buildCleanupReachability } from "../scripts/lib/supervibe-cleanup-reachability.mjs";

const NOW = "2026-05-06T00:00:00.000Z";

test("cleanup reachability protects active roots and compact archive blobs", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-cleanup-reachability-"));
  try {
    await writeJson(root, ".supervibe/memory/active-workflow.json", { stage: "executing" });
    await writeJson(root, ".supervibe/memory/work-items/done/graph.json", {
      graph_id: "done",
      items: [
        { itemId: "done", type: "epic", status: "complete" },
        { itemId: "T1", type: "task", status: "complete" },
      ],
    });
    await writeJson(root, ".supervibe/artifacts/_agent-outputs/run/agent-output.json", {
      type: "supervibe-agent-output-compact-manifest",
      archivePath: ".supervibe/.archive/agent-outputs/run/agent-output.json.gz",
      originalPath: ".supervibe/artifacts/_agent-outputs/run/agent-output.json",
    });
    await writeText(root, ".supervibe/.archive/agent-outputs/run/agent-output.json.gz", "compressed");
    await writeText(root, ".supervibe/.archive/gc/old/file.txt", "old archive");
    const old = new Date("2026-05-01T00:00:00.000Z");
    await utimes(join(root, ".supervibe", "memory", "work-items", "done", "graph.json"), old, old);

    const report = buildCleanupReachability({ rootDir: root, now: NOW });
    const byPath = report.byPath;
    assert.equal(byPath.get(".supervibe/memory/active-workflow.json").lifecycleClass, "hot");
    assert.equal(byPath.get(".supervibe/memory/work-items/done/graph.json").lifecycleClass, "archivable");
    assert.equal(byPath.get(".supervibe/.archive/agent-outputs/run/agent-output.json.gz").lifecycleClass, "protected");
    assert.equal(byPath.get(".supervibe/.archive/gc/old/file.txt").lifecycleClass, "cold");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writeJson(root, relPath, value) {
  await writeText(root, relPath, JSON.stringify(value, null, 2) + "\n");
}

async function writeText(root, relPath, value) {
  const abs = join(root, ...relPath.split("/"));
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, value, "utf8");
}
