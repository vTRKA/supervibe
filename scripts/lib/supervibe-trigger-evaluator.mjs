import { routeWorkflowIntent } from "./supervibe-workflow-router.mjs";

export const DEFAULT_WORKFLOW_TRIGGER_FIXTURES = Object.freeze([
  {
    id: "vague-feature-en",
    phrase: "build feature for team onboarding",
    context: {},
    expected: { intent: "feature_brainstorm", command: "/supervibe-brainstorm", minConfidence: 0.8 },
  },
  {
    id: "vague-feature-ru",
    phrase: "сделай фичу авторизации",
    context: {},
    expected: { intent: "feature_brainstorm", command: "/supervibe-brainstorm", minConfidence: 0.8 },
  },
  {
    id: "brainstorm-continue-ru",
    phrase: "переходим?",
    context: { lastCompletedPhase: "brainstorm", artifacts: { brainstorm: true } },
    expected: { intent: "continue_plan", command: "/supervibe-plan", minConfidence: 0.9 },
  },
  {
    id: "plan-execution-forces-review",
    phrase: "run it",
    context: { lastCompletedPhase: "plan", artifacts: { plan: true } },
    expected: { intent: "plan_review", command: "/supervibe-plan --review", minConfidence: 0.9 },
  },
  {
    id: "reviewed-plan-atomize-ru",
    phrase: "разбей план на атомарные задачи",
    context: { artifacts: { plan: true, planReviewPassed: true } },
    expected: { intent: "atomize_plan", command: "/supervibe-loop --from-plan --atomize", minConfidence: 0.88 },
  },
  {
    id: "worktree-run-en",
    phrase: "run it in a separate worktree",
    context: { artifacts: { epicId: "EPIC-1", stopCommandAvailable: true } },
    expected: { intent: "worktree_autonomous_run", command: "/supervibe-loop --epic --worktree", minConfidence: 0.88 },
  },
  {
    id: "handoff-affirmation",
    phrase: "yes",
    context: {
      recentAssistantOutput: [
        "NEXT_STEP_HANDOFF",
        "Current phase: plan",
        "Artifact: docs/plans/example.md",
        "Next phase: plan-review",
        "Next command: /supervibe-plan --review",
        "Next skill: supervibe:requesting-code-review",
        "Stop condition: ask-before-plan-review",
        "Question: Next step is the plan review loop. Proceed?",
        "END_NEXT_STEP_HANDOFF",
      ].join("\n"),
    },
    expected: { intent: "plan_review", command: "/supervibe-plan --review", minConfidence: 0.95 },
  },
]);

export function evaluateTriggerMatrix(fixtures = DEFAULT_WORKFLOW_TRIGGER_FIXTURES, options = {}) {
  const results = fixtures.map((fixture) => {
    const route = routeWorkflowIntent({
      userPhrase: fixture.phrase,
      ...(fixture.context ?? {}),
    }, options);
    const expected = fixture.expected ?? {};
    const failures = [];

    if (expected.intent && route.intent !== expected.intent) {
      failures.push(`expected intent ${expected.intent}, got ${route.intent}`);
    }
    if (expected.command && route.command !== expected.command) {
      failures.push(`expected command ${expected.command}, got ${route.command}`);
    }
    if (typeof expected.minConfidence === "number" && route.confidence < expected.minConfidence) {
      failures.push(`expected confidence >= ${expected.minConfidence}, got ${route.confidence}`);
    }
    if (expected.skill && route.skill !== expected.skill) {
      failures.push(`expected skill ${expected.skill}, got ${route.skill}`);
    }
    if (Array.isArray(expected.safetyBlockers)) {
      for (const blocker of expected.safetyBlockers) {
        if (!route.safetyBlockers.includes(blocker)) {
          failures.push(`expected safety blocker ${blocker}`);
        }
      }
    }

    return {
      id: fixture.id,
      phrase: fixture.phrase,
      pass: failures.length === 0,
      failures,
      route,
    };
  });

  return {
    pass: results.every((result) => result.pass),
    total: results.length,
    passed: results.filter((result) => result.pass).length,
    failed: results.filter((result) => !result.pass),
    results,
  };
}

export function formatTriggerEvaluation(evaluation) {
  const header = `Trigger evaluation: ${evaluation.passed}/${evaluation.total} passed`;
  if (evaluation.pass) return `${header}\nAll workflow trigger fixtures passed.`;
  const failures = evaluation.failed
    .map((result) => `- ${result.id}: ${result.failures.join("; ")}`)
    .join("\n");
  return `${header}\n${failures}`;
}
