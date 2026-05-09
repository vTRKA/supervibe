export const WORKFLOW_PHASES = Object.freeze([
  "intake",
  "brainstorm",
  "plan",
  "plan-review",
  "work-item-atomization",
  "worktree-setup",
  "execution",
  "wave-review",
  "finish",
]);

export const WORKFLOW_EDGES = Object.freeze({
  intake: {
    phase: "intake",
    nextPhase: "brainstorm",
    command: "/supervibe-brainstorm",
    skill: "supervibe:brainstorming",
    artifactKind: "intake-summary",
    stopCondition: "ask-before-brainstorm",
    questionEn: "Step 1/1: brainstorm the requirements before planning?",
    questionRu: "Шаг 1/1: провести брейншторм требований перед планом?",
    why: "Vague or creative work needs an approved spec before planning.",
  },
  brainstorm: {
    phase: "brainstorm",
    nextPhase: "plan",
    command: "/supervibe-plan --from-brainstorm",
    skill: "supervibe:writing-plans",
    artifactKind: "approved-spec-or-brainstorm-summary",
    stopCondition: "ask-before-plan",
    questionEn: "Step 1/1: write the implementation plan from the approved spec?",
    questionRu: "Шаг 1/1: написать план реализации по утвержденной спецификации?",
    why: "A brainstorm is not executable until it becomes a reviewed implementation plan.",
  },
  plan: {
    phase: "plan",
    nextPhase: "plan-review",
    command: "/supervibe-plan --review",
    skill: "supervibe:requesting-code-review",
    artifactKind: "implementation-plan",
    stopCondition: "ask-before-plan-review",
    questionEn: "Step 1/1: run the plan review loop before atomization or execution?",
    questionRu: "Шаг 1/1: запустить review loop по плану перед атомизацией или исполнением?",
    why: "Execution and atomization are blocked until the plan review gate passes.",
  },
  "plan-review": {
    phase: "plan-review",
    nextPhase: "work-item-atomization",
    command: "/supervibe-loop --atomize-plan <plan-path> --plan-review-passed",
    skill: "supervibe:writing-plans",
    artifactKind: "reviewed-plan",
    stopCondition: "ask-before-work-item-atomization",
    questionEn: "Step 1/1: atomize the reviewed plan into an epic and child work items?",
    questionRu: "Шаг 1/1: разбить план на атомарные задачи и epic?",
    why: "A reviewed plan can become durable, claimable work items.",
  },
  "work-item-atomization": {
    phase: "work-item-atomization",
    nextPhase: "execution",
    command: "/supervibe-loop --guided",
    skill: "supervibe:autonomous-agent-loop",
    artifactKind: "epic-with-atomic-work-items",
    stopCondition: "ask-before-single-session-run",
    questionEn: "Step 1/1: start provider-safe execution in the current session until the goals are complete?",
    questionRu: "Шаг 1/1: запустить provider-safe выполнение в текущей сессии до завершения целей?",
    why: "Single-session execution is the default path; worktree isolation is opt-in for parallel or risky work.",
  },
  "worktree-setup": {
    phase: "worktree-setup",
    nextPhase: "execution",
    command: "/supervibe-loop --epic --worktree",
    skill: "supervibe:autonomous-agent-loop",
    artifactKind: "approved-worktree-session",
    stopCondition: "ask-before-goal-run",
    questionEn: "Step 1/1: start a provider-safe run with stop/resume/status controls until the goals are complete?",
    questionRu: "Шаг 1/1: запустить provider-safe run со stop/resume/status до завершения целей?",
    why: "Autonomous execution must be visible, cancellable, policy-gated, and goal-bounded; explicit timeboxes are optional user budgets.",
  },
  execution: {
    phase: "execution",
    nextPhase: "wave-review",
    command: "/supervibe-plan --review",
    skill: "supervibe:requesting-code-review",
    artifactKind: "wave-output",
    stopCondition: "ask-before-wave-review",
    questionEn: "Step 1/1: prepare the review package for this execution wave?",
    questionRu: "Шаг 1/1: подготовить review package по выполненной волне?",
    why: "Each autonomous wave needs evidence review before more work is claimed.",
  },
  "wave-review": {
    phase: "wave-review",
    nextPhase: "finish",
    command: "/supervibe-loop --status",
    skill: "supervibe:autonomous-agent-loop",
    artifactKind: "reviewed-wave-output",
    stopCondition: "ask-before-final-status",
    questionEn: "Step 1/1: show final status and remaining ready/blocked work?",
    questionRu: "Шаг 1/1: показать финальный статус и ready/blocked задачи?",
    why: "The run should finish with a durable status report and explicit next action.",
  },
});

export const PHASE_ALIASES = Object.freeze({
  approved_spec: "brainstorm",
  approvedSpec: "brainstorm",
  brainstorm_done: "brainstorm",
  brainstormed: "brainstorm",
  planning: "plan",
  plan_written: "plan",
  plan_ready: "plan",
  plan_review: "plan-review",
  plan_reviewed: "plan-review",
  plan_review_passed: "plan-review",
  reviewed_plan: "plan-review",
  atomize: "work-item-atomization",
  atomized: "work-item-atomization",
  work_items: "work-item-atomization",
  work_item_atomization: "work-item-atomization",
  worktree: "worktree-setup",
  execution_preflight: "worktree-setup",
  run: "execution",
  executed: "execution",
  review: "wave-review",
});

export const PLAN_REVIEW_DIMENSIONS = Object.freeze([
  "spec-coverage",
  "mvp-value",
  "scope-safety",
  "architecture-fit",
  "data-storage-topology",
  "cache-queue-topology",
  "api-contract-readiness",
  "security-privacy",
  "observability-release-support",
  "dependency-graph",
  "task-size",
  "verification-coverage",
  "rollback-coverage",
  "parallel-safety",
  "worktree-suitability",
  "provider-policy",
  "convergence-decision",
]);

const BASE_PLAN_REVIEWERS = Object.freeze([
  "supervibe-orchestrator",
  "systems-analyst",
  "architect-reviewer",
  "quality-gate-reviewer",
]);

export const PLAN_REVIEW_RISK_SPECIALISTS = Object.freeze({
  database: Object.freeze(["db-reviewer", "data-modeler"]),
  cache: Object.freeze(["redis-architect"]),
  queue: Object.freeze(["queue-worker-architect", "job-scheduler-architect"]),
  security: Object.freeze(["security-auditor", "auth-architect"]),
  api: Object.freeze(["api-contract-reviewer", "api-designer"]),
  infrastructure: Object.freeze(["infrastructure-architect", "devops-sre", "observability-architect"]),
  frontend: Object.freeze(["accessibility-reviewer", "ui-polish-reviewer"]),
});

const PLAN_REVIEW_RISK_KEYWORDS = Object.freeze({
  database: Object.freeze(["database", "db", "postgres", "mysql", "sqlite", "mongo", "schema", "migration", "replication", "sharding", "partition"]),
  cache: Object.freeze(["cache", "redis", "session", "lock", "sentinel", "cache cluster"]),
  queue: Object.freeze(["queue", "job", "worker", "webhook", "kafka", "rabbit", "bull", "retry", "dead-letter", "dlq", "idempotency"]),
  security: Object.freeze(["security", "auth", "oauth", "jwt", "session", "permission", "pii", "secret", "token"]),
  api: Object.freeze(["api", "graphql", "rpc", "openapi", "webhook", "error envelope", "contract", "idempotency"]),
  infrastructure: Object.freeze(["infrastructure", "infra", "deploy", "release", "slo", "cluster", "replica", "cdn", "kubernetes", "observability"]),
  frontend: Object.freeze(["frontend", "ui", "browser", "mobile", "accessibility", "figma", "screen"]),
});

export function normalizeWorkflowPhase(phase) {
  const raw = String(phase ?? "").trim();
  if (!raw) return "";
  return PHASE_ALIASES[raw] ?? raw.replaceAll("_", "-");
}

export function getNextWorkflowStep(phase) {
  const normalized = normalizeWorkflowPhase(phase);
  const edge = WORKFLOW_EDGES[normalized];
  if (!edge) {
    throw new Error(`Unknown workflow phase: ${phase}`);
  }
  return cloneEdge(edge);
}

export function formatNextStepBlock(options = {}) {
  const phase = normalizeWorkflowPhase(options.phase);
  const baseEdge = options.edge ?? getNextWorkflowStep(phase);
  const edge = {
    ...baseEdge,
    nextPhase: options.nextPhase ?? baseEdge.nextPhase,
    command: options.nextCommand ?? options.command ?? baseEdge.command,
    skill: options.nextSkill ?? options.skill ?? baseEdge.skill,
    stopCondition: options.stopCondition ?? baseEdge.stopCondition,
  };
  const locale = options.locale === "ru" ? "ru" : "en";
  const question = locale === "ru" ? edge.questionRu : edge.questionEn;
  const artifact = options.artifactPath ?? edge.artifactKind;
  const nextCommand = resolveWorkflowCommand(options.command ?? edge.command, artifact);
  const choices = options.questionChoices ?? buildNextStepChoices({
    locale,
    artifact,
    command: nextCommand,
    skill: options.skill ?? edge.skill,
  });

  return [
    "NEXT_STEP_HANDOFF",
    `Current phase: ${edge.phase}`,
    `Artifact: ${artifact}`,
    `Next phase: ${edge.nextPhase}`,
    `Next command: ${nextCommand}`,
    `Next skill: ${options.skill ?? edge.skill}`,
    `Stop condition: ${edge.stopCondition}`,
    `Why: ${options.why ?? edge.why}`,
    `Question: ${options.question ?? question}`,
    "Choices:",
    ...choices.map((choice) => {
      const suffix = choice.recommended ? (locale === "ru" ? " (рекомендуется)" : " (recommended)") : "";
      return `- ${choice.label}${suffix} - ${choice.tradeoff}`;
    }),
    "END_NEXT_STEP_HANDOFF",
  ].join("\n");
}

export function parseNextStepBlock(output) {
  const text = String(output ?? "");
  const start = text.indexOf("NEXT_STEP_HANDOFF");
  if (start === -1) return null;
  const end = text.indexOf("END_NEXT_STEP_HANDOFF", start);
  const block = text.slice(start, end === -1 ? undefined : end).split(/\r?\n/);
  const parsed = {};
  for (const line of block) {
    const match = /^([^:]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    parsed[toCamelCase(match[1])] = match[2];
  }
  return Object.keys(parsed).length > 0 ? parsed : null;
}

export function assertNoSilentStop(options = {}) {
  const phase = normalizeWorkflowPhase(options.phase);
  const edge = options.edge ?? getNextWorkflowStep(phase);
  const text = String(options.output ?? "");
  const expectedArtifact = options.artifactPath ?? edge.artifactKind;
  const question = options.locale === "ru" ? edge.questionRu : edge.questionEn;
  const expectedCommand = resolveWorkflowCommand(options.command ?? edge.command, expectedArtifact);
  const required = [
    { code: "handoff-marker", value: "NEXT_STEP_HANDOFF" },
    { code: "artifact", value: expectedArtifact },
    { code: "next-phase", value: edge.nextPhase },
    { code: "command", value: expectedCommand },
    { code: "skill", value: edge.skill },
    { code: "stop-condition", value: edge.stopCondition },
    { code: "question", value: options.question ?? question },
  ];
  const missing = required.filter((item) => !text.includes(item.value));

  return {
    pass: missing.length === 0,
    phase,
    required,
    missing,
    edge: cloneEdge(edge),
  };
}

export function createPlanReviewPackage(options = {}) {
  const tasks = Array.isArray(options.tasks) ? options.tasks : [];
  const checks = options.checks ?? {};
  const specialistPlan = selectPlanReviewSpecialists({
    text: options.reviewText ?? [
      options.planPath,
      options.specPath,
      ...(Array.isArray(options.risks) ? options.risks : []),
    ].filter(Boolean).join(" "),
    tags: options.riskTags ?? [],
    explicit: options.reviewers ?? [],
  });
  const riskTriggers = {
    ...Object.fromEntries(specialistPlan.riskTriggers.map((trigger) => [trigger, true])),
    ...(options.riskTriggers ?? {}),
  };
  const context = {
    planPath: options.planPath,
    specPath: options.specPath,
    coverageMatrix: options.coverageMatrix,
    tasks,
    risks: Array.isArray(options.risks) ? options.risks : [],
    policy: options.policy ?? {},
    worktree: options.worktree ?? {},
    mvp: options.mvp ?? {},
    scope: options.scope ?? {},
    architecture: options.architecture ?? {},
    data: options.data ?? {},
    cacheQueue: options.cacheQueue ?? {},
    api: options.api ?? {},
    securityPrivacy: options.securityPrivacy ?? {},
    observabilityRelease: options.observabilityRelease ?? {},
    convergence: options.convergence ?? {},
    riskTriggers,
    checks,
  };
  const dimensions = PLAN_REVIEW_DIMENSIONS.map((id) => evaluatePlanReviewDimension(id, context));

  return {
    kind: "plan-review-package",
    planPath: options.planPath ?? null,
    specPath: options.specPath ?? null,
    tasks,
    risks: context.risks,
    reviewers: specialistPlan.reviewers,
    riskTriggers: specialistPlan.riskTriggers,
    dimensions,
    nextHandoff: getNextWorkflowStep("plan-review"),
  };
}

export function selectPlanReviewSpecialists(options = {}) {
  const text = [
    options.text,
    ...(Array.isArray(options.tags) ? options.tags : []),
  ].filter(Boolean).join(" ").toLowerCase();
  const explicit = Array.isArray(options.explicit) ? options.explicit : [];
  const riskTriggers = [];
  const reviewers = [...BASE_PLAN_REVIEWERS];

  for (const [risk, keywords] of Object.entries(PLAN_REVIEW_RISK_KEYWORDS)) {
    const tagged = Array.isArray(options.tags) && options.tags.some((tag) => String(tag).toLowerCase() === risk);
    if (tagged || keywords.some((keyword) => text.includes(keyword))) {
      riskTriggers.push(risk);
      reviewers.push(...(PLAN_REVIEW_RISK_SPECIALISTS[risk] ?? []));
    }
  }

  reviewers.push(...explicit.filter(hasText));
  return {
    baseReviewers: [...BASE_PLAN_REVIEWERS],
    riskTriggers: [...new Set(riskTriggers)],
    reviewers: [...new Set(reviewers)],
  };
}

export function evaluatePlanReviewPackage(planReviewPackage) {
  const dimensions = Array.isArray(planReviewPackage?.dimensions) ? planReviewPackage.dimensions : [];
  const failed = dimensions.filter((dimension) => !dimension.pass);
  const score = dimensions.length === 0 ? 0 : Number(((dimensions.length - failed.length) / dimensions.length * 10).toFixed(2));

  return {
    pass: failed.length === 0 && dimensions.length === PLAN_REVIEW_DIMENSIONS.length,
    score,
    passed: dimensions.length - failed.length,
    total: dimensions.length,
    failed,
    nextHandoff: failed.length === 0 ? cloneEdge(planReviewPackage.nextHandoff ?? WORKFLOW_EDGES["plan-review"]) : cloneEdge(WORKFLOW_EDGES.plan),
  };
}

function evaluatePlanReviewDimension(id, context) {
  if (Object.prototype.hasOwnProperty.call(context.checks, id)) {
    return dimension(id, Boolean(context.checks[id]), "Explicit check override.");
  }

  switch (id) {
    case "spec-coverage":
      return dimension(
        id,
        Boolean(context.planPath) && Boolean(context.specPath || context.coverageMatrix),
        "Plan links to a spec or coverage matrix.",
      );
    case "mvp-value":
      return dimension(
        id,
        context.mvp.smallestProductionSafeSlice === true
          && hasText(context.mvp.valueHypothesis)
          && context.tasks.every((task) => task.niceToHave !== true && task.optionalValue !== false),
        "Plan keeps the smallest production-safe slice and defers non-MVP work.",
      );
    case "scope-safety":
      return dimension(
        id,
        Array.isArray(context.scope.approved)
          && context.scope.approved.length > 0
          && Array.isArray(context.scope.deferred)
          && Array.isArray(context.scope.rejected)
          && context.tasks.every((task) => task.unapprovedScope !== true),
        "Approved, deferred, and rejected scope are explicit.",
      );
    case "architecture-fit":
      return dimension(
        id,
        hasText(context.architecture.style)
          && Array.isArray(context.architecture.boundaries)
          && context.architecture.boundaries.length > 0
          && context.architecture.unresolvedDecision !== true
          && (context.architecture.adrRequired !== true || context.architecture.adrPresent === true),
        "Architecture style, boundaries, and ADR need are reviewed.",
      );
    case "data-storage-topology":
      if (!isRiskTriggered(context, ["database"])) {
        return dimension(id, true, "No database or storage topology trigger.");
      }
      return dimension(
        id,
        context.data.topologyReviewed === true
          && context.data.migrationSafety !== false
          && context.data.backupRestore !== false,
        "Database topology, migration safety, backup, and restore posture are reviewed.",
      );
    case "cache-queue-topology":
      if (!isRiskTriggered(context, ["cache", "queue"])) {
        return dimension(id, true, "No cache or queue topology trigger.");
      }
      return dimension(
        id,
        context.cacheQueue.topologyReviewed === true
          && context.cacheQueue.retryPolicy !== false
          && context.cacheQueue.idempotency !== false
          && context.cacheQueue.deadLetter !== false,
        "Cache and queue topology, retry, idempotency, and dead-letter posture are reviewed.",
      );
    case "api-contract-readiness":
      if (!isRiskTriggered(context, ["api"])) {
        return dimension(id, true, "No API contract trigger.");
      }
      return dimension(
        id,
        context.api.contractReviewed === true
          && context.api.errorEnvelope !== false
          && context.api.compatibility !== false
          && context.api.idempotency !== false,
        "API contract, error envelope, compatibility, and idempotency are reviewed.",
      );
    case "security-privacy":
      return dimension(
        id,
        context.securityPrivacy.threatModelReviewed === true
          && context.securityPrivacy.piiBoundary !== false
          && context.securityPrivacy.secretsPolicy !== false
          && context.securityPrivacy.auditLogging !== false,
        "Threat model, PII boundary, secrets policy, and audit logging are reviewed.",
      );
    case "observability-release-support":
      return dimension(
        id,
        context.observabilityRelease.logs === true
          && context.observabilityRelease.metrics === true
          && context.observabilityRelease.alerts === true
          && context.observabilityRelease.rollback === true
          && context.observabilityRelease.release === true
          && context.observabilityRelease.support === true,
        "Logs, metrics, alerts, rollback, release, and support posture are reviewed.",
      );
    case "dependency-graph":
      return dimension(
        id,
        context.tasks.length > 0 && context.tasks.every((task) => Array.isArray(task.dependencies)) && !hasTaskCycle(context.tasks),
        "Every task declares dependencies and the graph has no cycle.",
      );
    case "task-size":
      return dimension(
        id,
        context.tasks.length > 0 && context.tasks.every((task) => task.atomic === true || Number(task.estimatedMinutes ?? 0) <= 30),
        "Tasks are atomic or <=30 minutes.",
      );
    case "verification-coverage":
      return dimension(
        id,
        context.tasks.length > 0 && context.tasks.every((task) => hasText(task.verification) || hasText(task.testCommand)),
        "Every task has a verification command or evidence requirement.",
      );
    case "rollback-coverage":
      return dimension(
        id,
        context.tasks.length > 0 && context.tasks.every((task) => hasText(task.rollback)),
        "Every task has rollback guidance.",
      );
    case "parallel-safety":
      return dimension(
        id,
        findParallelWriteConflicts(context.tasks).length === 0,
        "Parallel write sets do not overlap.",
      );
    case "worktree-suitability":
      return dimension(
        id,
        context.worktree.required === true || context.tasks.every((task) => task.productionMutation !== true),
        "Long or risky execution is isolated, and production mutation is not implicit.",
      );
    case "provider-policy":
      return dimension(
        id,
        context.policy.providerSafe !== false && context.tasks.every((task) => task.permissionBypass !== true),
        "Provider bypass flags and hidden background automation are not allowed.",
      );
    case "convergence-decision":
      return dimension(
        id,
        Number(context.convergence.iterations ?? 0) >= 1
          && Number(context.convergence.openCritical ?? 0) === 0
          && Number(context.convergence.openMajor ?? 0) === 0
          && hasText(context.convergence.stopReason)
          && hasText(context.convergence.nextUserDecision),
        "Review loop has a stop reason, no open critical or major findings, and an explicit next user decision.",
      );
    default:
      return dimension(id, false, "Unknown dimension.");
  }
}

function dimension(id, pass, evidence) {
  return { id, pass, evidence };
}

function hasTaskCycle(tasks) {
  const ids = new Set(tasks.map((task) => task.id).filter(Boolean));
  const graph = new Map(tasks.map((task) => [task.id, (task.dependencies ?? []).filter((id) => ids.has(id))]));
  const visiting = new Set();
  const visited = new Set();

  function visit(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of graph.get(id) ?? []) {
      if (visit(dependency)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }

  return [...ids].some((id) => visit(id));
}

function findParallelWriteConflicts(tasks) {
  const conflicts = [];
  const byGroup = new Map();
  for (const task of tasks) {
    if (!task.parallelGroup) continue;
    const group = byGroup.get(task.parallelGroup) ?? [];
    group.push(task);
    byGroup.set(task.parallelGroup, group);
  }

  for (const group of byGroup.values()) {
    for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
        const overlap = intersect(group[leftIndex].writeSet ?? [], group[rightIndex].writeSet ?? []);
        if (overlap.length > 0) {
          conflicts.push({ left: group[leftIndex].id, right: group[rightIndex].id, overlap });
        }
      }
    }
  }
  return conflicts;
}

function intersect(left, right) {
  const rightSet = new Set(right);
  return [...new Set(left.filter((item) => rightSet.has(item)))];
}

function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isRiskTriggered(context, risks) {
  if (risks.some((risk) => context.riskTriggers?.[risk] === true)) return true;
  const text = context.risks
    .map((risk) => typeof risk === "string" ? risk : Object.values(risk ?? {}).join(" "))
    .join(" ")
    .toLowerCase();
  return risks.some((risk) => {
    if (text.includes(risk)) return true;
    return (PLAN_REVIEW_RISK_KEYWORDS[risk] ?? []).some((keyword) => text.includes(keyword));
  });
}

export function resolveWorkflowCommand(command, artifact) {
  const raw = String(command ?? "");
  if (!raw.includes("<plan-path>")) return raw;
  const candidate = String(artifact ?? "").trim();
  const planPath = candidate && (candidate.endsWith(".md") || /[\\/]/.test(candidate))
    ? candidate
    : "<plan-path>";
  return raw.replaceAll("<plan-path>", planPath);
}

function cloneEdge(edge) {
  return { ...edge };
}

function buildNextStepChoices({ locale = "en", artifact = "", command = "", skill = "" } = {}) {
  const subject = artifact || (locale === "ru" ? "текущий артефакт" : "current artifact");
  if (locale === "ru") {
    return [
      {
        label: `Продолжить ${subject}`,
        tradeoff: `Запускает ${command} через ${skill}; gates остаются активными.`,
        recommended: true,
      },
      {
        label: `Изменить scope для ${subject}`,
        tradeoff: "Позволяет убрать, переписать, разделить или отложить пункты до следующего gate.",
      },
      {
        label: `Исключить или отложить пункты из ${subject}`,
        tradeoff: "Фиксирует, какие части не входят в текущий scope, чтобы они не попали в execution молча.",
      },
      {
        label: `Проверить readiness для ${subject}`,
        tradeoff: "Покажет prerequisites и blockers без мутаций.",
      },
      {
        label: `Сохранить ${subject} и остановиться`,
        tradeoff: "Фиксирует handoff и не продолжает workflow скрыто.",
      },
    ];
  }
  return [
    {
      label: `Continue ${subject}`,
      tradeoff: `Runs ${command} through ${skill}; gates remain active.`,
      recommended: true,
    },
    {
      label: `Revise scope for ${subject}`,
      tradeoff: "Remove, rewrite, split, or defer items before the next gate.",
    },
    {
      label: `Exclude or defer items from ${subject}`,
      tradeoff: "Record work outside the current scope so execution cannot include it silently.",
    },
    {
      label: `Inspect readiness for ${subject}`,
      tradeoff: "Shows prerequisites and blockers without mutations.",
    },
    {
      label: `Save ${subject} and stop`,
      tradeoff: "Records the handoff and does not continue the workflow silently.",
    },
  ];
}

function toCamelCase(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+([a-z0-9])/g, (_, char) => char.toUpperCase());
}
