import assert from "node:assert/strict";
import test from "node:test";
import { createTaskGraph, graphToFlatTasks, normalizeGraphTask, validateTaskGraph } from "../scripts/lib/autonomous-loop-task-graph.mjs";

test("createTaskGraph computes dependents and normalizes legacy task status", () => {
  const graph = createTaskGraph({
    graph_id: "g1",
    tasks: [
      { id: "t1", goal: "Foundation", status: "complete" },
      { id: "t2", goal: "Feature", dependencies: ["t1"], status: "pending" },
    ],
  });

  assert.equal(graph.graph_id, "g1");
  assert.equal(graph.tasks[0].dependents[0], "t2");
  assert.equal(graph.tasks[1].status, "open");
  assert.equal(normalizeGraphTask({ id: "legacy", status: "pending" }).status, "open");
});

test("validateTaskGraph catches duplicate ids", () => {
  const result = validateTaskGraph({
    tasks: [
      { id: "t1", goal: "One" },
      { id: "t1", goal: "Two" },
    ],
  });

  assert.equal(result.valid, false);
  assert.equal(result.issues.some((issue) => issue.code === "duplicate-id"), true);
});

test("validateTaskGraph catches unknown and self dependencies", () => {
  const result = validateTaskGraph({
    tasks: [
      { id: "t1", goal: "One", dependencies: ["missing"] },
      { id: "t2", goal: "Two", dependencies: ["t2"] },
    ],
  });

  assert.deepEqual(
    result.issues.map((issue) => issue.code).sort(),
    ["self-dependency", "unknown-dependency"],
  );
});

test("validateTaskGraph catches shortest dependency cycle", () => {
  const result = validateTaskGraph({
    tasks: [
      { id: "a", goal: "A", dependencies: ["b"] },
      { id: "b", goal: "B", dependencies: ["c"] },
      { id: "c", goal: "C", dependencies: ["a"] },
    ],
  });

  assert.equal(result.valid, false);
  assert.equal(result.issues[0].code, "cycle");
  assert.deepEqual(result.issues[0].cycle, ["a", "b", "c", "a"]);
});

test("graphToFlatTasks preserves runner-compatible task fields", () => {
  const tasks = graphToFlatTasks({
    tasks: [{
      id: "t1",
      goal: "Ship",
      verificationCommands: ["npm test"],
      policyRiskLevel: "medium",
      epicId: "epic-1",
      parentId: "epic-1",
      blocks: ["t2"],
      related: ["doc-1"],
      writeScope: [{ action: "modify", path: "src/a.ts" }],
      estimatedSize: "small",
      parallelGroup: "A",
      executionHints: { requiredAgentCapability: "stack-developer" },
    }],
  });

  assert.equal(tasks[0].id, "t1");
  assert.equal(tasks[0].verificationCommands[0], "npm test");
  assert.equal(tasks[0].confidenceRubricId, "autonomous-loop");
  assert.equal(tasks[0].epicId, "epic-1");
  assert.equal(tasks[0].blocks[0], "t2");
  assert.equal(tasks[0].writeScope[0].path, "src/a.ts");
  assert.equal(tasks[0].parallelGroup, "A");
});
