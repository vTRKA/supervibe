import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  diagnoseLoopRun,
  primeLoopRun,
  repairLoopRun,
} from "../scripts/lib/autonomous-loop-doctor.mjs";

async function createRunDir(name = "doctor") {
  const runDir = join(tmpdir(), `supervibe-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(runDir, { recursive: true });
  return runDir;
}

test("doctor reports missing artifacts, graph issues, stale claims, orphan attempts, and side effects", async () => {
  const runDir = await createRunDir();
  const staleDate = "2026-04-29T00:00:00.000Z";
  await writeFile(join(runDir, "state.json"), JSON.stringify({
    schema_version: 1,
    run_id: "loop-doctor",
    status: "IN_PROGRESS",
    tasks: [{ id: "t1", goal: "Task", status: "open", dependencies: ["missing"] }],
    attempts: [{ attemptId: "a1", taskId: "missing", outputPath: "missing-output.txt" }],
    claims: [{ taskId: "t1", claimId: "claim-stale", status: "active", expiresAt: staleDate }],
  }, null, 2), "utf8");
  await writeFile(join(runDir, "side-effects.jsonl"), `${JSON.stringify({ actionId: "s1", status: "started" })}\n`, "utf8");

  const result = await diagnoseLoopRun(runDir, { now: "2026-04-29T01:00:00.000Z" });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "missing-artifact" && issue.target === "final-report.md"));
  assert.ok(result.issues.some((issue) => issue.code === "graph-unknown-dependency"));
  assert.ok(result.issues.some((issue) => issue.code === "orphan-attempt"));
  assert.ok(result.issues.some((issue) => issue.code === "stale-claim"));
  assert.ok(result.issues.some((issue) => issue.code === "unresolved-side-effect"));
});

test("repair is opt-in, writes backup, expires stale claims, and removes orphan attempts", async () => {
  const runDir = await createRunDir("repair");
  await writeFile(join(runDir, "state.json"), JSON.stringify({
    schema_version: 1,
    run_id: "loop-repair",
    status: "BLOCKED",
    tasks: [{ id: "t1", goal: "Task", status: "open", dependencies: [] }],
    attempts: [{ attemptId: "orphan", taskId: "missing" }],
    claims: [{ taskId: "t1", claimId: "claim-stale", status: "active", expiresAt: "2026-04-29T00:00:00.000Z" }],
  }, null, 2), "utf8");

  const preview = await repairLoopRun(runDir, { fix: false, now: "2026-04-29T01:00:00.000Z" });
  assert.equal(preview.changed, false);
  assert.equal(preview.preview.staleClaims, 1);

  const fixed = await repairLoopRun(runDir, { fix: true, now: "2026-04-29T01:00:00.000Z" });
  await stat(fixed.backupPath);
  const state = JSON.parse(await readFile(join(runDir, "state.json"), "utf8"));
  assert.equal(state.claims[0].status, "expired");
  assert.deepEqual(state.attempts, []);
  assert.equal(state.tasks[0].status, "open");
  assert.equal(state.ready_summary.open, 1);
});

test("prime output is compact and actionable for a fresh context", async () => {
  const runDir = await createRunDir("prime");
  await writeFile(join(runDir, "state.json"), JSON.stringify({
    run_id: "loop-prime",
    status: "IN_PROGRESS",
    next_action: "dispatch",
    preflight: { objective: "finish feature", max_concurrent_agents: 2 },
    tasks: [
      { id: "t1", goal: "Done", status: "complete", dependencies: [] },
      { id: "t2", goal: "Ready", status: "open", dependencies: ["t1"] },
    ],
    claims: [{ taskId: "t2", claimId: "claim-t2", status: "active" }],
    gates: [{ taskId: "t2", gateId: "gate-t2", status: "open" }],
  }, null, 2), "utf8");

  const prime = await primeLoopRun(runDir);
  assert.match(prime, /SUPERVIBE_LOOP_PRIME/);
  assert.match(prime, /OBJECTIVE: finish feature/);
  assert.match(prime, /READY: t2/);
  assert.match(prime, /ACTIVE_CLAIMS: claim-t2/);
  assert.match(prime, /OPEN_GATES: gate-t2/);
});
