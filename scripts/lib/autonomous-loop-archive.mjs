import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { exportGraph } from "./autonomous-loop-graph-export.mjs";
import { redactSensitiveContent } from "./autonomous-loop-artifact-retention.mjs";

const BUNDLE_FILES = [
  "state.json",
  "preflight.json",
  "tasks.jsonl",
  "scores.jsonl",
  "handoffs.jsonl",
  "events.jsonl",
  "side-effects.jsonl",
  "progress.md",
  "final-report.md",
  "eval-report.json",
  "compacted-summary.json",
  "rejected-learnings.json",
];

export async function exportLoopBundle(path, { outDir = null } = {}) {
  const runDir = resolveRunDir(path);
  const state = JSON.parse(await readFile(join(runDir, "state.json"), "utf8"));
  const bundleDir = resolve(outDir || join(dirname(runDir), `${basename(runDir)}.bundle`));
  await mkdir(bundleDir, { recursive: true });

  const copied = [];
  for (const file of BUNDLE_FILES) {
    const source = join(runDir, file);
    try {
      const content = await readFile(source, "utf8");
      await writeFile(join(bundleDir, file), redactSensitiveContent(content), "utf8");
      copied.push(file);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  await writeFile(join(bundleDir, "graph.json"), exportGraph(state, { format: "json" }), "utf8");
  await writeFile(join(bundleDir, "graph.mmd"), exportGraph(state, { format: "mermaid" }), "utf8");
  await writeFile(join(bundleDir, "evidence-index.json"), `${JSON.stringify(createEvidenceIndex(state), null, 2)}\n`, "utf8");
  const checksums = await createChecksums(bundleDir);
  await writeFile(join(bundleDir, "checksums.json"), `${JSON.stringify(checksums, null, 2)}\n`, "utf8");

  return { bundleDir, runId: state.run_id || basename(runDir), copied, checksums };
}

export async function archiveLoopRun(path, { archiveRoot = null, label = null } = {}) {
  const runDir = resolveRunDir(path);
  const state = JSON.parse(await readFile(join(runDir, "state.json"), "utf8"));
  const safeLabel = slug(label || state.run_id || basename(runDir));
  const destination = resolve(archiveRoot || join(dirname(runDir), "archive"), safeLabel);
  return exportLoopBundle(runDir, { outDir: destination });
}

export async function importLoopBundle(bundleDir, { targetRoot } = {}) {
  const sourceDir = resolve(bundleDir);
  const checksums = JSON.parse(await readFile(join(sourceDir, "checksums.json"), "utf8"));
  const current = await createChecksums(sourceDir, { exclude: ["checksums.json"] });
  for (const [file, hash] of Object.entries(checksums.files || {})) {
    if (current.files[file] !== hash) throw new Error(`Bundle checksum mismatch for ${file}`);
  }

  const state = JSON.parse(await readFile(join(sourceDir, "state.json"), "utf8"));
  const root = resolve(targetRoot || process.cwd());
  const runId = state.run_id || basename(sourceDir).replace(/\.bundle$/, "");
  const targetDir = join(root, ".supervibe", "memory", "loops", runId);
  await mkdir(targetDir, { recursive: true });
  for (const file of await readdir(sourceDir)) {
    if (file === "checksums.json") continue;
    await copyFile(join(sourceDir, file), join(targetDir, file));
  }
  return { targetDir, runId };
}

export async function createChecksums(dir, { exclude = [] } = {}) {
  const excluded = new Set(exclude);
  const files = {};
  for (const file of (await readdir(dir)).sort()) {
    if (excluded.has(file)) continue;
    const content = await readFile(join(dir, file));
    files[file] = createHash("sha256").update(content).digest("hex");
  }
  return { algorithm: "sha256", files };
}

function createEvidenceIndex(state) {
  return {
    runId: state.run_id || null,
    attempts: (state.attempts || []).map((attempt) => ({
      attemptId: attempt.attemptId,
      taskId: attempt.taskId,
      status: attempt.status,
      outputPath: attempt.outputPath || null,
      verificationEvidence: attempt.verificationEvidence || [],
    })),
    handoffs: (state.handoffs || []).map((handoff) => ({
      taskId: handoff.taskId,
      verificationEvidence: handoff.verificationEvidence || [],
    })),
  };
}

function resolveRunDir(path) {
  const resolved = resolve(path);
  return resolved.endsWith("state.json") ? dirname(resolved) : resolved;
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "loop-archive";
}
