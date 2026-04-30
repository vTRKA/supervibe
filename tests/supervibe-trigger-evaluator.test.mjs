import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_WORKFLOW_TRIGGER_FIXTURES,
  evaluateTriggerMatrix,
  formatTriggerEvaluation,
} from "../scripts/lib/supervibe-trigger-evaluator.mjs";

test("default workflow trigger matrix passes", () => {
  const evaluation = evaluateTriggerMatrix();
  assert.equal(evaluation.pass, true, formatTriggerEvaluation(evaluation));
  assert.equal(evaluation.total, DEFAULT_WORKFLOW_TRIGGER_FIXTURES.length);
});

test("trigger evaluation reports route failures", () => {
  const evaluation = evaluateTriggerMatrix([
    {
      id: "bad-fixture",
      phrase: "build feature for team onboarding",
      expected: { intent: "execute_plan", command: "/supervibe-execute-plan", minConfidence: 1 },
    },
  ]);

  assert.equal(evaluation.pass, false);
  assert.equal(evaluation.failed.length, 1);
  assert.match(formatTriggerEvaluation(evaluation), /bad-fixture/);
});
