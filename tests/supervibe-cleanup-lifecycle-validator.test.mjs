import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { formatCleanupLifecycleValidation, validateCleanupLifecycle } from "../scripts/validate-supervibe-cleanup-lifecycle.mjs";

test("cleanup lifecycle validator passes a minimal safe workspace", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-cleanup-validator-ok-"));
  try {
    await writeText(root, ".supervibe/memory/active-workflow.json", "{}\n");
    await writeText(root, ".supervibe/memory/workflow-invocation-ledger.jsonl", "");
    await writeText(root, ".supervibe/memory/work-items/epic/graph.json", JSON.stringify({ graph_id: "epic", items: [{ itemId: "epic", type: "epic", status: "open" }] }) + "\n");
    const result = await validateCleanupLifecycle({ rootDir: root, now: "2026-05-06T00:00:00.000Z" });
    assert.equal(result.pass, true);
    assert.match(formatCleanupLifecycleValidation(result), /PASS: true/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cleanup lifecycle validator fails unclassified files in hot namespaces", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-cleanup-validator-bad-"));
  try {
    await writeText(root, ".supervibe/memory/active-noise/unknown.bin", "noise");
    const result = await validateCleanupLifecycle({ rootDir: root, now: "2026-05-06T00:00:00.000Z" });
    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "unclassified-hot-namespace"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writeText(root, relPath, value) {
  const abs = join(root, ...relPath.split("/"));
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, value, "utf8");
}
