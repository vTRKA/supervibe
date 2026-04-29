import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRun, evaluateTask } from "../scripts/lib/autonomous-loop-evaluator.mjs";

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
