import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExecutionWaves,
  detectWriteSetConflicts,
  formatWaveStatus,
  summarizeWavePlan,
} from "../scripts/lib/supervibe-wave-controller.mjs";

test("wave controller groups ready work by dependency, write-set, risk, reviewers, and worktrees", () => {
  const tasks = [
    { id: "a", status: "open", dependencies: [], targetFiles: ["src/a.ts"], policyRiskLevel: "low" },
    { id: "b", status: "open", dependencies: [], targetFiles: ["src/b.ts"], policyRiskLevel: "low" },
    { id: "c", status: "open", dependencies: [], targetFiles: ["src/a.ts"], policyRiskLevel: "low" },
    { id: "d", status: "open", dependencies: [], targetFiles: ["prod.ts"], policyRiskLevel: "high" },
  ];
  const plan = buildExecutionWaves({
    tasks,
    maxConcurrency: 2,
    reviewers: ["code-reviewer"],
    worktreeSessions: [{ sessionId: "s1", status: "ready" }, { sessionId: "s2", status: "ready" }],
  });

  assert.equal(plan.waves[0].tasks.length, 2);
  assert.ok(plan.serialized.some((item) => item.taskId === "c" && /write-set/.test(item.reason)));
  assert.ok(plan.blocked.some((item) => item.taskId === "d" && /risk/.test(item.reason)));
  assert.equal(plan.waves[0].worktrees.length, 2);
  assert.match(formatWaveStatus(plan), /CURRENT_WAVE/);
  assert.equal(summarizeWavePlan(plan).waves, 1);
});

test("wave controller defers reviewers to final sweep by default", () => {
  const plan = buildExecutionWaves({
    tasks: [{ id: "a", status: "open", dependencies: [], targetFiles: ["src/a.ts"], policyRiskLevel: "low" }],
    reviewers: [],
  });

  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.blockers, []);
  assert.deepEqual(plan.waves[0].reviewers, []);
  assert.equal(plan.waves[0].mergeStrategy, "verify-reconcile-final-review");
});

test("wave controller pauses on stale worker sessions and only requires missing reviewers in per-wave mode", () => {
  const plan = buildExecutionWaves({
    tasks: [{ id: "a", status: "open", dependencies: [], targetFiles: ["src/a.ts"], policyRiskLevel: "low" }],
    reviewers: [],
    reviewMode: "per-wave",
    worktreeSessions: [{ sessionId: "s1", status: "stale" }],
  });

  assert.equal(plan.status, "paused");
  assert.ok(plan.blockers.includes("missing-reviewer"));
  assert.ok(plan.blockers.includes("stale-worktree-session"));
});

test("write set conflicts are deterministic", () => {
  const conflicts = detectWriteSetConflicts([
    { id: "a", targetFiles: ["src/a.ts"] },
    { id: "b", writeScope: [{ path: "src/a.ts" }] },
    { id: "c", targetFiles: ["src/c.ts"] },
  ]);

  assert.deepEqual(conflicts, [{ filePath: "src/a.ts", taskIds: ["a", "b"] }]);
});
