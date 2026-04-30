import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  archiveLoopRun,
  createChecksums,
  exportLoopBundle,
  importLoopBundle,
} from "../scripts/lib/autonomous-loop-archive.mjs";

async function createRunDir(name = "archive") {
  const runDir = join(tmpdir(), `supervibe-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "state.json"), JSON.stringify({
    run_id: "loop-archive",
    status: "COMPLETE",
    tasks: [{ id: "t1", goal: "Task", status: "complete", dependencies: [] }],
    attempts: [{ attemptId: "a1", taskId: "t1", status: "completed", outputPath: "attempts/a1-output.txt", verificationEvidence: ["ok"] }],
    handoffs: [{ taskId: "t1", verificationEvidence: ["ok"] }],
  }, null, 2), "utf8");
  await writeFile(join(runDir, "progress.md"), "api_key=secret-value-that-must-redact\n", "utf8");
  await writeFile(join(runDir, "final-report.md"), "# Report\n", "utf8");
  await writeFile(join(runDir, "side-effects.jsonl"), `${JSON.stringify({ actionId: "s1", status: "verified" })}\n`, "utf8");
  return runDir;
}

test("export bundle writes graph, evidence index, checksums, and redacts secrets", async () => {
  const runDir = await createRunDir();
  const outDir = join(tmpdir(), `supervibe-bundle-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const result = await exportLoopBundle(runDir, { outDir });

  assert.equal(result.runId, "loop-archive");
  await stat(join(result.bundleDir, "graph.json"));
  await stat(join(result.bundleDir, "graph.mmd"));
  await stat(join(result.bundleDir, "evidence-index.json"));
  const checksums = JSON.parse(await readFile(join(result.bundleDir, "checksums.json"), "utf8"));
  assert.equal(checksums.algorithm, "sha256");
  assert.ok(checksums.files["state.json"]);
  assert.ok((await createChecksums(result.bundleDir)).files["state.json"]);
  assert.match(await readFile(join(result.bundleDir, "progress.md"), "utf8"), /api_key=\[REDACTED\]/);
});

test("archive copies a run into a labeled archive bundle", async () => {
  const runDir = await createRunDir("archive-label");
  const archiveRoot = join(tmpdir(), `supervibe-archive-root-${Date.now()}`);
  const result = await archiveLoopRun(runDir, { archiveRoot, label: "Feature Branch" });

  assert.match(result.bundleDir, /feature-branch$/);
  await stat(join(result.bundleDir, "state.json"));
});

test("import validates bundle checksums before writing target loop", async () => {
  const runDir = await createRunDir("import");
  const bundle = await exportLoopBundle(runDir, { outDir: join(tmpdir(), `supervibe-import-bundle-${Date.now()}`) });
  const targetRoot = join(tmpdir(), `supervibe-import-target-${Date.now()}`);
  const result = await importLoopBundle(bundle.bundleDir, { targetRoot });

  assert.match(result.targetDir, /loop-archive$/);
  await stat(join(result.targetDir, "state.json"));
});
