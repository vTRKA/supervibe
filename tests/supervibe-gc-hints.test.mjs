import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildGcHints, formatGcHints } from "../scripts/lib/supervibe-gc-hints.mjs";

test("GC hints summarize work-item and memory cleanup candidates", async () => {
  const root = await makeTempRoot("supervibe-gc-hints-");
  try {
    await writeGraph(root);
    await writeMemory(root, "new", {});
    await writeMemory(root, "old", { "superseded-by": "new" });

    const hints = await buildGcHints({
      rootDir: root,
      now: "2026-04-30T00:00:00.000Z",
      retentionDays: 14,
    });
    assert.equal(hints.needsAttention, true);
    assert.equal(hints.workItems.candidates, 1);
    assert.equal(hints.memory.candidates, 1);
    assert.equal(hints.memory.schedule.due, true);
    assert.match(formatGcHints(hints), /MEMORY_GC_DUE: true/);
    assert.match(formatGcHints(hints), /supervibe:memory-gc/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writeGraph(root) {
  const dir = join(root, ".supervibe", "memory", "work-items", "epic-old");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "graph.json"), `${JSON.stringify({
    kind: "supervibe-work-item-graph",
    graph_id: "epic-old",
    updatedAt: "2026-01-01T00:00:00.000Z",
    items: [
      { itemId: "epic-old", type: "epic", status: "complete", title: "Old" },
      { itemId: "T1", type: "task", status: "complete", title: "Done", closedAt: "2026-01-01T00:00:00.000Z" },
    ],
    tasks: [{ id: "T1", status: "complete", closedAt: "2026-01-01T00:00:00.000Z" }],
  }, null, 2)}\n`, "utf8");
}

async function writeMemory(root, id, extra) {
  const dir = join(root, ".supervibe", "memory", "decisions");
  await mkdir(dir, { recursive: true });
  const fields = { id, date: "2026-01-01", confidence: 9, ...extra };
  const yaml = Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join("\n");
  await writeFile(join(dir, `${id}.md`), `---\n${yaml}\n---\nDecision ${id}.\n`, "utf8");
}

async function makeTempRoot(prefix) {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(join(tmpdir(), prefix));
}
