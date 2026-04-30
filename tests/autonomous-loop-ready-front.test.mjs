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

test("parallel front respects risk and reviewer availability", () => {
  const highRisk = calculateReadyFront({
    tasks: [
      { id: "safe", goal: "Safe", policyRiskLevel: "low" },
      { id: "risky", goal: "Risky", policyRiskLevel: "high", priority: "critical" },
    ],
  }, { maxPolicyRiskLevel: "medium" });
  assert.deepEqual(highRisk.parallel.map((task) => task.id), ["safe"]);

  const noReviewer = calculateReadyFront({ tasks: [{ id: "t1", goal: "Ready" }] }, { reviewersAvailable: false });
  assert.deepEqual(noReviewer.parallel, []);
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
