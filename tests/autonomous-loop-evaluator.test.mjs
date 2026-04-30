import assert from "node:assert/strict";
import test from "node:test";
import {
  REQUEUE_REASONS,
  confidenceCapForRequeueReason,
  evaluateRun,
  evaluateTask,
  normalizeRequeueReason,
} from "../scripts/lib/autonomous-loop-evaluator.mjs";

const task = {
  id: "t1",
  goal: "validate integration",
  category: "integration",
  acceptanceCriteria: ["works"],
  verificationCommands: ["node --test"],
  policyRiskLevel: "low",
};

test("task cannot complete below 9", () => {
  const score = evaluateTask(task, { verificationRan: false, testsPassed: false });
  assert.equal(score.complete, false);
  assert.ok(score.finalScore < 9);
});

test("task completes when evidence is present", () => {
  const score = evaluateTask(task, {
    verificationRan: true,
    verificationEvidence: ["ok"],
    testsPassed: true,
    integrationWorks: true,
    codeGraphHandled: true,
    independentReview: true,
  });
  assert.equal(score.finalScore, 10);
  assert.equal(evaluateRun([task], [score]).complete, true);
});

test("task cannot score 9+ when verification matrix coverage fails", () => {
  const score = evaluateTask({
    ...task,
    verificationMatrix: [{ taskId: "t1", evidenceType: "integration check" }],
  }, {
    verificationRan: true,
    verificationEvidence: ["ok"],
    testsPassed: true,
    integrationWorks: true,
    codeGraphHandled: true,
    independentReview: true,
    verificationMatrix: { pass: false, issues: [{ code: "missing-integration-evidence" }] },
  });

  assert.equal(score.complete, false);
  assert.ok(score.finalScore <= 6);
});

test("failure packet caps task confidence", () => {
  const score = evaluateTask(task, {
    verificationRan: true,
    verificationEvidence: ["ok"],
    testsPassed: true,
    integrationWorks: true,
    codeGraphHandled: true,
    independentReview: true,
    failurePacket: { confidenceCap: 6, requeueReason: "missing_evidence" },
  });

  assert.equal(score.finalScore, 6);
  assert.equal(score.complete, false);
});

test("requeue taxonomy normalizes legacy failure reasons", () => {
  assert.ok(REQUEUE_REASONS.includes("policy_gate"));
  assert.equal(normalizeRequeueReason("policy_block"), "policy_gate");
  assert.equal(normalizeRequeueReason("missing_evidence"), "verification_failed");
  assert.equal(confidenceCapForRequeueReason("policy_gate"), 6);
});
