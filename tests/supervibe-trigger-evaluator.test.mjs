import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SEMANTIC_TRIGGER_FIXTURES,
  DEFAULT_WORKFLOW_TRIGGER_FIXTURES,
  buildIntentConfusionMatrix,
  evaluateSemanticIntentMatrix,
  evaluateTriggerMatrix,
  formatIntentConfusionMatrix,
  formatSemanticIntentEvaluation,
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
  assert.match(formatIntentConfusionMatrix(evaluation), /expected=execute_plan actual=feature_brainstorm count=1/);
});

test("semantic paraphrase trigger matrix passes implicit user needs", () => {
  const evaluation = evaluateSemanticIntentMatrix();
  assert.equal(evaluation.pass, true, formatSemanticIntentEvaluation(evaluation));
  assert.equal(evaluation.total, DEFAULT_SEMANTIC_TRIGGER_FIXTURES.length);
  assert.ok(evaluation.total >= 20);
});

test("semantic evaluation tracks hard negatives in the confusion matrix", () => {
  const evaluation = evaluateSemanticIntentMatrix([
    {
      id: "overdispatch-negative",
      phrase: "do not call agents for this tiny question, just explain the route",
      expected: {
        intent: "trigger_diagnostics",
        command: "/supervibe --diagnose-trigger",
        minConfidence: 0.9,
        notIntent: ["agent_strengthen", "supervibe_audit"],
      },
    },
  ]);

  assert.equal(evaluation.pass, true, formatSemanticIntentEvaluation(evaluation));
  assert.deepEqual(buildIntentConfusionMatrix(evaluation.results), [
    { expectedIntent: "trigger_diagnostics", actualIntent: "trigger_diagnostics", count: 1 },
  ]);
});
