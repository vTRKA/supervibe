import assert from "node:assert/strict";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";

import {
  MEMORY_GC_CATEGORIES,
  archiveMemoryGcCandidates,
  archiveMemoryEntry,
  classifyMemoryEntry,
  memoryGcStats,
  restoreMemoryEntry,
  scanMemoryGc,
} from "../scripts/lib/supervibe-memory-gc.mjs";

test("memory GC archives superseded decisions and restores by memory id", async () => {
  const root = await makeTempRoot("supervibe-memory-gc-");
  try {
    await writeMemory(root, "decisions", "new.md", {
      id: "decision-new",
      date: "2026-04-01",
      confidence: 10,
    }, "Current checkout architecture.");
    const oldPath = await writeMemory(root, "decisions", "old.md", {
      id: "decision-old",
      date: "2025-01-01",
      confidence: 8,
      "superseded-by": "decision-new",
    }, "Old checkout architecture.");

    const scan = await scanMemoryGc({
      rootDir: root,
      category: "decisions",
      now: "2026-04-30T00:00:00.000Z",
    });
    assert.ok(MEMORY_GC_CATEGORIES.includes("decisions"));
    const directClassification = classifyMemoryEntry(scan.candidates[0], {
      rootDir: root,
      now: "2026-04-30T00:00:00.000Z",
      idIndex: new Map([
        ["decision-new", { id: "decision-new" }],
        ["decision-old", { id: "decision-old" }],
      ]),
    });
    assert.equal(directClassification.reason, "superseded");
    assert.equal((await archiveMemoryEntry(scan.candidates[0], {
      archiveRoot: join(root, ".supervibe", "memory", ".archive"),
      dryRun: true,
    })).status, "preview");
    assert.deepEqual(scan.candidates.map((candidate) => candidate.id), ["decision-old"]);

    const archiveResult = await archiveMemoryGcCandidates(scan, {
      dryRun: false,
      now: "2026-04-30T00:00:00.000Z",
    });
    assert.equal(archiveResult.archived, 1);
    await assert.rejects(access(oldPath));
    await access(join(root, ".supervibe", "memory", ".archive", "decisions", basename(oldPath)));
    assert.match(await readFile(join(root, ".supervibe", "memory", ".archive", "_archive-log.jsonl"), "utf8"), /decision-old/);

    const restored = await restoreMemoryEntry({ rootDir: root, id: "decision-old" });
    assert.equal(restored.restored, true);
    const restoredText = await readFile(oldPath, "utf8");
    assert.doesNotMatch(restoredText, /archivedAt:/);

    const stats = await memoryGcStats({ rootDir: root });
    assert.equal(stats.decisions, 2);
    assert.equal(stats[".archive/decisions"], 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("memory GC candidates low-confidence old learnings but keeps high-confidence entries", async () => {
  const root = await makeTempRoot("supervibe-memory-gc-");
  try {
    await writeMemory(root, "learnings", "old-low.md", {
      id: "learning-low",
      date: "2025-01-01",
      confidence: 5,
    }, "Low-confidence old note.");
    await writeMemory(root, "learnings", "old-high.md", {
      id: "learning-high",
      date: "2025-01-01",
      confidence: 9,
    }, "High-confidence old note.");

    const scan = await scanMemoryGc({
      rootDir: root,
      category: "learnings",
      now: "2026-04-30T00:00:00.000Z",
    });
    assert.deepEqual(scan.candidates.map((candidate) => candidate.id), ["learning-low"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writeMemory(root, category, fileName, frontmatter, body) {
  const dir = join(root, ".supervibe", "memory", category);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, fileName);
  const yaml = Object.entries(frontmatter).map(([key, value]) => `${key}: ${value}`).join("\n");
  await writeFile(filePath, `---\n${yaml}\n---\n${body}\n`, "utf8");
  return filePath;
}

async function makeTempRoot(prefix) {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(join(tmpdir(), prefix));
}
