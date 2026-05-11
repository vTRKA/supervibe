import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_COMMAND_ROUTE_FIXTURES,
  DEFAULT_SEMANTIC_TRIGGER_FIXTURES,
  DEFAULT_WORKFLOW_TRIGGER_FIXTURES,
  buildIntentConfusionMatrix,
  evaluateCommandRouteMatrix,
  evaluateSemanticIntentMatrix,
  evaluateTriggerMatrix,
  formatCommandRouteEvaluation,
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

test("semantic routing covers Russian task graph control phrases", () => {
  const evaluation = evaluateSemanticIntentMatrix([
    {
      id: "ru-show-tasks",
      phrase: "покажи задачи",
      expected: { intent: "task_graph_remaining", command: "/supervibe-status --remaining", minConfidence: 0.9 },
    },
    {
      id: "ru-resume-project-tasks",
      phrase: "вернись к проекту с задачами",
      expected: { intent: "task_graph_resume", command: "/supervibe-loop --status", minConfidence: 0.9 },
    },
    {
      id: "ru-change-loop-goal",
      phrase: "измени цель loop",
      expected: { intent: "task_graph_edit", command: "/supervibe-loop --edit <task-id> --preview", minConfidence: 0.9 },
    },
    {
      id: "ru-blocked-tasks",
      phrase: "что заблокировано",
      expected: { intent: "blocked_query", command: "/supervibe-status --blocked", minConfidence: 0.84 },
    },
  ]);

  assert.equal(evaluation.pass, true, formatSemanticIntentEvaluation(evaluation));
});

test("command route matrix keeps plan-review complaints out of audit and execute", () => {
  const evaluation = evaluateCommandRouteMatrix();
  assert.equal(evaluation.pass, true, formatCommandRouteEvaluation(evaluation));
  assert.equal(evaluation.total, DEFAULT_COMMAND_ROUTE_FIXTURES.length);
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
