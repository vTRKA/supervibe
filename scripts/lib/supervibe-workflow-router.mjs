import { routeTriggerRequest } from "./supervibe-trigger-router.mjs";
import {
  formatNextStepBlock,
  getNextWorkflowStep,
  normalizeWorkflowPhase,
  parseNextStepBlock,
  WORKFLOW_EDGES,
} from "./supervibe-skill-chain.mjs";

const AFFIRMATIVE_PHRASES = [
  "yes",
  "y",
  "ok",
  "okay",
  "go",
  "proceed",
  "continue",
  "next",
  "да",
  "ок",
  "переходим",
  "продолжай",
  "дальше",
  "го",
];

const VAGUE_FEATURE_PHRASES = [
  "build feature",
  "make feature",
  "add feature",
  "create feature",
  "implement feature",
  "design feature",
  "add auth",
  "build dashboard",
  "make integration",
  "сделай фич",
  "добавь фич",
  "реализуй фич",
  "нужна фич",
  "сделай авторизац",
  "добавь авторизац",
  "сделай интеграц",
  "новый экран",
];

const PLAN_EXECUTION_PHRASES = [
  "execute plan",
  "run plan",
  "do the plan",
  "start implementation",
  "run it",
  "сделай по плану",
  "выполни план",
  "запусти план",
  "начинай делать",
  "делай без остановки",
];

const ATOMIZE_PHRASES = [
  "atomize",
  "atomic tasks",
  "split into tasks",
  "break into tasks",
  "create epic",
  "разбей",
  "атомарн",
  "создай эпик",
  "child tasks",
];

const WORKTREE_PHRASES = [
  "worktree",
  "separate workspace",
  "isolated session",
  "parallel sessions",
  "multiple sessions",
  "10 sessions",
  "отдельном worktree",
  "изолированн",
  "отдельная сесс",
];

export function routeWorkflowIntent(input, options = {}) {
  const request = typeof input === "string" ? input : input?.userPhrase ?? input?.request ?? "";
  const artifacts = {
    ...(options.artifacts ?? {}),
    ...((typeof input === "object" && input?.artifacts) || {}),
  };
  const recentAssistantOutput = typeof input === "object"
    ? input?.recentAssistantOutput ?? options.recentAssistantOutput
    : options.recentAssistantOutput;
  const lastCompletedPhase = typeof input === "object"
    ? input?.lastCompletedPhase ?? options.lastCompletedPhase
    : options.lastCompletedPhase;
  const dirtyGitState = typeof input === "object" ? input?.dirtyGitState ?? options.dirtyGitState : options.dirtyGitState;
  const text = normalize(request);
  const locale = detectLocale(request);

  const handoff = routeFromRecentHandoff(request, recentAssistantOutput, locale);
  if (handoff) return applySafetyState(handoff, { dirtyGitState, artifacts });

  const contextual = routeFromWorkflowContext({ text, locale, lastCompletedPhase, artifacts, dirtyGitState });
  if (contextual) return applySafetyState(contextual, { dirtyGitState, artifacts });

  const triggerRoute = routeTriggerRequest(request, { artifacts });
  if (triggerRoute.intent !== "unknown") {
    return applySafetyState(fromTriggerRoute(triggerRoute, { locale }), { dirtyGitState, artifacts });
  }

  if (isVagueFeatureRequest(text)) {
    return fromWorkflowStep("intake", {
      intent: "feature_brainstorm",
      locale,
      confidence: 0.83,
      reason: "Vague feature request requires brainstorm before plan or execution.",
      source: "vague-feature-rule",
    });
  }

  return {
    intent: "unknown",
    phase: "diagnostics",
    command: "/supervibe --diagnose-trigger",
    skill: "supervibe:trigger-diagnostics",
    confidence: 0,
    mutationRisk: "none",
    source: "fallback",
    reason: "No workflow, trigger corpus, or vague-feature match.",
    nextPromptText: locale === "ru"
      ? "Триггер не распознан. Показать диагностику и ближайшие маршруты?"
      : "Trigger was not recognized. Show diagnostics and nearest routes?",
    nextQuestion: locale === "ru"
      ? "Триггер не распознан. Показать диагностику и ближайшие маршруты?"
      : "Trigger was not recognized. Show diagnostics and nearest routes?",
    stopCondition: "ask-before-diagnostics",
    requiredSafety: ["confirm-before-mutation"],
    missingArtifacts: [],
    safetyBlockers: [],
    alternatives: [],
  };
}

export function formatWorkflowRoute(route) {
  const blockers = route.safetyBlockers?.length ? ` blockers=${route.safetyBlockers.join(",")}` : "";
  const artifacts = route.missingArtifacts?.length ? ` missing=${route.missingArtifacts.join(",")}` : "";
  return [
    `WORKFLOW_ROUTE intent=${route.intent} command=${route.command} skill=${route.skill} confidence=${route.confidence}${blockers}${artifacts}`,
    `Reason: ${route.reason}`,
    `Next: ${route.nextPromptText}`,
  ].join("\n");
}

function routeFromRecentHandoff(request, recentAssistantOutput, locale) {
  if (!isAffirmative(request)) return null;
  const parsed = parseNextStepBlock(recentAssistantOutput);
  if (!parsed?.nextCommand) return null;

  return {
    intent: intentForCommand(parsed.nextCommand),
    phase: parsed.nextPhase ?? "workflow-continuation",
    command: parsed.nextCommand,
    skill: parsed.nextSkill ?? "supervibe:workflow-router",
    confidence: 0.97,
    mutationRisk: mutationRiskForCommand(parsed.nextCommand),
    source: "recent-handoff",
    reason: "User affirmed the previous NEXT_STEP_HANDOFF block.",
    nextPromptText: parsed.question ?? (locale === "ru" ? "Переходим к следующему шагу?" : "Proceed to the next step?"),
    nextQuestion: parsed.question ?? (locale === "ru" ? "Переходим к следующему шагу?" : "Proceed to the next step?"),
    stopCondition: parsed.stopCondition ?? "ask-before-next-step",
    requiredSafety: safetyForCommand(parsed.nextCommand),
    missingArtifacts: [],
    safetyBlockers: [],
    alternatives: [],
    handoff: parsed,
  };
}

function routeFromWorkflowContext({ text, locale, lastCompletedPhase, artifacts }) {
  const phase = normalizeWorkflowPhase(lastCompletedPhase);
  const affirmative = AFFIRMATIVE_PHRASES.some((phrase) => text === normalize(phrase) || text.includes(normalize(phrase)));
  if (phase && affirmative && WORKFLOW_EDGES[phase]) {
    return fromWorkflowStep(phase, {
      intent: `continue_${WORKFLOW_EDGES[phase].nextPhase}`,
      locale,
      confidence: 0.95,
      reason: `User affirmed continuation after ${phase}.`,
      source: "last-completed-phase",
    });
  }

  if (containsAny(text, WORKTREE_PHRASES)) {
    return fromWorkflowStep("worktree-setup", {
      intent: "worktree_autonomous_run",
      locale,
      confidence: 0.9,
      reason: "Request mentions isolated worktree execution.",
      source: "worktree-rule",
      command: "/supervibe-loop --epic --worktree",
      skill: "supervibe:using-git-worktrees",
      question: locale === "ru"
        ? "Следующий шаг - provider-safe preflight перед worktree/autonomous run. Переходим?"
        : "Next step is provider-safe preflight before the worktree/autonomous run. Proceed?",
      artifactOverride: artifacts.epicId ?? artifacts.epic ?? undefined,
    });
  }

  if (containsAny(text, PLAN_EXECUTION_PHRASES)) {
    if (!artifacts.planReviewPassed) {
      return fromWorkflowStep("plan", {
        intent: "plan_review",
        locale,
        confidence: 0.92,
        reason: "Execution request is blocked until mandatory plan review passes.",
        source: "plan-review-gate",
      });
    }
    if (!artifacts.workItemsReady && !artifacts.epicId && !artifacts.epic) {
      return fromWorkflowStep("plan-review", {
        intent: "atomize_plan",
        locale,
        confidence: 0.9,
        reason: "Execution request has a reviewed plan but no atomic work items or epic.",
        source: "atomization-gate",
      });
    }
    return fromWorkflowStep("work-item-atomization", {
      intent: "single_session_epic_run",
      locale,
      confidence: 0.88,
      reason: "Reviewed and atomized work can enter bounded current-session execution; worktree is only used when explicitly requested.",
      source: "execution-rule",
    });
  }

  if (containsAny(text, ATOMIZE_PHRASES)) {
    if (!artifacts.planReviewPassed) {
      return fromWorkflowStep("plan", {
        intent: "plan_review",
        locale,
        confidence: 0.9,
        reason: "Atomization is blocked until mandatory plan review passes.",
        source: "plan-review-gate",
      });
    }
    return fromWorkflowStep("plan-review", {
      intent: text.includes("epic") || text.includes("эпик") ? "create_epic" : "atomize_plan",
      locale,
      confidence: 0.9,
      reason: "Reviewed plan can be atomized into durable work items.",
      source: "atomize-rule",
    });
  }

  if (phase === "brainstorm" && (text.includes("plan") || text.includes("план") || text.includes("что дальше"))) {
    return fromWorkflowStep("brainstorm", {
      intent: "brainstorm_to_plan",
      locale,
      confidence: 0.91,
      reason: "Brainstorm completion naturally hands off to planning.",
      source: "phase-artifact-rule",
    });
  }

  if (phase === "plan" && (text.includes("review") || text.includes("ревью") || text.includes("провер"))) {
    return fromWorkflowStep("plan", {
      intent: "plan_review",
      locale,
      confidence: 0.92,
      reason: "Plan is ready and requires review before atomization or execution.",
      source: "phase-artifact-rule",
    });
  }

  return null;
}

function fromTriggerRoute(route, options = {}) {
  return {
    intent: route.intent,
    phase: route.phase,
    command: route.command,
    skill: route.skill,
    confidence: route.confidence,
    mutationRisk: route.mutationRisk,
    source: "trigger-router",
    reason: route.reason,
    nextPromptText: route.nextQuestion,
    nextQuestion: route.nextQuestion,
    stopCondition: stopConditionForCommand(route.command),
    requiredSafety: route.requiredSafety ?? [],
    missingArtifacts: route.missingArtifacts ?? [],
    safetyBlockers: route.safetyBlockers ?? [],
    alternatives: route.alternatives ?? [],
    handoffBlock: formatNextStepBlock({
      phase: phaseForRoute(route),
      artifactPath: route.prerequisites?.[0],
      locale: options.locale,
      command: route.command,
      skill: route.skill,
      question: route.nextQuestion,
      why: route.reason,
    }),
  };
}

function fromWorkflowStep(phase, options = {}) {
  const edge = getNextWorkflowStep(phase);
  const locale = options.locale === "ru" ? "ru" : "en";
  const nextPromptText = options.question ?? (locale === "ru" ? edge.questionRu : edge.questionEn);
  return {
    intent: options.intent ?? `continue_${edge.nextPhase}`,
    phase: edge.phase,
    command: options.command ?? edge.command,
    skill: options.skill ?? edge.skill,
    confidence: options.confidence ?? 0.9,
    mutationRisk: mutationRiskForCommand(options.command ?? edge.command),
    source: options.source ?? "workflow-step",
    reason: options.reason ?? edge.why,
    nextPromptText,
    nextQuestion: nextPromptText,
    stopCondition: edge.stopCondition,
    requiredSafety: safetyForCommand(options.command ?? edge.command),
    missingArtifacts: [],
    safetyBlockers: [],
    alternatives: [],
    handoffBlock: formatNextStepBlock({
      phase,
      artifactPath: options.artifactOverride,
      locale,
      command: options.command ?? edge.command,
      skill: options.skill ?? edge.skill,
      question: nextPromptText,
      why: options.reason ?? edge.why,
    }),
  };
}

function applySafetyState(route, { dirtyGitState, artifacts }) {
  const safetyBlockers = [...(route.safetyBlockers ?? [])];
  if (dirtyGitState === "dirty" && route.mutationRisk !== "none" && !route.command?.includes("--worktree")) {
    safetyBlockers.push("dirty-worktree-requires-review-or-isolation");
  }
  if (dirtyGitState === "dirty" && route.command?.includes("--worktree") && !artifacts.worktreePath) {
    safetyBlockers.push("dirty-main-worktree-needs-isolated-session-plan");
  }
  if (route.command?.includes("--epic") && !artifacts.stopCommandAvailable && !safetyBlockers.includes("stop-command-unavailable")) {
    safetyBlockers.push("stop-command-unavailable");
  }
  return { ...route, safetyBlockers: [...new Set(safetyBlockers)] };
}

function phaseForRoute(route) {
  if (route.intent === "brainstorm_to_plan") return "brainstorm";
  if (route.intent === "plan_review" || route.intent === "execute_plan") return "plan";
  if (route.intent === "atomize_plan" || route.intent === "create_epic") return "plan-review";
  if (route.intent === "worktree_autonomous_run") return "worktree-setup";
  if (route.intent === "autonomous_epic_run") return "work-item-atomization";
  return "intake";
}

function isVagueFeatureRequest(text) {
  if (containsAny(text, PLAN_EXECUTION_PHRASES) || containsAny(text, ATOMIZE_PHRASES)) return false;
  return containsAny(text, VAGUE_FEATURE_PHRASES);
}

function isAffirmative(value) {
  const text = normalize(value);
  return AFFIRMATIVE_PHRASES.some((phrase) => text === normalize(phrase) || text.includes(normalize(phrase)));
}

function containsAny(text, phrases) {
  return phrases.some((phrase) => text.includes(normalize(phrase)));
}

function detectLocale(value) {
  return /[а-яё]/i.test(String(value)) ? "ru" : "en";
}

function normalize(value) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function intentForCommand(command) {
  if (command.includes("--review")) return "plan_review";
  if (command.includes("--atomize")) return "atomize_plan";
  if (command.includes("--worktree")) return "worktree_autonomous_run";
  if (command.includes("--epic")) return "autonomous_epic_run";
  if (command.includes("execute-plan")) return "execute_plan";
  if (command.includes("brainstorm")) return "feature_brainstorm";
  if (command.includes("plan")) return "brainstorm_to_plan";
  return "workflow_continuation";
}

function mutationRiskForCommand(command) {
  if (command.includes("--worktree")) return "creates-worktree";
  if (command.includes("--epic") || command.includes("execute-plan") || command.includes("--guided") || command.includes("--manual") || command.includes("--fresh-context")) return "executes-code";
  if (command.includes("--atomize") || command.includes("--create-epic")) return "writes-tracker";
  if (command.includes("plan") || command.includes("brainstorm")) return "writes-docs";
  return "none";
}

function safetyForCommand(command) {
  const base = ["confirm-before-mutation", "no-provider-bypass", "no-hidden-background-work"];
  if (command.includes("--worktree")) return [...base, "worktree-cleanup", "stop-command", "bounded-runtime"];
  if (command.includes("--epic") || command.includes("execute-plan") || command.includes("--guided") || command.includes("--manual") || command.includes("--fresh-context")) return [...base, "readiness-gate", "stop-command", "bounded-runtime"];
  if (command.includes("--atomize") || command.includes("--create-epic")) return [...base, "plan-review-pass-required"];
  if (command.includes("--review")) return [...base, "review-evidence-required"];
  return base;
}

function stopConditionForCommand(command) {
  if (command.includes("--review")) return "ask-before-plan-review";
  if (command.includes("--atomize") || command.includes("--create-epic")) return "ask-before-work-item-write";
  if (command.includes("--worktree")) return "ask-before-worktree-run";
  if (command.includes("--epic") || command.includes("execute-plan") || command.includes("--guided") || command.includes("--manual") || command.includes("--fresh-context")) return "ask-before-execution";
  if (command.includes("plan")) return "ask-before-plan";
  return "ask-before-next-step";
}
