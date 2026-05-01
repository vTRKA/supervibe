import assert from "node:assert/strict";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  archiveWorkItemGcCandidates,
  archiveWorkItemGraph,
  classifyWorkItemGraphForGc,
  formatWorkItemGcReport,
  restoreWorkItemGraph,
  scanWorkItemGc,
} from "../scripts/lib/supervibe-work-item-gc.mjs";

test("work-item GC archives only completed retained epics by default", async () => {
  const root = await makeTempRoot("supervibe-work-gc-");
  try {
    const donePath = await writeGraph(root, "epic-done", {
      graph_id: "epic-done",
      title: "Completed epic",
      updatedAt: "2026-01-01T00:00:00.000Z",
      items: [
        { itemId: "epic-done", type: "epic", status: "complete", title: "Completed epic" },
        { itemId: "T1", type: "task", status: "complete", title: "Done task", closedAt: "2026-01-01T00:00:00.000Z" },
      ],
      tasks: [{ id: "T1", status: "complete", closedAt: "2026-01-01T00:00:00.000Z" }],
    });
    await writeGraph(root, "epic-open", {
      graph_id: "epic-open",
      title: "Old open epic",
      updatedAt: "2025-01-01T00:00:00.000Z",
      items: [
        { itemId: "epic-open", type: "epic", status: "open", title: "Old open epic" },
        { itemId: "T2", type: "task", status: "open", title: "Still open" },
      ],
      tasks: [{ id: "T2", status: "open" }],
    });

    const dryScan = await scanWorkItemGc({
      rootDir: root,
      retentionDays: 14,
      staleOpenDays: 90,
      now: "2026-04-30T00:00:00.000Z",
    });
    const directClassification = classifyWorkItemGraphForGc(JSON.parse(await readFile(donePath, "utf8")), {
      graphPath: donePath,
      retentionDays: 14,
      now: "2026-04-30T00:00:00.000Z",
    });
    assert.equal(directClassification.archiveCandidate, true);
    assert.equal((await archiveWorkItemGraph(directClassification, {
      archiveRoot: join(root, ".supervibe", "memory", "work-items", ".archive"),
      dryRun: true,
    })).status, "preview");
    assert.deepEqual(dryScan.candidates.map((candidate) => candidate.graphId), ["epic-done"]);
    assert.match(formatWorkItemGcReport(dryScan), /completed-retention/);

    const staleScan = await scanWorkItemGc({
      rootDir: root,
      includeStaleOpen: true,
      staleOpenDays: 90,
      now: "2026-04-30T00:00:00.000Z",
    });
    assert.ok(staleScan.candidates.some((candidate) => candidate.graphId === "epic-open"));

    const archiveResult = await archiveWorkItemGcCandidates(dryScan, {
      rootDir: root,
      dryRun: false,
      now: "2026-04-30T00:00:00.000Z",
    });
    assert.equal(archiveResult.archived, 1);
    await assert.rejects(access(donePath));
    await access(archiveResult.results[0].archiveDir);
    assert.match(await readFile(join(root, ".supervibe", "memory", "work-items", ".archive", "_archive-log.jsonl"), "utf8"), /epic-done/);

    const restored = await restoreWorkItemGraph({ rootDir: root, graphId: "epic-done" });
    assert.equal(restored.restored, true);
    await access(donePath);
    assert.equal(JSON.parse(await readFile(donePath, "utf8")).graph_id, "epic-done");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writeGraph(root, epicId, graph) {
  const dir = join(root, ".supervibe", "memory", "work-items", epicId);
  await mkdir(dir, { recursive: true });
  const graphPath = join(dir, "graph.json");
  await writeFile(graphPath, `${JSON.stringify({ kind: "supervibe-work-item-graph", ...graph }, null, 2)}\n`, "utf8");
  return graphPath;
}

async function makeTempRoot(prefix) {
  const dir = await import("node:fs/promises").then(({ mkdtemp }) => mkdtemp(join(tmpdir(), prefix)));
  return dir;
}
