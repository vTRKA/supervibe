import assert from "node:assert/strict";
import test from "node:test";
import {
  answerAssignmentQuestion,
  explainAssignment,
  formatAssignmentExplanation,
} from "../scripts/lib/supervibe-assignment-explainer.mjs";

test("assignment explanation records chosen agents, alternatives, evidence, anchors, and policy", () => {
  const explanation = explainAssignment({
    task: {
      id: "task-1",
      category: "integration",
      targetFiles: ["src/api.ts"],
      semanticAnchors: [{ anchorId: "api.client" }],
      fileLocalContractRefs: ["flc-api"],
      policyRiskLevel: "medium",
    },
    worker: { agentId: "stack-developer", score: 8, reasons: ["integration capable"] },
    reviewer: { agentId: "quality-gate-reviewer", preset: "verification reviewer" },
    alternatives: [{ agentId: "repo-researcher", rejectedBecause: "read-only" }],
    notParallelizedBecause: ["write-set conflict: src/api.ts"],
    requiredEvidence: ["integration test"],
  });

  assert.equal(explanation.taskId, "task-1");
  assert.ok(explanation.whyWorker.includes("integration capable"));
  assert.ok(explanation.rejectedAlternatives[0].includes("repo-researcher"));
  assert.ok(explanation.evidenceRequired.includes("integration test"));
  assert.ok(explanation.semanticAnchors.includes("api.client"));
  assert.match(formatAssignmentExplanation(explanation), /WHY_WORKER/);
});

test("assignment question surface explains why an agent or why no parallelism", () => {
  const explanation = explainAssignment({
    task: { id: "task-1" },
    worker: { agentId: "stack-developer", reasons: ["best capability match"] },
    reviewer: { agentId: "code-reviewer" },
    notParallelizedBecause: ["missing independent reviewer"],
  });

  assert.match(answerAssignmentQuestion("why this agent?", explanation), /best capability match/);
  assert.match(answerAssignmentQuestion("why not parallelize this?", explanation), /missing independent reviewer/);
});
