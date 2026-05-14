import assert from "node:assert/strict";
import test from "node:test";

import { resolveCommandRequest } from "../scripts/lib/supervibe-command-catalog.mjs";
import { routeWorkflowIntent } from "../scripts/lib/supervibe-workflow-router.mjs";

const RU_PLAN_ONLY_VALIDATION = "\u0437\u0430\u043f\u0443\u0441\u0442\u0438 \u0432\u0430\u043b\u0438\u0434\u0430\u0446\u0438\u044e \u043f\u043b\u0430\u043d\u0430 / \u043f\u043e\u043a\u0430 \u0442\u043e\u043b\u044c\u043a\u043e \u043f\u043b\u0430\u043d";
const RU_TEMP_PLAN_REVIEW_ONLY = "\u0441\u0434\u0435\u043b\u0430\u0439 \u0432\u0440\u0435\u043c\u0435\u043d\u043d\u044b\u0439 \u043f\u043b\u0430\u043d \u0441\u043e \u0432\u0441\u0435\u043c\u0438 \u0437\u0430\u0434\u0430\u0447\u0438, \u0437\u0430\u043f\u0443\u0441\u0442\u0438 \u0432\u0430\u043b\u0438\u0434\u0430\u0446\u0438\u044e \u043f\u043b\u0430\u043d\u0430 \u0442.\u0435 \u0440\u0435\u0432\u044c\u044e\u0435\u0440\u043e\u0432. \u041f\u043e\u043a\u0430 \u0442\u043e\u043b\u044c\u043a\u043e \u043f\u043b\u0430\u043d \u0434\u043e\u043b\u0436\u0435\u043d \u0431\u044b\u0442\u044c";
const RU_SPEC_PLAN_IMPLEMENT = "\u0441\u043e\u0437\u0434\u0430\u0439 \u0441\u043f\u0435\u0446\u0438\u0444\u0438\u043a\u0430\u0446\u0438\u044e \u0438 \u043f\u043b\u0430\u043d, \u043f\u043e\u0442\u043e\u043c \u043d\u0430\u0447\u043d\u0438 \u0440\u0435\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u044e";

function commandRoute(request) {
  const route = resolveCommandRequest(request, { pluginRoot: process.cwd(), projectRoot: process.cwd() });
  assert.ok(route, "expected command route for " + request);
  return route;
}

test("mixed spec, plan, and implementation requests route to the upstream spec step", () => {
  for (const request of ["write a spec, create the implementation plan, then start implementation", "draft requirements and a plan before implementation", RU_SPEC_PLAN_IMPLEMENT]) {
    const route = commandRoute(request);
    assert.equal(route.command, "/supervibe-brainstorm");
    assert.equal(route.intent, "supervibe_brainstorm");
    assert.notEqual(route.command, "/supervibe-execute-plan");
    assert.notEqual(route.command, "/supervibe-plan --review");
  }
});

test("workflow router preserves upstream precedence before execution", () => {
  const specRoute = routeWorkflowIntent("write a spec, create the implementation plan, then start implementation");
  assert.equal(specRoute.command, "/supervibe-brainstorm");
  assert.equal(specRoute.intent, "feature_brainstorm");
  assert.equal(specRoute.source, "upstream-artifact-precedence");

  const planRoute = routeWorkflowIntent("create a plan then execute it");
  assert.equal(planRoute.command, "/supervibe-plan");
  assert.equal(planRoute.intent, "brainstorm_to_plan");
  assert.notEqual(planRoute.command, "/supervibe-execute-plan");
});

test("Russian plan-only validation and reviewer requests route to plan review", () => {
  for (const request of [RU_PLAN_ONLY_VALIDATION, RU_TEMP_PLAN_REVIEW_ONLY]) {
    const route = commandRoute(request);
    assert.equal(route.command, "/supervibe-plan --review");
    assert.equal(route.intent, "plan_review");
    assert.notEqual(route.command, "/supervibe-execute-plan");
  }

  const workflowRoute = routeWorkflowIntent(RU_PLAN_ONLY_VALIDATION);
  assert.equal(workflowRoute.command, "/supervibe-plan --review");
  assert.equal(workflowRoute.intent, "plan_review");
  assert.equal(workflowRoute.source, "plan-only-review-gate");
});

test("reviewed and atomized plans are the only direct workflow execution path", () => {
  const blocked = routeWorkflowIntent("execute plan", { artifacts: { plan: true } });
  assert.equal(blocked.command, "/supervibe-plan --review");
  assert.equal(blocked.intent, "plan_review");

  const executable = routeWorkflowIntent("execute plan", { artifacts: { planReviewPassed: true, workItemsReady: true } });
  assert.equal(executable.intent, "single_session_epic_run");
  assert.notEqual(executable.command, "/supervibe-plan --review");
});
