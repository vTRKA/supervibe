import assert from "node:assert/strict";
import test from "node:test";

import { formatNextStepBlock } from "../scripts/lib/supervibe-skill-chain.mjs";
import { formatWorkflowRoute, routeWorkflowIntent } from "../scripts/lib/supervibe-workflow-router.mjs";

test("vague feature requests route to brainstorm before implementation", () => {
  const route = routeWorkflowIntent("build feature for onboarding");
  assert.equal(route.intent, "feature_brainstorm");
  assert.equal(route.command, "/supervibe-brainstorm");
  assert.equal(route.skill, "supervibe:brainstorming");
  assert.match(formatWorkflowRoute(route), /WORKFLOW_ROUTE/);
});

test("russian vague feature requests route to brainstorm", () => {
  const route = routeWorkflowIntent("\u0441\u0434\u0435\u043b\u0430\u0439 \u0444\u0438\u0447\u0443 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u0430\u0446\u0438\u0438");
  assert.equal(route.intent, "feature_brainstorm");
  assert.equal(route.command, "/supervibe-brainstorm");
});

test("affirming after brainstorm routes to plan", () => {
  const route = routeWorkflowIntent({
    userPhrase: "\u043f\u0435\u0440\u0435\u0445\u043e\u0434\u0438\u043c?",
    lastCompletedPhase: "brainstorm",
    artifacts: { brainstorm: true },
  });
  assert.equal(route.command, "/supervibe-plan");
  assert.equal(route.skill, "supervibe:writing-plans");
  assert.match(route.nextPromptText, /\u043f\u043b\u0430\u043d/i);
});

test("execution request after plan is forced through mandatory plan review", () => {
  const route = routeWorkflowIntent({
    userPhrase: "run it",
    lastCompletedPhase: "plan",
    artifacts: { plan: true },
  });
  assert.equal(route.intent, "plan_review");
  assert.equal(route.command, "/supervibe-plan --review");
  assert.match(route.reason, /mandatory plan review/);
});

test("reviewed plan can be atomized into work items", () => {
  const route = routeWorkflowIntent({
    userPhrase: "\u0440\u0430\u0437\u0431\u0435\u0439 \u043f\u043b\u0430\u043d \u043d\u0430 \u0430\u0442\u043e\u043c\u0430\u0440\u043d\u044b\u0435 \u0437\u0430\u0434\u0430\u0447\u0438",
    artifacts: { plan: true, planReviewPassed: true },
  });
  assert.equal(route.intent, "atomize_plan");
  assert.equal(route.command, "/supervibe-loop --from-plan --atomize");
});

test("worktree request routes to isolated session preflight and adds dirty-state blocker", () => {
  const route = routeWorkflowIntent({
    userPhrase: "run it in a separate worktree",
    dirtyGitState: "dirty",
    artifacts: { epicId: "EPIC-1" },
  });
  assert.equal(route.intent, "worktree_autonomous_run");
  assert.equal(route.command, "/supervibe-loop --epic --worktree");
  assert.ok(route.safetyBlockers.includes("dirty-main-worktree-needs-isolated-session-plan"));
});

test("multi-session plan requests route to worktree orchestration", () => {
  const route = routeWorkflowIntent({
    userPhrase: "coordinate 10 sessions on the same plan in worktree",
    dirtyGitState: "dirty",
    artifacts: { epicId: "EPIC-10", stopCommandAvailable: true },
  });
  assert.equal(route.intent, "worktree_autonomous_run");
  assert.equal(route.command, "/supervibe-loop --epic --worktree");
  assert.equal(route.safetyBlockers.includes("dirty-worktree-requires-review-or-isolation"), false);
  assert.equal(route.safetyBlockers.includes("dirty-main-worktree-needs-isolated-session-plan"), true);
});

test("affirming explicit handoff reuses its command and skill", () => {
  const recentAssistantOutput = formatNextStepBlock({
    phase: "plan",
    artifactPath: "docs/plans/example.md",
    locale: "en",
  });
  const route = routeWorkflowIntent({
    userPhrase: "yes",
    recentAssistantOutput,
  });
  assert.equal(route.intent, "plan_review");
  assert.equal(route.command, "/supervibe-plan --review");
  assert.equal(route.skill, "supervibe:requesting-code-review");
  assert.equal(route.source, "recent-handoff");
});
