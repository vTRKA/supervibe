import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { classifyWorkItemGraphForGc, scanWorkItemGc } from "../scripts/lib/supervibe-work-item-gc.mjs";
import { buildCleanupReachability } from "../scripts/lib/supervibe-cleanup-reachability.mjs";

test("completed work graphs leave hot context after configurable grace period", async () => {
  const graph = {
    graph_id: "done",
    updatedAt: "2026-05-06T00:00:00.000Z",
    items: [
      { itemId: "done", type: "epic", status: "complete" },
      { itemId: "T1", type: "task", status: "complete" },
    ],
  };
  const classification = classifyWorkItemGraphForGc(graph, {
    graphPath: ".supervibe/memory/work-items/done/graph.json",
    completedGraceHours: 1,
    now: "2026-05-06T02:00:00.000Z",
    fileMtime: "2026-05-06T00:00:00.000Z",
  });
  assert.equal(classification.archiveCandidate, true);
  assert.equal(classification.reason, "completed-grace");
});

test("terminal graphs are archivable in cleanup reachability instead of active hot roots", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-lifecycle-cleanup-"));
  try {
    await writeJson(root, ".supervibe/memory/work-items/done/graph.json", {
      graph_id: "done",
      updatedAt: "2026-05-06T00:00:00.000Z",
      items: [
        { itemId: "done", type: "epic", status: "complete" },
        { itemId: "T1", type: "task", status: "complete" },
      ],
    });
    const report = buildCleanupReachability({ rootDir: root, now: "2026-05-06T00:00:00.000Z" });
    assert.equal(report.byPath.get(".supervibe/memory/work-items/done/graph.json").lifecycleClass, "archivable");
    const scan = await scanWorkItemGc({ rootDir: root, now: "2026-05-06T02:00:00.000Z", completedGraceHours: 1 });
    assert.equal(scan.candidates[0].reason, "completed-grace");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writeJson(root, relPath, value) {
  const abs = join(root, ...relPath.split("/"));
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, JSON.stringify(value, null, 2) + "\n", "utf8");
}
