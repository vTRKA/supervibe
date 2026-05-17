import { routeTriggerRequest } from "./supervibe-trigger-router.mjs";
import {
  copyCommandAgentContract,
  getCommandAgentProfile,
} from "./command-agent-orchestration-contract.mjs";
import {
  formatNextStepBlock,
  getNextWorkflowStep,
  normalizeWorkflowPhase,
  parseNextStepBlock,
  resolveWorkflowCommand,
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
  "go on",
  "keep going",
  "next",
  "да",
  "ок",
  "переходим",
  "продолжи",
  "продолжай",
  "продолжай работу",
  "давай дальше",
  "ок продолжай",
  "дальше",
  "го",
];

const WORKFLOW_CONTINUATION_PHRASES = Object.freeze([
  "continue",
  "go on",
  "keep going",
  "next",
  "continue work",
  "resume loop",
  "continue task graph",
  "продолжи",
  "продолжай",
  "продолжи работу",
  "продолжай работу",
  "давай дальше",
  "ок продолжай",
  "дальше",
  "следующий этап",
]);

const CONTINUATION_PREFIXES = Object.freeze([
  "continue",
  "go on",
  "keep going",
  "next",
  "resume",
  "продолжи",
  "продолжай",
  "давай дальше",
  "ок продолжай",
  "дальше",
]);

const CONTINUATION_FALLBACK_EXCLUSIONS = Object.freeze([
  "design",
  "prototype",
  "mockup",
  "figma",
  "дизайн",
  "прототип",
  "макет",
]);

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

const PLAN_REVISION_PHRASES = [
  "change plan",
  "revise plan",
  "edit plan",
  "update plan",
  "modify plan",
  "change scope",
  "revise scope",
  "поменяй план",
  "поменять план",
  "измени план",
  "изменить план",
  "переделай план",
  "перепиши план",
  "обнови план",
  "исправь план",
  "измени scope",
  "изменить scope",
];

const PLAN_CONTINUATION_WITHOUT_REVIEW_PHRASES = [
  "loop",
  "supervibe-loop",
  "/supervibe-loop",
  "continue to loop",
  "start loop",
  "go to loop",
  "next stage",
  "следующий этап",
  "дальше к loop",
  "запусти loop",
  "запусти луп",
  "луп",
  "цикл",
  ...PLAN_EXECUTION_PHRASES,
  ...ATOMIZE_PHRASES,
  ...WORKTREE_PHRASES,
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

  const topicDrift = routeTopicDriftFromRecentHandoff(request, recentAssistantOutput, locale);
  if (topicDrift) return applySafetyState(topicDrift, { dirtyGitState, artifacts });

  const upstream = routeUpstreamArtifactRequest({ text, locale, artifacts });
  if (upstream) return applySafetyState(upstream, { dirtyGitState, artifacts });

  const contextual = routeFromWorkflowContext({ text, locale, lastCompletedPhase, artifacts, dirtyGitState });
  if (contextual) return applySafetyState(contextual, { dirtyGitState, artifacts });

  const triggerRoute = routeTriggerRequest(request, {
    artifacts,
    pluginRoot: options.pluginRoot,
    projectRoot: options.projectRoot,
    commandCatalog: options.commandCatalog,
  });
  if (triggerRoute.intent !== "unknown") {
    return applySafetyState(fromTriggerRoute(triggerRoute, { locale }), { dirtyGitState, artifacts });
  }

  if (isVagueFeatureRequest(text)) {
    return applySafetyState(fromWorkflowStep("intake", {
      intent: "feature_brainstorm",
      locale,
      confidence: 0.83,
      reason: "Vague feature request requires brainstorm before plan or execution.",
      source: "vague-feature-rule",
    }), { dirtyGitState, artifacts });
  }

  return normalizeRouteQuestionPayload({
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
    questionChoices: buildWorkflowQuestionChoices({
      locale,
      kind: "unknown",
      phase: "diagnostics",
      artifact: "trigger request",
      command: "/supervibe --diagnose-trigger",
      skill: "supervibe:trigger-diagnostics",
    }),
    questionEvidence: [
      "No workflow, trigger corpus, or vague-feature match.",
      `incomingRequest=${sanitizeRouteText(request, 90)}`,
    ],
    questionSpecialist: "supervibe:trigger-diagnostics",
    questionArtifactImpact: workflowArtifactImpact({
      locale,
      command: "/supervibe --diagnose-trigger",
      artifact: "trigger request",
    }),
  });
}

export function formatWorkflowRoute(route) {
  const blockers = route.safetyBlockers?.length ? ` blockers=${route.safetyBlockers.join(",")}` : "";
  const artifacts = route.missingArtifacts?.length ? ` missing=${route.missingArtifacts.join(",")}` : "";
  const lines = [
    `WORKFLOW_ROUTE intent=${route.intent} command=${route.command} skill=${route.skill} confidence=${route.confidence}${blockers}${artifacts}`,
    `Reason: ${route.reason}`,
    `Next: ${route.nextPromptText}`,
  ];
  const choices = route.questionChoices || route.nextQuestionChoices || [];
  if (choices.length > 0) {
    lines.push("Choices:");
    for (const choice of choices) {
      const recommended = choice.recommended ? " recommended" : "";
      lines.push(`- ${choice.label}${recommended} - ${choice.tradeoff || choice.description}`);
    }
  }
  return lines.join("\n");
}

export function isWorkflowContinuationRequest(value) {
  const text = normalize(value);
  if (!text || isExplicitStopOrPause(text)) return false;
  return containsAny(text, WORKFLOW_CONTINUATION_PHRASES)
    || CONTINUATION_PREFIXES.some((phrase) => text.startsWith(normalize(phrase)));
}

export function isBareWorkflowContinuationRequest(value) {
  const text = normalize(value);
  if (!isWorkflowContinuationRequest(text)) return false;
  if (containsAny(text, CONTINUATION_FALLBACK_EXCLUSIONS)) return false;
  if (WORKFLOW_CONTINUATION_PHRASES.some((phrase) => text === normalize(phrase))) return true;
  return CONTINUATION_PREFIXES.some((phrase) => text.startsWith(normalize(phrase)));
}

function routeFromRecentHandoff(request, recentAssistantOutput, locale) {
  if (!isAffirmative(request)) return null;
  const parsed = parseNextStepBlock(recentAssistantOutput);
  if (!parsed?.nextCommand) return null;
  const question = parsed.question ?? (locale === "ru" ? "Шаг 1/1: продолжить с подтвержденной следующей командой?" : "Step 1/1: continue with the confirmed next command?");
  const questionChoices = buildWorkflowQuestionChoices({
    locale,
    kind: "handoff-affirmed",
    phase: parsed.nextPhase ?? "workflow-continuation",
    artifact: parsed.artifact,
    command: parsed.nextCommand,
    skill: parsed.nextSkill ?? "supervibe:workflow-router",
  });

  return {
    intent: intentForCommand(parsed.nextCommand),
    phase: parsed.nextPhase ?? "workflow-continuation",
    command: parsed.nextCommand,
    skill: parsed.nextSkill ?? "supervibe:workflow-router",
    confidence: 0.97,
    mutationRisk: mutationRiskForCommand(parsed.nextCommand),
    source: "recent-handoff",
    reason: "User affirmed the previous NEXT_STEP_HANDOFF block.",
    nextPromptText: question,
    nextQuestion: question,
    stopCondition: parsed.stopCondition ?? "ask-before-next-step",
    requiredSafety: safetyForCommand(parsed.nextCommand),
    missingArtifacts: [],
    safetyBlockers: [],
    alternatives: [],
    questionChoices,
    questionEvidence: [
      `NEXT_STEP_HANDOFF phase=${parsed.currentPhase ?? parsed.nextPhase ?? "workflow"}`,
      `artifact=${parsed.artifact ?? "workflow artifact"}`,
    ],
    questionSpecialist: parsed.nextSkill ?? "supervibe:workflow-router",
    questionArtifactImpact: workflowArtifactImpact({ locale, command: parsed.nextCommand, artifact: parsed.artifact }),
    handoff: parsed,
  };
}

function routeTopicDriftFromRecentHandoff(request, recentAssistantOutput, locale) {
  const parsed = parseNextStepBlock(recentAssistantOutput);
  if (!parsed?.nextCommand) return null;
  const text = normalize(request);
  if (!text || isAffirmative(request)) return null;
  if (isExplicitStopOrPause(text)) return null;

  const question = locale === "ru"
    ? `Шаг 1/1: есть незавершенный этап "${parsed.currentPhase ?? "workflow"}" (${parsed.artifact ?? "artifact"}). Продолжить его, пропустить/делегировать безопасные решения агенту, переключиться на новую тему или остановить текущий этап?`
    : `Step 1/1: there is an unfinished "${parsed.currentPhase ?? "workflow"}" stage (${parsed.artifact ?? "artifact"}). Continue it, skip/delegate safe decisions to the agent, switch to the new topic, or stop the current stage?`;

  return {
    intent: "workflow_resume_choice",
    phase: parsed.currentPhase ?? "workflow-continuation",
    command: parsed.nextCommand,
    skill: parsed.nextSkill ?? "supervibe:workflow-router",
    confidence: 0.94,
    mutationRisk: "none",
    source: "recent-handoff-topic-drift",
    reason: "A saved NEXT_STEP_HANDOFF exists, but the user sent a different request. Ask before continuing, delegating, switching, or stopping.",
    nextPromptText: question,
    nextQuestion: question,
    stopCondition: "ask-before-topic-switch",
    requiredSafety: ["no-silent-workflow-drop", "record-skip-or-delegation", "final-gates-cannot-be-delegated"],
    missingArtifacts: [],
    safetyBlockers: [],
    questionChoices: buildTopicDriftChoices({ locale, parsed }),
    nextQuestionChoices: buildTopicDriftChoices({ locale, parsed }),
    questionEvidence: [
      `Saved handoff currentPhase=${parsed.currentPhase ?? "workflow"}`,
      `incomingRequest=${sanitizeRouteText(request, 90)}`,
      `artifact=${parsed.artifact ?? "workflow artifact"}`,
    ],
    questionSpecialist: parsed.nextSkill ?? "supervibe:workflow-router",
    questionArtifactImpact: workflowArtifactImpact({ locale, command: parsed.nextCommand, artifact: parsed.artifact }),
    alternatives: [
      { id: "continue-current", command: parsed.nextCommand, skill: parsed.nextSkill ?? "supervibe:workflow-router" },
      { id: "delegate-safe-decisions", command: parsed.nextCommand, skill: parsed.nextSkill ?? "supervibe:workflow-router" },
      { id: "pause-and-switch", command: null, skill: "supervibe:trigger-diagnostics" },
      { id: "stop-archive-current", command: null, skill: "supervibe:workflow-router" },
    ],
    handoff: parsed,
  };
}

function routeUpstreamArtifactRequest({ text, locale, artifacts }) {
  if (looksLikeSpecBeforePlanOrExecution(text)) {
    return fromWorkflowStep("intake", {
      intent: "feature_brainstorm",
      locale,
      confidence: 0.91,
      reason: "Spec or requirements request appears before plan or implementation; route upstream before execution.",
      source: "upstream-artifact-precedence",
      command: "/supervibe-brainstorm",
      skill: "supervibe:brainstorming",
      stopCondition: "ask-before-brainstorm",
      question: locale === "ru"
        ? "\u0428\u0430\u0433 1/1: \u0441\u043d\u0430\u0447\u0430\u043b\u0430 \u0441\u043e\u0431\u0440\u0430\u0442\u044c \u0442\u0440\u0435\u0431\u043e\u0432\u0430\u043d\u0438\u044f \u043f\u0435\u0440\u0435\u0434 \u043f\u043b\u0430\u043d\u043e\u043c \u0438 \u0440\u0435\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u0435\u0439?"
        : "Step 1/1: capture requirements before planning or implementation?",
    });
  }

  if (!artifacts.planReviewPassed && looksLikePlanOnlyReviewGate(text)) {
    return fromWorkflowStep("plan", {
      intent: "plan_review",
      locale,
      confidence: 0.94,
      reason: "Plan-only validation or reviewer request routes to the optional strict plan review gate before execution.",
      source: "plan-only-review-gate",
      command: "/supervibe-plan --review",
      skill: "supervibe:requesting-code-review",
      stopCondition: "ask-before-plan-review",
    });
  }

  if (!hasPlanApprovalForAtomization(artifacts) && looksLikePlanBeforeExecution(text)) {
    if (hasPlanArtifact(artifacts)) {
      return fromWorkflowStep("plan", {
        intent: "atomize_plan",
        locale,
        confidence: 0.94,
        reason: "Execution request with an existing plan should create the work graph from the user-approved loop-ready plan before dispatch.",
        source: "plan-approval-gate",
      });
    }
    return fromWorkflowStep("brainstorm", {
      intent: "brainstorm_to_plan",
      locale,
      confidence: 0.9,
      reason: "Plan and implementation were requested together; write or confirm the loop-ready plan before graph creation and execution.",
      source: "upstream-artifact-precedence",
      command: "/supervibe-plan --loop-ready",
      skill: "supervibe:writing-plans",
      stopCondition: "ask-before-plan",
      question: locale === "ru"
        ? "\u0428\u0430\u0433 1/1: \u0441\u043d\u0430\u0447\u0430\u043b\u0430 \u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u0438\u0442\u044c loop-ready \u043f\u043b\u0430\u043d \u043f\u0435\u0440\u0435\u0434 \u0441\u043e\u0437\u0434\u0430\u043d\u0438\u0435\u043c \u0433\u0440\u0430\u0444\u0430?"
        : "Step 1/1: prepare the loop-ready plan before graph creation?",
    });
  }

  return null;
}

function hasPlanArtifact(artifacts = {}) {
  return Boolean(artifacts.plan || artifacts.planPath || artifacts.planContent || artifacts.implementationPlan || artifacts.reviewedPlanPath);
}

function hasPlanApprovalForAtomization(artifacts = {}) {
  return Boolean(artifacts.userApprovedPlan || artifacts.approvedPlan || artifacts.loopReadyPlan || artifacts.planReviewPassed || artifacts.reviewedPlan);
}

function looksLikeSpecBeforePlanOrExecution(text) {
  const hasSpec = containsAny(text, [
    "spec",
    "specification",
    "requirements",
    "prd",
    "brief",
    "\u0441\u043f\u0435\u043a",
    "\u0441\u043f\u0435\u0446\u0438\u0444\u0438\u043a\u0430\u0446\u0438\u044f",
    "\u0442\u0440\u0435\u0431\u043e\u0432\u0430\u043d\u0438\u044f",
    "\u0442\u0437",
  ]) || containsStemAny(text, [
    "\u0441\u043f\u0435\u0446\u0438\u0444\u0438\u043a",
    "\u0442\u0440\u0435\u0431\u043e\u0432\u0430\u043d",
  ]);
  const hasDownstream = containsAny(text, [
    "plan",
    "implementation",
    "implement",
    "execute",
    "start implementation",
    "before implementation",
    "\u043f\u043b\u0430\u043d",
    "\u0440\u0435\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u044f",
    "\u0440\u0435\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u044e",
    "\u043d\u0430\u0447\u043d\u0438",
  ]) || containsStemAny(text, [
    "\u0440\u0435\u0430\u043b\u0438\u0437",
    "\u0438\u0441\u043f\u043e\u043b\u043d",
    "\u043d\u0430\u0447\u043d",
  ]);
  return hasSpec && hasDownstream;
}

function looksLikePlanBeforeExecution(text) {
  const hasPlan = containsAny(text, ["plan", "implementation plan", "\u043f\u043b\u0430\u043d"]);
  const hasExecution = containsAny(text, [
    "execute",
    "implementation",
    "implement",
    "start work",
    "start implementation",
    "begin work",
    "run it",
    "\u0441\u0442\u0430\u0440\u0442",
    "\u043d\u0430\u0447\u043d\u0438",
    "\u043d\u0430\u0447\u0430\u0442\u044c",
    "\u0437\u0430\u043f\u0443\u0441\u0442\u0438",
    "\u0440\u0435\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u044f",
  ]) || containsStemAny(text, [
    "\u0440\u0435\u0430\u043b\u0438\u0437",
    "\u0438\u0441\u043f\u043e\u043b\u043d",
    "\u043d\u0430\u0447\u043d",
  ]);
  const hasReviewedPlan = containsAny(text, [
    "reviewed plan",
    "plan review passed",
    "active graph",
    "\u043e\u0434\u043e\u0431\u0440\u0435\u043d\u043d\u044b\u0439 \u043f\u043b\u0430\u043d",
    "\u043f\u043b\u0430\u043d \u043f\u0440\u043e\u0448\u0435\u043b \u0440\u0435\u0432\u044c\u044e",
  ]);
  return hasPlan && hasExecution && !hasReviewedPlan;
}

function looksLikePlanOnlyReviewGate(text) {
  const planOnly = containsAny(text, [
    "only the plan for now",
    "only plan for now",
    "plan only",
    "only the plan",
    "for now only the plan",
    "for now plan only",
    "\u0442\u043e\u043b\u044c\u043a\u043e \u043f\u043b\u0430\u043d",
    "\u043f\u043e\u043a\u0430 \u0442\u043e\u043b\u044c\u043a\u043e \u043f\u043b\u0430\u043d",
  ]);
  const asksReview = containsAny(text, [
    "review",
    "reviewer",
    "reviewers",
    "plan review",
    "validate",
    "validation",
    "validator",
    "validators",
    "\u0440\u0435\u0432\u044c\u044e",
    "\u043f\u0440\u043e\u0432\u0435\u0440\u044c",
    "\u043f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c",
  ]) || containsStemAny(text, [
    "\u0432\u0430\u043b\u0438\u0434\u0430\u0446",
    "\u0432\u0430\u043b\u0438\u0434\u0438\u0440",
    "\u0440\u0435\u0432\u044c\u044e\u0435\u0440",
    "\u043f\u0440\u043e\u0432\u0435\u0440",
  ]);
  return planOnly && asksReview;
}

function routeFromWorkflowContext({ text, locale, lastCompletedPhase, artifacts }) {
  const phase = normalizeWorkflowPhase(lastCompletedPhase);
  const affirmative = containsAffirmativePhrase(text);

  if (phase === "plan" && containsAny(text, PLAN_REVISION_PHRASES)) {
    return fromWorkflowStep("plan", {
      intent: "plan_revision",
      locale,
      confidence: 0.92,
      reason: "User asked to revise the implementation plan before graph creation or execution.",
      source: "plan-revision-gate",
      command: "/supervibe-plan",
      skill: "supervibe:writing-plans",
      stopCondition: "ask-before-plan-revision",
      question: locale === "ru"
        ? "\u0428\u0430\u0433 1/1: \u0438\u0437\u043c\u0435\u043d\u0438\u0442\u044c \u043f\u043b\u0430\u043d \u043f\u0435\u0440\u0435\u0434 \u0441\u043e\u0437\u0434\u0430\u043d\u0438\u0435\u043c work graph?"
        : "Step 1/1: revise the plan before creating the work graph?",
    });
  }

  if (phase === "plan" && !hasPlanApprovalForAtomization(artifacts) && containsAny(text, PLAN_CONTINUATION_WITHOUT_REVIEW_PHRASES)) {
    return fromWorkflowStep("plan", {
      intent: "atomize_plan",
      locale,
      confidence: 0.93,
      reason: "Plan continuation, loop, atomization, worktree, or execution needs a user-approved loop-ready plan and graph creation first.",
      source: "plan-approval-gate",
    });
  }

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
    if (artifacts.plan && !hasPlanApprovalForAtomization(artifacts)) {
      return fromWorkflowStep("plan", {
        intent: "atomize_plan",
        locale,
        confidence: 0.93,
        reason: "Worktree execution needs a user-approved loop-ready plan to be atomized first.",
        source: "plan-approval-gate",
      });
    }
    if (hasPlanApprovalForAtomization(artifacts) && !artifacts.workItemsReady && !artifacts.epicId && !artifacts.epic) {
      return fromWorkflowStep("plan", {
        intent: "atomize_plan",
        locale,
        confidence: 0.91,
        reason: "Worktree execution requires the approved loop-ready plan to be atomized into an epic and work-item graph first.",
        source: "atomization-gate",
        artifactOverride: artifacts.planPath ?? artifacts.reviewedPlanPath ?? undefined,
      });
    }
    return fromWorkflowStep("worktree-setup", {
      intent: "worktree_autonomous_run",
      locale,
      confidence: 0.9,
      reason: "Request mentions isolated worktree execution.",
      source: "worktree-rule",
      command: "/supervibe-loop --epic --worktree",
      skill: "supervibe:using-git-worktrees",
      question: locale === "ru"
        ? "Шаг 1/1: запустить provider-safe preflight перед worktree/autonomous run?"
        : "Step 1/1: run provider-safe preflight before the worktree/autonomous run?",
      artifactOverride: artifacts.epicId ?? artifacts.epic ?? undefined,
    });
  }

  if (containsAny(text, PLAN_EXECUTION_PHRASES)) {
    if (!hasPlanApprovalForAtomization(artifacts)) {
      return fromWorkflowStep("plan", {
        intent: "atomize_plan",
        locale,
        confidence: 0.92,
        reason: "Execution request needs a user-approved loop-ready plan and graph creation first.",
        source: "plan-approval-gate",
      });
    }
    if (!artifacts.workItemsReady && !artifacts.epicId && !artifacts.epic) {
      return fromWorkflowStep("plan", {
        intent: "atomize_plan",
        locale,
        confidence: 0.9,
        reason: "Execution request has an approved loop-ready plan but no atomic work items or epic.",
        source: "atomization-gate",
        artifactOverride: artifacts.planPath ?? artifacts.reviewedPlanPath ?? undefined,
      });
    }
    return fromWorkflowStep("work-item-atomization", {
      intent: "single_session_epic_run",
      locale,
      confidence: 0.88,
      reason: "Approved and atomized work can enter goal-until-complete current-session execution; worktree is only used when explicitly requested.",
      source: "execution-rule",
    });
  }

  if (containsAny(text, ATOMIZE_PHRASES)) {
    if (!hasPlanApprovalForAtomization(artifacts)) {
      return fromWorkflowStep("plan", {
        intent: "atomize_plan",
        locale,
        confidence: 0.9,
        reason: "Atomization needs a user-approved loop-ready plan.",
        source: "plan-approval-gate",
      });
    }
    return fromWorkflowStep("plan", {
      intent: text.includes("epic") || text.includes("эпик") ? "create_epic" : "atomize_plan",
      locale,
      confidence: 0.9,
      reason: "Approved loop-ready plan can be atomized into durable work items.",
      source: "atomize-rule",
      artifactOverride: artifacts.planPath ?? artifacts.reviewedPlanPath ?? undefined,
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
      reason: "User explicitly asked for plan review before atomization or execution.",
      source: "phase-artifact-rule",
      command: "/supervibe-plan --review",
      skill: "supervibe:requesting-code-review",
      stopCondition: "ask-before-plan-review",
    });
  }

  return null;
}

function fromTriggerRoute(route, options = {}) {
  const agentProfile = route.agentProfile || commandAgentProfileFor(route.command);
  return {
    intent: route.intent,
    phase: route.phase,
    command: route.command,
    commandContext: route.commandContext ?? null,
    commandArgs: route.commandArgs ?? null,
    skill: route.skill,
    confidence: route.confidence,
    mutationRisk: route.mutationRisk,
    source: "trigger-router",
    reason: route.reason,
    nextPromptText: route.nextQuestion,
    nextQuestion: route.nextQuestion,
    stopCondition: route.stopCondition ?? stopConditionForCommand(route.command),
    requiredSafety: route.requiredSafety ?? [],
    missingArtifacts: route.missingArtifacts ?? [],
    safetyBlockers: route.safetyBlockers ?? [],
    alternatives: route.alternatives ?? [],
    questionChoices: route.questionChoices ?? [],
    questionEvidence: route.questionEvidence ?? route.routingEvidence ?? [],
    questionSpecialist: route.questionSpecialist ?? route.agentProfile?.ownerAgentId ?? route.skill ?? "supervibe-orchestrator",
    questionArtifactImpact: route.questionArtifactImpact,
    agentContract: route.agentContract || (agentProfile ? copyCommandAgentContract() : null),
    agentProfile,
    hardStop: route.hardStop === true,
    doNotSearchProject: route.doNotSearchProject === true,
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
  const command = resolveWorkflowCommand(options.command ?? edge.command, options.artifactOverride ?? edge.artifactKind);
  const agentProfile = commandAgentProfileFor(command);
  const artifact = options.artifactOverride ?? edge.artifactKind;
  const questionChoices = buildWorkflowQuestionChoices({
    locale,
    kind: "workflow-step",
    phase,
    artifact,
    command,
    skill: options.skill ?? edge.skill,
  });
  return {
    intent: options.intent ?? `continue_${edge.nextPhase}`,
    phase: edge.phase,
    command,
    skill: options.skill ?? edge.skill,
    confidence: options.confidence ?? 0.9,
    mutationRisk: mutationRiskForCommand(command),
    source: options.source ?? "workflow-step",
    reason: options.reason ?? edge.why,
    nextPromptText,
    nextQuestion: nextPromptText,
    stopCondition: options.stopCondition ?? edge.stopCondition,
    requiredSafety: safetyForCommand(command),
    missingArtifacts: [],
    safetyBlockers: [],
    alternatives: [],
    questionChoices,
    questionEvidence: [
      `phase=${phase}`,
      `artifact=${artifact}`,
      options.reason ?? edge.why,
    ],
    questionSpecialist: options.skill ?? edge.skill,
    questionArtifactImpact: workflowArtifactImpact({ locale, command, artifact }),
    agentContract: agentProfile ? copyCommandAgentContract() : null,
    agentProfile,
    handoffBlock: formatNextStepBlock({
      phase,
      artifactPath: options.artifactOverride,
      locale,
      command,
      skill: options.skill ?? edge.skill,
      stopCondition: options.stopCondition,
      question: nextPromptText,
      why: options.reason ?? edge.why,
    }),
  };
}

function buildTopicDriftChoices({ locale = "en", parsed = {} } = {}) {
  const artifact = parsed.artifact ?? (locale === "ru" ? "текущий артефакт" : "current artifact");
  if (locale === "ru") {
    return [
      {
        id: "continue-current",
        label: `Продолжить ${artifact}`,
        tradeoff: `Запускает ${parsed.nextCommand}; новая тема остается в очереди.`,
        recommended: true,
      },
      {
        id: "delegate-safe-decisions",
        label: `Делегировать безопасные решения по ${artifact}`,
        tradeoff: "Разрешает агенту закрыть обратимые шаги, но финальные gates останутся ручными.",
      },
      {
        id: "pause-and-switch",
        label: "Поставить текущий этап на паузу и сменить тему",
        tradeoff: "Сохраняет handoff, затем маршрутизирует новый запрос без потери состояния.",
      },
      {
        id: "stop-archive-current",
        label: `Остановить и заархивировать ${artifact}`,
        tradeoff: "Закрывает текущий этап без скрытого продолжения и фиксирует причину остановки.",
      },
    ];
  }
  return [
    {
      id: "continue-current",
      label: `Continue ${artifact}`,
      tradeoff: `Runs ${parsed.nextCommand}; the new topic stays queued.`,
      recommended: true,
    },
    {
      id: "delegate-safe-decisions",
      label: `Delegate safe decisions for ${artifact}`,
      tradeoff: "Lets the agent close reversible steps, while final gates stay manual.",
    },
    {
      id: "pause-and-switch",
      label: "Pause current stage and switch topic",
      tradeoff: "Keeps the handoff, then routes the new request without losing state.",
    },
    {
      id: "stop-archive-current",
      label: `Stop and archive ${artifact}`,
      tradeoff: "Closes the current stage without hidden continuation and records the stop reason.",
    },
  ];
}

function buildWorkflowQuestionChoices({ locale = "en", kind = "workflow-step", phase = "workflow", artifact = "", command = "", skill = "" } = {}) {
  const subject = workflowSubject({ locale, kind, phase, artifact });
  const commandText = command || "the next command";
  const skillText = skill || "the selected skill";
  if (kind === "unknown") {
    return locale === "ru"
      ? [
        { id: "show-diagnostics", label: "Показать диагностику триггера", tradeoff: "Объяснит, почему запрос не сматчился, без поиска по проекту.", recommended: true },
        { id: "list-nearest-routes", label: "Показать ближайшие маршруты", tradeoff: "Даст безопасные варианты команд без запуска." },
        { id: "stop", label: "Остановиться без маршрутизации", tradeoff: "Не запускает команду и сохраняет текущий контекст." },
      ]
      : [
        { id: "show-diagnostics", label: "Show trigger diagnostics", tradeoff: "Explains why the request did not match, without a repo-wide search.", recommended: true },
        { id: "list-nearest-routes", label: "Show nearest routes", tradeoff: "Returns safe command options without running them." },
        { id: "stop", label: "Stop without routing", tradeoff: "Runs no command and keeps the current context." },
      ];
  }
  if (locale === "ru") {
    return [
      {
        id: "continue",
        label: `Продолжить ${subject}`,
        tradeoff: `Запускает ${commandText} через ${skillText}; safety gates остаются активными.`,
        recommended: true,
      },
      {
        id: "revise-scope",
        label: `Изменить scope для ${subject}`,
        tradeoff: "Позволяет убрать, переписать, разделить или отложить пункты перед следующим gate.",
      },
      {
        id: "exclude-or-defer",
        label: `Исключить или отложить пункты из ${subject}`,
        tradeoff: "Фиксирует out-of-scope work, чтобы execution не включил его молча.",
      },
      {
        id: "inspect-readiness",
        label: `Сначала проверить готовность ${subject}`,
        tradeoff: "Покажет prerequisites, blockers и evidence без мутаций.",
      },
      {
        id: "stop",
        label: `Сохранить ${subject} и остановиться`,
        tradeoff: "Фиксирует handoff и не продолжает workflow скрыто.",
      },
    ];
  }
  return [
    {
      id: "continue",
      label: `Continue ${subject}`,
      tradeoff: `Runs ${commandText} through ${skillText}; safety gates remain active.`,
      recommended: true,
    },
    {
      id: "revise-scope",
      label: `Revise scope for ${subject}`,
      tradeoff: "Remove, rewrite, split, or defer items before the next gate.",
    },
    {
      id: "exclude-or-defer",
      label: `Exclude or defer items from ${subject}`,
      tradeoff: "Records out-of-scope work so execution cannot include it silently.",
    },
    {
      id: "inspect-readiness",
      label: `Inspect readiness for ${subject} first`,
      tradeoff: "Shows prerequisites, blockers, and evidence without mutations.",
    },
    {
      id: "stop",
      label: `Save ${subject} and stop`,
      tradeoff: "Records the handoff and does not continue the workflow silently.",
    },
  ];
}

function workflowSubject({ locale = "en", kind = "workflow-step", phase = "workflow", artifact = "" } = {}) {
  const artifactText = sanitizeRouteText(artifact || phase || "workflow", 72);
  if (locale === "ru") {
    if (kind === "handoff-affirmed") return `подтвержденный этап ${artifactText}`;
    if (phase === "plan" || phase === "plan-review") return `плановый этап ${artifactText}`;
    if (phase === "worktree-setup" || phase === "work-item-atomization") return `agent-loop этап ${artifactText}`;
    return `этап ${artifactText}`;
  }
  if (kind === "handoff-affirmed") return `the confirmed ${artifactText} stage`;
  if (phase === "plan" || phase === "plan-review") return `the planning ${artifactText} stage`;
  if (phase === "worktree-setup" || phase === "work-item-atomization") return `the agent-loop ${artifactText} stage`;
  return `the ${artifactText} stage`;
}

function workflowArtifactImpact({ locale = "en", command = "", artifact = "" } = {}) {
  const artifactText = sanitizeRouteText(artifact || "workflow artifact", 80);
  const commandText = command || "the next command";
  if (locale === "ru") {
    return `Ответ решает, запускать ли ${commandText} для ${artifactText}, сначала показать readiness или остановить handoff.`;
  }
  return `The answer decides whether ${commandText} runs for ${artifactText}, readiness is shown first, or the handoff stops.`;
}

function normalizeRouteQuestionPayload(route = {}) {
  const choices = normalizeRouteChoices(route.questionChoices || route.nextQuestionChoices || []);
  const prompt = route.nextQuestion || route.nextPromptText || "";
  const title = route.questionTitle || questionTitleForRoute(route);
  const reason = route.questionReason || route.reason || "";
  const agentWavePolicy = buildRouteAgentWavePolicy(route);
  const requiredSafety = uniqueRouteStrings([
    ...(route.requiredSafety || []),
    ...(agentWavePolicy.required ? ["ready-task-dispatch-required", "tests-deferred-until-release-gate"] : []),
  ]);
  const normalized = {
    ...route,
    requiredSafety,
    agentWavePolicy,
    requiresAgentWave: agentWavePolicy.required,
    parallelAgentDispatchRequired: agentWavePolicy.required,
    compactContinuationAgentDispatchRequired: agentWavePolicy.requiredAfterContextCompaction,
    simpleTaskAgentDispatchRequired: agentWavePolicy.requiredForSimpleTasks,
    questionTitle: title,
    questionReason: reason,
    questionChoices: choices,
    questionPayload: {
      title,
      prompt,
      reason,
      stage: route.phase || "workflow",
      nextCommand: route.command || null,
      nextSkill: route.skill || null,
      stopCondition: route.stopCondition || null,
      agentWavePolicy,
      choices,
    },
  };
  if (route.nextQuestionChoices) normalized.nextQuestionChoices = choices;
  return normalized;
}

function buildRouteAgentWavePolicy(route = {}) {
  const command = String(route.command || "").trim();
  const workflowLike = command.startsWith("/supervibe") && route.intent !== "unknown" && route.hardStop !== true;
  return {
    id: "ready-task-agent-dispatch",
    required: workflowLike,
    minParallelAgents: workflowLike ? 1 : 0,
    requiredAfterContextCompaction: false,
    requiredForSimpleTasks: false,
    launchTiming: "when-ready-work-exists",
    resumeMode: command.includes("--resume-dispatch") ? "resume-from-prime-context" : "route-owned-ready-task",
    testExecutionPolicy: "plan/graph/task tests and validators run only at final release gate",
  };
}

function uniqueRouteStrings(values = []) {
  return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))];
}

function normalizeRouteChoices(choices = []) {
  if (!Array.isArray(choices)) return [];
  return choices.map((choice, index) => {
    const source = choice && typeof choice === "object" && !Array.isArray(choice)
      ? choice
      : { label: String(choice || "") };
    const label = sanitizeRouteText(source.label || `Choice ${index + 1}`, 96);
    const id = String(source.id || slugifyRouteChoice(label) || `choice-${index + 1}`).trim();
    const description = sanitizeRouteText(source.description || source.tradeoff || "", 220);
    return {
      ...source,
      id,
      label,
      tradeoff: source.tradeoff || description,
      description,
    };
  });
}

function questionTitleForRoute(route = {}) {
  const phase = sanitizeRouteText(route.phase || "workflow", 40);
  const command = sanitizeRouteText(route.command || "next action", 56);
  if (route.intent === "workflow_resume_choice") return `Resolve saved ${phase} handoff`;
  if (route.intent === "unknown") return "Resolve Supervibe route";
  return `Confirm ${phase}: ${command}`;
}

function slugifyRouteChoice(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeRouteText(value, maxLength = 120) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function commandAgentProfileFor(command = "") {
  const value = String(command || "").trim();
  if (!value.startsWith("/supervibe")) return null;
  return getCommandAgentProfile(value.split(/\s+/)[0]);
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
  return normalizeRouteQuestionPayload({ ...route, safetyBlockers: [...new Set(safetyBlockers)] });
}

function phaseForRoute(route) {
  if (route.intent === "brainstorm_to_plan") return "brainstorm";
  if (route.intent === "plan_review" || route.intent === "execute_plan") return "plan";
  if (route.intent === "atomize_plan" || route.intent === "create_epic") return "plan";
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
  return containsAffirmativePhrase(text);
}

function containsAffirmativePhrase(value) {
  const text = normalize(value);
  if (!text) return false;
  return AFFIRMATIVE_PHRASES.some((phrase) => {
    const normalizedPhrase = normalize(phrase);
    if (!normalizedPhrase) return false;
    if (text === normalizedPhrase) return true;
    const escaped = escapeRegExp(normalizedPhrase);
    return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}([^\\p{L}\\p{N}_]|$)`, "u").test(text);
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isExplicitStopOrPause(text) {
  return containsAny(text, [
    "stop",
    "pause",
    "cancel",
    "archive",
    "стоп",
    "пауза",
    "останов",
    "отмени",
    "архив",
  ]);
}

function containsAny(text, phrases) {
  return phrases.some((phrase) => text.includes(normalize(phrase)));
}

function containsStemAny(text, stems) {
  return stems.some((stem) => text.includes(normalize(stem)));
}

function detectLocale(value) {
  return /[а-яё]/i.test(String(value)) ? "ru" : "en";
}

function normalize(value) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function intentForCommand(command) {
  const value = String(command || "");
  if (value.includes("--review")) return "plan_review";
  if (value.includes("--atomize")) return "atomize_plan";
  if (value.includes("--worktree")) return "worktree_autonomous_run";
  if (value.includes("--epic")) return "autonomous_epic_run";
  if (value.includes("execute-plan")) return "execute_plan";
  if (value.includes("brainstorm")) return "feature_brainstorm";
  if (value.includes("plan")) return "brainstorm_to_plan";
  return "workflow_continuation";
}

function mutationRiskForCommand(command) {
  const value = String(command || "");
  if (value.includes("--worktree")) return "creates-worktree";
  if (value.includes("--epic") || value.includes("execute-plan") || value.includes("--guided") || value.includes("--manual") || value.includes("--fresh-context")) return "executes-code";
  if (value.includes("--atomize") || value.includes("--create-epic")) return "writes-tracker";
  if (value.includes("plan") || value.includes("brainstorm")) return "writes-docs";
  return "none";
}

function safetyForCommand(command) {
  const value = String(command || "");
  const base = ["confirm-before-mutation", "no-provider-bypass", "no-hidden-background-work"];
  if (value.includes("--worktree")) return [...base, "worktree-cleanup", "stop-command", "goal-stop-condition"];
  if (value.includes("--epic") || value.includes("execute-plan") || value.includes("--guided") || value.includes("--manual") || value.includes("--fresh-context")) return [...base, "readiness-gate", "stop-command", "goal-stop-condition"];
  if (value.includes("--atomize") || value.includes("--create-epic")) return [...base, "user-approved-loop-ready-plan-required"];
  if (value.includes("--review")) return [...base, "review-evidence-required"];
  return base;
}

function stopConditionForCommand(command) {
  const value = String(command || "");
  if (!value) return "ask-before-command-resolution";
  if (value.includes("--review")) return "ask-before-plan-review";
  if (value.includes("--atomize") || value.includes("--create-epic")) return "ask-before-work-item-write";
  if (value.includes("--worktree")) return "ask-before-worktree-run";
  if (value.includes("--epic") || value.includes("execute-plan") || value.includes("--guided") || value.includes("--manual") || value.includes("--fresh-context")) return "ask-before-execution";
  if (value.includes("plan")) return "ask-before-plan";
  return "ask-before-next-step";
}
