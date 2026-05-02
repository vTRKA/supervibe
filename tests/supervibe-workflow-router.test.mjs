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

test("single-session execution does not force worktree orchestration", () => {
  const route = routeWorkflowIntent({
    userPhrase: "run it",
    dirtyGitState: "clean",
    artifacts: { planReviewPassed: true, workItemsReady: true, epicId: "EPIC-1", stopCommandAvailable: true },
  });
  assert.equal(route.intent, "single_session_epic_run");
  assert.equal(route.command, "/supervibe-loop --guided --max-duration 3h");
  assert.equal(route.command.includes("--worktree"), false);
  assert.equal(route.skill, "supervibe:autonomous-agent-loop");
  assert.match(route.nextPromptText, /current session/i);
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
    artifactPath: ".supervibe/artifacts/plans/example.md",
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

test("topic drift with a saved handoff asks for resume choice instead of dropping state", () => {
  const recentAssistantOutput = formatNextStepBlock({
    phase: "brainstorm",
    artifactPath: ".supervibe/artifacts/specs/example.md",
    locale: "en",
  });
  const route = routeWorkflowIntent({
    userPhrase: "also make a dashboard mockup",
    recentAssistantOutput,
  });

  assert.equal(route.intent, "workflow_resume_choice");
  assert.equal(route.command, "/supervibe-plan");
  assert.equal(route.source, "recent-handoff-topic-drift");
  assert.match(route.nextQuestion, /Continue it, skip\/delegate safe decisions/i);
  assert.ok(route.requiredSafety.includes("no-silent-workflow-drop"));
  assert.deepEqual(route.alternatives.map((item) => item.id), [
    "continue-current",
    "delegate-safe-decisions",
    "pause-and-switch",
    "stop-archive-current",
  ]);
});

test("topic drift after plan handoff preserves mandatory review gate", () => {
  const recentAssistantOutput = formatNextStepBlock({
    phase: "plan",
    artifactPath: ".supervibe/artifacts/plans/example.md",
    nextPhase: "plan-review",
    nextCommand: "/supervibe-plan --review .supervibe/artifacts/plans/example.md",
    nextSkill: "supervibe:requesting-code-review",
    locale: "en",
  });
  const route = routeWorkflowIntent({
    userPhrase: "start implementing another thing",
    recentAssistantOutput,
  });

  assert.equal(route.intent, "workflow_resume_choice");
  assert.equal(route.command, "/supervibe-plan --review .supervibe/artifacts/plans/example.md");
  assert.ok(route.requiredSafety.includes("final-gates-cannot-be-delegated"));
  assert.ok(route.requiredSafety.includes("record-skip-or-delegation"));
});

test("explicit stop after saved handoff does not silently continue workflow", () => {
  const recentAssistantOutput = formatNextStepBlock({
    phase: "brainstorm",
    artifactPath: ".supervibe/artifacts/specs/example.md",
    locale: "en",
  });
  const route = routeWorkflowIntent({
    userPhrase: "stop that flow",
    recentAssistantOutput,
  });

  assert.notEqual(route.intent, "workflow_resume_choice");
  assert.notEqual(route.source, "recent-handoff");
});

test("russian topic drift resume question is localized", () => {
  const recentAssistantOutput = formatNextStepBlock({
    phase: "brainstorm",
    artifactPath: ".supervibe/artifacts/specs/example.md",
    locale: "ru",
  });
  const route = routeWorkflowIntent({
    userPhrase: "сделай другую задачу",
    recentAssistantOutput,
  });

  assert.equal(route.intent, "workflow_resume_choice");
  assert.match(route.nextQuestion, /Шаг 1\/1/);
  assert.match(route.nextQuestion, /пропустить\/делегировать/i);
});
