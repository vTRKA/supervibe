import { routeTriggerRequest } from "./supervibe-trigger-router.mjs";
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
    expected: { intent: "continue_plan", command: "/supervibe-plan --from-brainstorm", minConfidence: 0.9 },
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
    expected: { intent: "atomize_plan", command: "/supervibe-loop --atomize-plan", minConfidence: 0.88 },
  },
  {
    id: "worktree-run-en",
    phrase: "run it in a separate worktree",
    context: { artifacts: { epicId: "EPIC-1", stopCommandAvailable: true } },
    expected: { intent: "worktree_autonomous_run", command: "/supervibe-loop --epic --worktree", minConfidence: 0.88 },
  },
  {
    id: "agent-system-audit-en",
    phrase: "audit agent system maturity intent routing receipts skills semantic rag and codegraph coverage",
    context: { artifacts: { userRequest: true } },
    expected: {
      intent: "supervibe_audit",
      command: "/supervibe-audit",
      minConfidence: 0.9,
      notIntent: ["agent_strengthen", "prompt_ai_engineering"],
      requiredSafety: ["read-only-audit", "receipt-provenance-check"],
      forbiddenSafetyBlockers: ["needs-explicit-user-confirmation"],
    },
  },
  {
    id: "handoff-affirmation",
    phrase: "yes",
    context: {
      recentAssistantOutput: [
        "NEXT_STEP_HANDOFF",
        "Current phase: plan",
        "Artifact: .supervibe/artifacts/plans/example.md",
        "Next phase: plan-review",
        "Next command: /supervibe-plan --review",
        "Next skill: supervibe:requesting-code-review",
        "Stop condition: ask-before-plan-review",
        "Question: Step 1/1: the plan review loop?",
        "END_NEXT_STEP_HANDOFF",
      ].join("\n"),
    },
    expected: { intent: "plan_review", command: "/supervibe-plan --review", minConfidence: 0.95 },
  },
]);

export const DEFAULT_SEMANTIC_TRIGGER_FIXTURES = Object.freeze([
  {
    id: "implicit-work-ui-en",
    phrase: "users cannot see epics, phases, cycles, tasks, or change status from one UI",
    expected: { intent: "work_control_ui", command: "/supervibe-ui", minConfidence: 0.9 },
  },
  {
    id: "implicit-work-ui-ru",
    phrase: "пользователь не может визуально увидеть задачи эпики фазы и влиять на них из ui",
    expected: { intent: "work_control_ui", command: "/supervibe-ui", minConfidence: 0.9 },
  },
  {
    id: "stale-work-cleanup-en",
    phrase: "old closed epics and stale tasks are cluttering memory and should be archived",
    expected: { intent: "cleanup_stale_work", command: "/supervibe-gc --all --dry-run", minConfidence: 0.9 },
  },
  {
    id: "stale-work-cleanup-ru",
    phrase: "старые задачи и закрытые эпики превращаются в мусор и захламляют проект",
    expected: { intent: "cleanup_stale_work", command: "/supervibe-gc --all --dry-run", minConfidence: 0.9 },
  },
  {
    id: "agent-tool-usage-en",
    phrase: "agents feel weak and do not use tools, memory, rag, or codegraph enough",
    expected: { intent: "agent_strengthen", command: "/supervibe-strengthen", minConfidence: 0.9 },
  },
  {
    id: "agent-tool-usage-ru",
    phrase: "агенты отупели и не пользуются инструментами памятью rag и кодграфом",
    expected: { intent: "agent_strengthen", command: "/supervibe-strengthen", minConfidence: 0.9 },
  },
  {
    id: "memory-rag-audit-en",
    phrase: "check whether memory rag retrieval codegraph and semantic anchors save tokens without losing quality",
    expected: { intent: "memory_audit", command: "/supervibe-audit --memory", minConfidence: 0.9 },
  },
  {
    id: "memory-rag-audit-ru",
    phrase: "проверь память rag context codegraph и экономию токенов без потери качества",
    expected: { intent: "memory_audit", command: "/supervibe-audit --memory", minConfidence: 0.9 },
  },
  {
    id: "docs-audit-en",
    phrase: "docs folder has internal todo garbage and stale documentation, what can we remove",
    expected: { intent: "docs_audit", command: "/supervibe-audit --docs", minConfidence: 0.9 },
  },
  {
    id: "docs-audit-ru",
    phrase: "в docs мусор туду старые доки и файлы внутренней разработки надо удалить",
    expected: { intent: "docs_audit", command: "/supervibe-audit --docs", minConfidence: 0.9 },
  },
  {
    id: "figma-source-en",
    phrase: "Figma variables components tokens and Code Connect drift from code source of truth",
    expected: { intent: "figma_source_of_truth", command: "/supervibe-design --figma-source-of-truth", minConfidence: 0.9 },
  },
  {
    id: "figma-source-ru",
    phrase: "фигма переменные компоненты токены и прототип отстают от кода нужен источник истины",
    expected: { intent: "figma_source_of_truth", command: "/supervibe-design --figma-source-of-truth", minConfidence: 0.9 },
  },
  {
    id: "design-pain-en",
    phrase: "the interface looks amateur and cheap, make the visual design premium and professional",
    expected: { intent: "design_new", command: "/supervibe-design", minConfidence: 0.9 },
  },
  {
    id: "design-pain-ru",
    phrase: "экран выглядит дешево и любительски сделай дизайн профессиональным",
    expected: { intent: "design_new", command: "/supervibe-design", minConfidence: 0.9 },
  },
  {
    id: "trigger-misread-en",
    phrase: "the router misunderstood my intent and picked the wrong command, diagnose why",
    expected: { intent: "trigger_diagnostics", command: "/supervibe --diagnose-trigger", minConfidence: 0.9 },
  },
  {
    id: "trigger-misread-ru",
    phrase: "плагин не понимает намерение и выбирает не ту команду проверь триггер",
    expected: { intent: "trigger_diagnostics", command: "/supervibe --diagnose-trigger", minConfidence: 0.9 },
  },
  {
    id: "agent-system-audit-en",
    phrase: "users ask for agent maturity, intent routing, semantic RAG coverage and receipts audit",
    expected: {
      intent: "supervibe_audit",
      command: "/supervibe-audit",
      minConfidence: 0.9,
      notIntent: ["agent_strengthen", "prompt_ai_engineering"],
      requiredSafety: ["read-only-audit", "semantic-route-coverage"],
      forbiddenSafetyBlockers: ["needs-explicit-user-confirmation"],
    },
  },
  {
    id: "agent-system-audit-ru",
    phrase: "оцени агентскую систему интенты receipts skills rag codegraph на 10 из 10",
    expected: {
      intent: "supervibe_audit",
      command: "/supervibe-audit",
      minConfidence: 0.9,
      notIntent: ["agent_strengthen", "prompt_ai_engineering"],
      requiredSafety: ["read-only-audit"],
    },
  },
  {
    id: "no-overdispatch-small-question-en",
    phrase: "do not call agents for this tiny question, just explain the route",
    expected: {
      intent: "trigger_diagnostics",
      command: "/supervibe --diagnose-trigger",
      minConfidence: 0.9,
      notIntent: ["agent_strengthen", "agent_provisioning", "prompt_ai_engineering", "supervibe_audit"],
      forbiddenSafetyBlockers: ["needs-explicit-user-confirmation"],
    },
  },
  {
    id: "plan-review-before-start-en",
    phrase: "plan is ready, start implementation but run review and atomize first",
    expected: {
      intent: "plan_review",
      command: "/supervibe-plan --review",
      minConfidence: 0.88,
      notIntent: ["execute_plan"],
    },
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
    for (const intent of normalizeList(expected.notIntent)) {
      if (route.intent === intent) failures.push(`forbidden intent ${intent}`);
    }
    for (const command of normalizeList(expected.notCommand)) {
      if (route.command === command) failures.push(`forbidden command ${command}`);
    }
    if (expected.source && route.source !== expected.source) {
      failures.push(`expected source ${expected.source}, got ${route.source}`);
    }
    for (const safety of normalizeList(expected.requiredSafety)) {
      if (!route.requiredSafety?.includes(safety)) failures.push(`expected required safety ${safety}`);
    }
    for (const blocker of normalizeList(expected.forbiddenSafetyBlockers)) {
      if (route.safetyBlockers?.includes(blocker)) failures.push(`forbidden safety blocker ${blocker}`);
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
      expected,
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

export function evaluateSemanticIntentMatrix(fixtures = DEFAULT_SEMANTIC_TRIGGER_FIXTURES, options = {}) {
  const results = fixtures.map((fixture) => {
    const route = routeTriggerRequest(fixture.phrase, {
      artifacts: fixture.artifacts ?? {},
      ...options,
    });
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
    if (expected.source && route.source !== expected.source) {
      failures.push(`expected source ${expected.source}, got ${route.source}`);
    }
    for (const intent of normalizeList(expected.notIntent)) {
      if (route.intent === intent) failures.push(`forbidden intent ${intent}`);
    }
    for (const command of normalizeList(expected.notCommand)) {
      if (route.command === command) failures.push(`forbidden command ${command}`);
    }
    for (const safety of normalizeList(expected.requiredSafety)) {
      if (!route.requiredSafety?.includes(safety)) failures.push(`expected required safety ${safety}`);
    }
    for (const blocker of normalizeList(expected.forbiddenSafetyBlockers)) {
      if (route.safetyBlockers?.includes(blocker)) failures.push(`forbidden safety blocker ${blocker}`);
    }

    return {
      id: fixture.id,
      phrase: fixture.phrase,
      expected,
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
  return `${header}\n${failures}\n${formatIntentConfusionMatrix(evaluation)}`;
}

export function formatSemanticIntentEvaluation(evaluation) {
  const header = `Semantic intent evaluation: ${evaluation.passed}/${evaluation.total} passed`;
  if (evaluation.pass) return `${header}\nAll semantic paraphrase fixtures passed.`;
  const failures = evaluation.failed
    .map((result) => `- ${result.id}: ${result.failures.join("; ")}`)
    .join("\n");
  return `${header}\n${failures}\n${formatIntentConfusionMatrix(evaluation)}`;
}

export function buildIntentConfusionMatrix(results = []) {
  const cells = new Map();
  for (const result of results || []) {
    const expectedIntent = result.expected?.intent || formatForbiddenExpectedIntent(result.expected) || "unspecified";
    const actualIntent = result.route?.intent || "unknown";
    const key = `${expectedIntent}\u0000${actualIntent}`;
    cells.set(key, (cells.get(key) || 0) + 1);
  }
  return [...cells.entries()]
    .map(([key, count]) => {
      const [expectedIntent, actualIntent] = key.split("\u0000");
      return { expectedIntent, actualIntent, count };
    })
    .sort((left, right) => left.expectedIntent.localeCompare(right.expectedIntent) || left.actualIntent.localeCompare(right.actualIntent));
}

export function formatIntentConfusionMatrix(evaluation = {}) {
  const rows = buildIntentConfusionMatrix(evaluation.results || []);
  if (rows.length === 0) return "Intent confusion matrix: empty";
  return [
    "Intent confusion matrix:",
    ...rows.map((row) => `- expected=${row.expectedIntent} actual=${row.actualIntent} count=${row.count}`),
  ].join("\n");
}

function formatForbiddenExpectedIntent(expected = {}) {
  const forbidden = normalizeList(expected.notIntent);
  return forbidden.length ? `not:${forbidden.join("|")}` : null;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}
