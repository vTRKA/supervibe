import assert from "node:assert/strict";
import test from "node:test";
import { calculateReadyFront, dependencyDepth } from "../scripts/lib/autonomous-loop-ready-front.mjs";

test("ready front returns open tasks whose blockers are complete", () => {
  const result = calculateReadyFront({
    tasks: [
      { id: "t1", goal: "Done", status: "complete" },
      { id: "t2", goal: "Ready", dependencies: ["t1"], status: "open" },
      { id: "t3", goal: "Blocked", dependencies: ["t2"], status: "open" },
    ],
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.ready.map((task) => task.id), ["t2"]);
  assert.deepEqual(result.blocked.map((task) => task.id), ["t3"]);
  assert.deepEqual(result.blocked[0].blockers, ["t2"]);
});

test("ready front treats skipped and cancelled dependencies as terminal", () => {
  const result = calculateReadyFront({
    tasks: [
      { id: "skipped", goal: "Skipped", status: "skipped" },
      { id: "cancelled", goal: "Cancelled", status: "cancelled" },
      { id: "policy", goal: "Policy", status: "policy_stopped" },
      { id: "ready", goal: "Ready", dependencies: ["skipped", "cancelled", "policy"], status: "open" },
    ],
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.ready.map((task) => task.id), ["ready"]);
  assert.equal(result.ready.some((task) => task.id === "skipped"), false);
  assert.deepEqual(result.blocked, []);
});

test("parallel front respects priority, source order, and max concurrency", () => {
  const result = calculateReadyFront({
    tasks: [
      { id: "low", goal: "Low", priority: "low" },
      { id: "critical", goal: "Critical", priority: "critical" },
      { id: "medium", goal: "Medium", priority: "medium" },
    ],
  }, { maxConcurrentAgents: 2 });

  assert.deepEqual(result.ready.map((task) => task.id), ["critical", "medium", "low"]);
  assert.deepEqual(result.parallel.map((task) => task.id), ["critical", "medium"]);
});

test("parallel front excludes overlapping write sets from the parallel lane", () => {
  const result = calculateReadyFront({
    tasks: [
      { id: "a", goal: "A", priority: "critical", writeScope: [{ path: "src/shared.ts", action: "modify" }] },
      { id: "b", goal: "B", priority: "medium", writeScope: [{ path: "src/other.ts", action: "modify" }] },
      { id: "c", goal: "C", priority: "low", writeScope: [{ path: "src/shared.ts", action: "modify" }] },
    ],
  }, { maxConcurrentAgents: 3 });

  assert.deepEqual(result.parallel.map((task) => task.id), ["a", "b"]);
  assert.ok(result.serialized.some((item) => item.taskId === "c" && /write-set conflict/.test(item.reason)));
  assert.deepEqual(result.writeSetConflicts, [{ filePath: "src/shared.ts", taskIds: ["a", "c"] }]);
});

test("parallel front respects risk and defers reviewers to final sweep by default", () => {
  const highRisk = calculateReadyFront({
    tasks: [
      { id: "safe", goal: "Safe", policyRiskLevel: "low" },
      { id: "risky", goal: "Risky", policyRiskLevel: "high", priority: "critical" },
    ],
  }, { maxPolicyRiskLevel: "medium" });
  assert.deepEqual(highRisk.parallel.map((task) => task.id), ["safe"]);

  const noReviewer = calculateReadyFront({ tasks: [{ id: "t1", goal: "Ready" }] }, { reviewersAvailable: false });
  assert.deepEqual(noReviewer.parallel.map((task) => task.id), ["t1"]);
  assert.equal(noReviewer.reviewPolicy.reviewersRequiredAt, "final-graph-sweep");
});

test("parallel front can still enforce per-task reviewer availability", () => {
  const noReviewer = calculateReadyFront(
    { tasks: [{ id: "t1", goal: "Ready" }] },
    { reviewersAvailable: false, reviewMode: "per-task" }
  );
  assert.deepEqual(noReviewer.parallel, []);
  assert.deepEqual(noReviewer.parallelizationBlockedBy, ["missing-reviewer"]);
});

test("invalid graph returns issues instead of a ready front", () => {
  const result = calculateReadyFront({
    tasks: [
      { id: "a", goal: "A", dependencies: ["b"] },
      { id: "b", goal: "B", dependencies: ["a"] },
    ],
  });

  assert.equal(result.valid, false);
  assert.equal(result.issues.some((issue) => issue.code === "cycle"), true);
  assert.deepEqual(result.ready, []);
});

test("dependencyDepth is deterministic for dependency chains", () => {
  const graph = calculateReadyFront({
    tasks: [
      { id: "a", goal: "A", status: "complete" },
      { id: "b", goal: "B", status: "complete", dependencies: ["a"] },
      { id: "c", goal: "C", dependencies: ["b"] },
    ],
  }).graph;

  assert.equal(dependencyDepth("c", graph), 2);
});
