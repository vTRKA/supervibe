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
    command: "/supervibe-plan",
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
    command: "/supervibe-loop --from-plan --atomize",
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
    command: "/supervibe-loop --guided --max-duration 3h",
    skill: "supervibe:autonomous-agent-loop",
    artifactKind: "epic-with-atomic-work-items",
    stopCondition: "ask-before-single-session-run",
    questionEn: "Step 1/1: start bounded provider-safe execution in the current session?",
    questionRu: "Шаг 1/1: запустить bounded provider-safe выполнение в текущей сессии?",
    why: "Single-session execution is the default path; worktree isolation is opt-in for parallel or risky work.",
  },
  "worktree-setup": {
    phase: "worktree-setup",
    nextPhase: "execution",
    command: "/supervibe-loop --epic --worktree --max-duration 3h",
    skill: "supervibe:autonomous-agent-loop",
    artifactKind: "approved-worktree-session",
    stopCondition: "ask-before-bounded-run",
    questionEn: "Step 1/1: start a bounded provider-safe run with stop/resume/status controls?",
    questionRu: "Шаг 1/1: bounded provider-safe запуск со stop/resume/status?",
    why: "Autonomous execution must be visible, cancellable, timeboxed, and policy-gated.",
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
  "dependency-graph",
  "task-size",
  "verification-coverage",
  "rollback-coverage",
  "parallel-safety",
  "worktree-suitability",
  "provider-policy",
]);

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

  return [
    "NEXT_STEP_HANDOFF",
    `Current phase: ${edge.phase}`,
    `Artifact: ${options.artifactPath ?? edge.artifactKind}`,
    `Next phase: ${edge.nextPhase}`,
    `Next command: ${options.command ?? edge.command}`,
    `Next skill: ${options.skill ?? edge.skill}`,
    `Stop condition: ${edge.stopCondition}`,
    `Why: ${options.why ?? edge.why}`,
    `Question: ${options.question ?? question}`,
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
  const required = [
    { code: "handoff-marker", value: "NEXT_STEP_HANDOFF" },
    { code: "artifact", value: expectedArtifact },
    { code: "next-phase", value: edge.nextPhase },
    { code: "command", value: edge.command },
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
  const context = {
    planPath: options.planPath,
    specPath: options.specPath,
    coverageMatrix: options.coverageMatrix,
    tasks,
    risks: Array.isArray(options.risks) ? options.risks : [],
    policy: options.policy ?? {},
    worktree: options.worktree ?? {},
    checks,
  };
  const dimensions = PLAN_REVIEW_DIMENSIONS.map((id) => evaluatePlanReviewDimension(id, context));

  return {
    kind: "plan-review-package",
    planPath: options.planPath ?? null,
    specPath: options.specPath ?? null,
    tasks,
    risks: context.risks,
    dimensions,
    nextHandoff: getNextWorkflowStep("plan-review"),
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

function cloneEdge(edge) {
  return { ...edge };
}

function toCamelCase(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+([a-z0-9])/g, (_, char) => char.toUpperCase());
}
