import assert from "node:assert/strict";
import test from "node:test";
import { buildContextPlan, contextConfidenceCap } from "../scripts/lib/autonomous-loop-context-planner.mjs";

test("context planner records retrieval-first evidence", () => {
  const pack = buildContextPlan({ id: "t1", goal: "refactor public api", category: "refactor", acceptanceCriteria: [] }, {
    memoryEntries: [{ id: "m1" }],
    codeRagChunks: [{ file: "x" }],
    codeGraphEvidence: [{ edge: "a->b" }],
  });
  assert.equal(contextConfidenceCap({ goal: "refactor", category: "refactor" }, pack), 10);
});

test("context planner carries workflow phase signal for autonomous agents", () => {
  const pack = buildContextPlan({
    id: "T-flow",
    goal: "Implement Kanban task movement",
    category: "implementation",
    status: "in_progress",
    acceptanceCriteria: ["Agent sees current phase"],
  }, {
    runId: "run-flow",
    epicId: "epic-flow",
    workflowFlow: {
      activeId: "execute",
      status: "current",
      metrics: { totalTasks: 3, doneTasks: 1, ready: 1, claimed: 1, blocked: 0, openGates: 0 },
      steps: [
        { id: "plan", label: "Plan", state: "complete" },
        { id: "atomize", label: "Atomize", state: "complete" },
        { id: "execute", label: "Execute", state: "current", active: true, hint: "run in_progress; ready 1, claimed 1, blocked 0" },
      ],
    },
    claims: [{ claimId: "claim-1", taskId: "T-flow", agentId: "worker", status: "active", attemptId: "attempt-1" }],
    gates: [{ gateId: "review-flow", taskId: "T-flow", status: "open", type: "review" }],
    dispatch: { primaryAgentId: "worker", reviewerAgentId: "reviewer" },
    triggerSignal: { source: "request", intent: "loop", confidence: 0.98 },
  });

  assert.equal(pack.workflowSignal.taskId, "T-flow");
  assert.equal(pack.workflowSignal.epicId, "epic-flow");
  assert.equal(pack.workflowSignal.phase, "execute");
  assert.equal(pack.workflowSignal.activeAgent, "worker");
  assert.equal(pack.workflowSignal.reviewerAgent, "reviewer");
  assert.equal(pack.workflowSignal.gates[0].gateId, "review-flow");
  assert.equal(pack.workflowSignal.flowSteps.find((step) => step.id === "execute").active, true);
});
