import { getTriggerIntentCorpus } from "./supervibe-trigger-intent-corpus.mjs";

const ROUTES = {
  brainstorm_to_plan: {
    phase: "brainstorm",
    command: "/supervibe-plan",
    skill: "supervibe:writing-plans",
    nextQuestionRu: "Следующий шаг - написать план. Переходим?",
    nextQuestionEn: "Next step - write the plan. Proceed?",
    prerequisites: ["brainstorm-artifact-or-summary"],
  },
  plan_review: {
    phase: "plan",
    command: "/supervibe-plan --review",
    skill: "supervibe:requesting-code-review",
    nextQuestionRu: "Следующий шаг - review loop по плану. Переходим?",
    nextQuestionEn: "Next step - run the plan review loop. Proceed?",
    prerequisites: ["plan-path-or-plan-content"],
  },
  atomize_plan: {
    phase: "plan_reviewed",
    command: "/supervibe-loop --from-plan --atomize",
    skill: "supervibe:writing-plans",
    nextQuestionRu: "Следующий шаг - разбить план на атомарные work items и epic. Переходим?",
    nextQuestionEn: "Next step - split the plan into atomic work items and an epic. Proceed?",
    prerequisites: ["reviewed-plan"],
  },
  create_epic: {
    phase: "plan_reviewed",
    command: "/supervibe-loop --from-plan --create-epic",
    skill: "supervibe:autonomous-agent-loop",
    nextQuestionRu: "Следующий шаг - разбить план на атомарные work items и epic. Переходим?",
    nextQuestionEn: "Next step - split the plan into atomic work items and an epic. Proceed?",
    prerequisites: ["reviewed-plan"],
  },
  autonomous_epic_run: {
    phase: "execution",
    command: "/supervibe-loop --epic",
    skill: "supervibe:autonomous-agent-loop",
    nextQuestionRu: "Следующий шаг - provider-safe preflight перед worktree/autonomous run. Переходим?",
    nextQuestionEn: "Next step - run provider-safe preflight before the worktree/autonomous run. Proceed?",
    prerequisites: ["epic-id", "approved-scope"],
  },
  worktree_autonomous_run: {
    phase: "execution",
    command: "/supervibe-loop --epic --worktree",
    skill: "supervibe:using-git-worktrees",
    nextQuestionRu: "Следующий шаг - provider-safe preflight перед worktree/autonomous run. Переходим?",
    nextQuestionEn: "Next step - run provider-safe preflight before the worktree/autonomous run. Proceed?",
    prerequisites: ["epic-id", "clean-or-isolated-worktree"],
  },
  execute_plan: {
    phase: "execution",
    command: "/supervibe-execute-plan",
    skill: "supervibe:executing-plans",
    nextQuestionRu: "Следующий шаг - readiness audit перед исполнением. Переходим?",
    nextQuestionEn: "Next step - run the readiness audit before execution. Proceed?",
    prerequisites: ["plan-path-or-plan-content", "readiness-audit"],
  },
  ready_query: {
    phase: "status",
    command: "/supervibe-status --ready",
    skill: "supervibe:project-memory",
    nextQuestionRu: "Следующий шаг - показать ready work items. Переходим?",
    nextQuestionEn: "Next step - show ready work items. Proceed?",
    prerequisites: [],
  },
  blocked_query: {
    phase: "status",
    command: "/supervibe-status --blocked",
    skill: "supervibe:project-memory",
    nextQuestionRu: "Следующий шаг - показать blockers. Переходим?",
    nextQuestionEn: "Next step - show blockers. Proceed?",
    prerequisites: [],
  },
  trigger_diagnostics: {
    phase: "diagnostics",
    command: "/supervibe --diagnose-trigger",
    skill: "supervibe:trigger-diagnostics",
    nextQuestionRu: "Следующий шаг - показать диагностику триггера. Переходим?",
    nextQuestionEn: "Next step - show trigger diagnostics. Proceed?",
    prerequisites: ["user-request"],
  },
  why_trigger: {
    phase: "diagnostics",
    command: "/supervibe --why-trigger",
    skill: "supervibe:trigger-diagnostics",
    nextQuestionRu: "Следующий шаг - показать объяснение выбора skill. Переходим?",
    nextQuestionEn: "Next step - explain the selected skill. Proceed?",
    prerequisites: ["last-route"],
  },
  readme_update: {
    phase: "documentation",
    command: "/supervibe-plan --docs-sync",
    skill: "supervibe:writing-plans",
    nextQuestionRu: "Следующий шаг - синхронизировать README и acceptance coverage. Переходим?",
    nextQuestionEn: "Next step - sync README and acceptance coverage. Proceed?",
    prerequisites: ["accepted-change-summary"],
  },
};

const RULES = [
  {
    intent: "worktree_autonomous_run",
    confidence: 0.92,
    test: (text) => hasAny(text, ["worktree", "separate workspace", "isolated session"]) && hasAny(text, ["parallel sessions", "multiple sessions", "10 sessions", "same plan", "same epic"]),
  },
  {
    intent: "worktree_autonomous_run",
    confidence: 0.94,
    test: (text) => hasAny(text, ["worktree", "отдельном worktree"]) && hasAny(text, ["автоном", "epic", "эпик", "3 часа", "3h"]),
  },
  {
    intent: "autonomous_epic_run",
    confidence: 0.91,
    test: (text) => hasAny(text, ["автоном", "autonom"]) && hasAny(text, ["эпик", "epic", "3 часа", "3h"]),
  },
  {
    intent: "create_epic",
    confidence: 0.9,
    test: (text) => hasAny(text, ["создай эпик", "create epic", "epic"]) && hasAny(text, ["план", "plan", "child tasks"]),
  },
  {
    intent: "atomize_plan",
    confidence: 0.9,
    test: (text) => hasAny(text, ["атомар", "atomic", "разбей", "break"]) && hasAny(text, ["план", "plan", "задач", "tasks"]),
  },
  {
    intent: "plan_review",
    confidence: 0.91,
    test: (text) => hasAny(text, ["ревью", "review", "проверь"]) && hasAny(text, ["план", "plan"]),
  },
  {
    intent: "brainstorm_to_plan",
    confidence: 0.9,
    test: (text) => hasAny(text, ["брейншторм", "brainstorm"]) && hasAny(text, ["готов", "done", "finished", "после", "next", "дальше", "план", "plan"]),
  },
  {
    intent: "execute_plan",
    confidence: 0.87,
    test: (text) => hasAny(text, ["сделай по плану", "выполни план", "execute plan", "run plan"]),
  },
  {
    intent: "trigger_diagnostics",
    confidence: 0.9,
    test: (text) => hasAny(text, ["почему не сработал", "trigger fail", "diagnose trigger", "триггер не"]),
  },
  {
    intent: "why_trigger",
    confidence: 0.88,
    test: (text) => hasAny(text, ["почему выбрал", "why did you choose", "why this skill", "why-trigger"]),
  },
  {
    intent: "ready_query",
    confidence: 0.84,
    test: (text) => hasAny(text, ["что готово", "ready work", "ready tasks"]),
  },
  {
    intent: "blocked_query",
    confidence: 0.84,
    test: (text) => hasAny(text, ["что заблокировано", "blocked", "blockers"]),
  },
  {
    intent: "readme_update",
    confidence: 0.84,
    test: (text) => hasAny(text, ["readme", "ридми"]) && hasAny(text, ["обнови", "update", "sync"]),
  },
];

export function routeTriggerRequest(input, options = {}) {
  const request = typeof input === "string" ? input : input?.request;
  const artifacts = typeof input === "object" && input?.artifacts ? input.artifacts : options.artifacts ?? {};
  const text = normalize(request ?? "");
  const locale = detectLocale(text);
  const corpus = options.corpus ?? getTriggerIntentCorpus();

  const exact = corpus.find((entry) => normalize(entry.phrase) === text);
  if (exact) {
    return withArtifactStatus(
      {
        ...exact,
        confidence: 1,
        nextQuestion: localizeQuestion(exact, locale),
        alternatives: alternativesFor(exact.intent, corpus),
        matchedPhrase: exact.phrase,
        reason: `Exact corpus match: ${exact.id}`,
      },
      artifacts,
    );
  }

  const scored = RULES.filter((rule) => rule.test(text)).sort((a, b) => b.confidence - a.confidence);
  if (scored.length > 0) {
    const route = ROUTES[scored[0].intent];
    return withArtifactStatus(
      {
        intent: scored[0].intent,
        phase: route.phase,
        command: route.command,
        skill: route.skill,
        confidence: scored[0].confidence,
        confidenceFloor: scored[0].confidence,
        mutationRisk: mutationRiskFor(scored[0].intent),
        prerequisites: route.prerequisites,
        requiredSafety: requiredSafetyFor(scored[0].intent),
        nextQuestion: locale === "ru" ? route.nextQuestionRu : route.nextQuestionEn,
        alternatives: scored.slice(1, 4).map((rule) => ({ intent: rule.intent, confidence: rule.confidence })),
        matchedPhrase: null,
        reason: `Keyword route: ${scored[0].intent}`,
      },
      artifacts,
    );
  }

  return {
    intent: "unknown",
    phase: "diagnostics",
    command: "/supervibe --diagnose-trigger",
    skill: "supervibe:trigger-diagnostics",
    confidence: 0,
    confidenceFloor: 0.8,
    mutationRisk: "none",
    prerequisites: ["user-request"],
    requiredSafety: ["confirm-before-mutation"],
    nextQuestion: locale === "ru"
      ? "Триггер не распознан. Показать диагностику и ближайшие маршруты?"
      : "Trigger was not recognized. Show diagnostics and nearest routes?",
    alternatives: [],
    missingArtifacts: [],
    safetyBlockers: [],
    matchedPhrase: null,
    reason: "No corpus or keyword match",
  };
}

function withArtifactStatus(route, artifacts) {
  const missingArtifacts = route.prerequisites.filter((name) => !artifactSatisfied(name, artifacts));
  const safetyBlockers = safetyBlockersFor(route, artifacts);
  return { ...route, missingArtifacts, safetyBlockers };
}

function artifactSatisfied(name, artifacts) {
  const aliases = {
    "brainstorm-artifact-or-summary": ["brainstorm", "brainstormSummary", "spec"],
    "plan-path-or-plan-content": ["plan", "planPath", "planContent"],
    "reviewed-plan": ["planReviewPassed", "reviewedPlan", "planReview"],
    "epic-id": ["epic", "epicId"],
    "approved-scope": ["approvedScope", "approval", "approvals"],
    "clean-or-isolated-worktree": ["worktreeClean", "worktreePath"],
    "duration-budget": ["durationBudget", "maxDuration"],
    "readiness-audit": ["readinessAudit", "planReviewPassed"],
    "accepted-change-summary": ["changeSummary", "acceptedChangeSummary"],
    "user-request": ["request", "userRequest"],
    "last-route": ["lastRoute"],
  };
  const keys = aliases[name] ?? [name];
  return keys.some((key) => Boolean(artifacts[key]));
}

function safetyBlockersFor(route, artifacts) {
  const blockers = [];
  if (route.mutationRisk !== "none" && artifacts.confirmedMutation !== true) {
    blockers.push("needs-explicit-user-confirmation");
  }
  if (route.requiredSafety?.includes("bounded-runtime") && !artifacts.maxDuration && !artifacts.durationBudget) {
    blockers.push("needs-bounded-runtime");
  }
  if (route.requiredSafety?.includes("stop-command") && artifacts.stopCommandAvailable === false) {
    blockers.push("stop-command-unavailable");
  }
  if (artifacts.providerPolicyReviewed === false) {
    blockers.push("provider-policy-review-required");
  }
  return blockers;
}

function alternativesFor(intent, corpus) {
  return [...new Set(corpus.filter((entry) => entry.intent !== intent).map((entry) => entry.intent))]
    .slice(0, 3)
    .map((candidate) => ({ intent: candidate, confidence: 0.5 }));
}

function localizeQuestion(entry, locale) {
  if (locale === "en") {
    const route = ROUTES[entry.intent];
    return route?.nextQuestionEn ?? entry.nextQuestionIncludes;
  }
  return entry.nextQuestionIncludes;
}

function mutationRiskFor(intent) {
  if (["autonomous_epic_run", "execute_plan"].includes(intent)) return "executes-code";
  if (intent === "worktree_autonomous_run") return "creates-worktree";
  if (["atomize_plan", "create_epic"].includes(intent)) return "writes-tracker";
  if (["brainstorm_to_plan", "readme_update"].includes(intent)) return "writes-docs";
  return "none";
}

function requiredSafetyFor(intent) {
  const base = ["no-provider-bypass", "no-hidden-background-work", "confirm-before-mutation"];
  if (["autonomous_epic_run", "worktree_autonomous_run"].includes(intent)) {
    return [...base, "bounded-runtime", "stop-command", intent === "worktree_autonomous_run" ? "worktree-cleanup" : "side-effect-ledger"];
  }
  if (intent === "execute_plan") return [...base, "readiness-gate", "completion-gate"];
  return base;
}

function detectLocale(text) {
  return /[а-яё]/i.test(text) ? "ru" : "en";
}

function hasAny(text, phrases) {
  return phrases.some((phrase) => text.includes(normalize(phrase)));
}

function normalize(value) {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}
