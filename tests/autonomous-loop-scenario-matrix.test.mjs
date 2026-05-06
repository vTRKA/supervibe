import assert from "node:assert/strict";
import test from "node:test";
import { buildScenarioMatrix, hasScenarioCoverage } from "../scripts/lib/autonomous-loop-scenario-matrix.mjs";

test("scenario matrix covers common autonomous loop requests", () => {
  const matrix = buildScenarioMatrix();
  assert.equal(hasScenarioCoverage(matrix).ok, true);
  assert.ok(matrix.length >= 20);
});

test("scenario matrix covers mature loop stop and recovery cases", () => {
  const matrix = buildScenarioMatrix();
  const required = [
    "goal-until-complete no default timebox",
    "user accepts system-complete result",
    "user rejects system-complete result",
    "checkpoint fork and replan",
    "multi-session worktree disjoint write sets",
    "stale worktree dirty cleanup",
    "scope creep mvp protection",
    "regulated domain evidence",
    "brainstorm plan execute loop chain",
    "provider capability fallback",
  ];
  assert.equal(hasScenarioCoverage(matrix, required).ok, true);

  const rejection = matrix.find((item) => item.scenario === "user rejects system-complete result");
  assert.equal(rejection.stopBehavior, "replan-required");
  assert.equal(rejection.checkpointRequired, true);
  assert.ok(rejection.evidence.includes("replan-checkpoint"));

  const acceptance = matrix.find((item) => item.scenario === "user accepts system-complete result");
  assert.equal(acceptance.userValidationRequired, true);
  assert.ok(acceptance.evidence.includes("user-goal-acceptance"));

  const scope = matrix.find((item) => item.scenario === "scope creep mvp protection");
  assert.ok(scope.evidence.includes("deferred-extras"));
  assert.equal(scope.confidenceGate, 9);
});
