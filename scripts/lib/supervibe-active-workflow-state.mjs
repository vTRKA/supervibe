import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

const ACTIVE_WORKFLOW_STATE_SCHEMA_VERSION = 1;

const ACTIVE_WORKFLOW_STATE_FILE = ".supervibe/memory/active-workflow.json";

const ACTIVE_WORKFLOW_STAGES = Object.freeze([
  "none",
  "plan-scope-question",
  "plan-draft",
  "plan-review",
  "plan-review-failed",
  "plan-review-passed",
  "work-item-atomization",
  "execution-ready",
  "executing",
  "verification",
  "release-ready",
  "ui",
  "resume",
  "archived",
]);

const ACTIVE_WORKFLOW_STAGE_ALIASES = Object.freeze({
  plan: "plan-draft",
  review: "plan-review",
  atomize: "work-item-atomization",
  atomization: "work-item-atomization",
  ui: "ui",
  execute: "executing",
  verify: "verification",
  archive: "archived",
  resume: "resume",
});

const ACTIVE_WORKFLOW_STATE_FILENAMES = Object.freeze([
  ACTIVE_WORKFLOW_STATE_FILE,
  ".supervibe/memory/active-workflows.json",
]);

export const ACTIVE_WORKFLOW_STATE_SCHEMA = Object.freeze({
  schemaVersion: ACTIVE_WORKFLOW_STATE_SCHEMA_VERSION,
  stages: ACTIVE_WORKFLOW_STAGES,
  required: Object.freeze([
    "command",
    "stage",
    "question",
    "choices",
    "acceptedAnswer",
    "artifacts",
    "receipts",
  ]),
  oneOfRequired: Object.freeze([
    Object.freeze(["nextCommand", "nextAction"]),
  ]),
});

const STAGE_SET = new Set(ACTIVE_WORKFLOW_STAGES);
const STRICT_ONLY_STATE_ISSUES = new Set([
  "active-workflow-state-stage-missing",
  "active-workflow-state-question-missing",
  "active-workflow-state-choices-missing",
  "active-workflow-state-accepted-answer-missing",
  "active-workflow-state-artifacts-missing",
  "active-workflow-state-receipts-missing",
  "active-workflow-state-next-missing",
]);

function activeWorkflowStatePath(rootDir = process.cwd()) {
  return join(rootDir, ...ACTIVE_WORKFLOW_STATE_FILE.split("/"));
}

function activeWorkflowStatePaths(rootDir = process.cwd()) {
  return ACTIVE_WORKFLOW_STATE_FILENAMES.map((file) => join(rootDir, ...file.split("/")));
}

export function readCurrentActiveWorkflowState(rootDir = process.cwd()) {
  const report = readActiveWorkflowStateFile(activeWorkflowStatePath(rootDir), { rootDir });
  return {
    ...report,
    pass: report.issues.length === 0,
    state: report.states[0] || null,
  };
}

function writeActiveWorkflowState(rootDir = process.cwd(), state = {}, options = {}) {
  const filePath = activeWorkflowStatePath(rootDir);
  const file = normalizePath(relative(rootDir, filePath) || filePath);
  const document = materializeActiveWorkflowState(state);
  const validation = validateActiveWorkflowStateDocument(document, { file });
  if (validation.pass !== true && options.validate !== false) {
    throw activeWorkflowStateValidationError("active workflow state is invalid", validation.issues);
  }
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  return document;
}

export function upsertActiveWorkflowState(rootDir = process.cwd(), updates = {}, options = {}) {
  const current = readCurrentActiveWorkflowState(rootDir);
  if (current.exists && current.issues.length > 0 && current.states.length === 0 && options.allowInvalidBase !== true) {
    throw activeWorkflowStateValidationError("cannot upsert unreadable active workflow state", current.issues);
  }
  const base = current.state || {};
  return writeActiveWorkflowState(rootDir, mergeDefined(base, updates), options);
}

export function recordActiveWorkflowStage(rootDir = process.cwd(), stage, updates = {}, options = {}) {
  const canonicalStage = normalizeWorkflowStage(stage);
  const current = readCurrentActiveWorkflowState(rootDir);
  if (current.exists && current.issues.length > 0 && current.states.length === 0 && options.allowInvalidBase !== true) {
    throw activeWorkflowStateValidationError("cannot update unreadable active workflow state", current.issues);
  }
  const explicitNext = hasAnyOwn(updates, ["nextCommand", "next_command", "nextAction", "next_action", "next"]);
  const base = { ...(current.state || {}) };
  base.nextCommand = null;
  base.nextAction = null;
  const merged = mergeDefined(base, updates);
  merged.stage = canonicalStage;
  if (!explicitNext) {
    Object.assign(merged, defaultNextFieldsForStage(canonicalStage, merged.command, merged));
  }
  return writeActiveWorkflowState(rootDir, merged, options);
}

export function recordActiveWorkflowQuestion(rootDir = process.cwd(), question = null, details = {}, options = {}) {
  const normalizedDetails = Array.isArray(details) ? { choices: details } : details || {};
  const choices = firstPresent(
    normalizedDetails.choices,
    isPlainObject(question) ? question.choices : undefined,
    question === null ? [] : undefined,
  );
  const updates = mergeDefined(normalizedDetails, {
    question,
    choices,
    acceptedAnswer: hasAnyOwn(normalizedDetails, ["acceptedAnswer", "accepted_answer"])
      ? firstPresent(normalizedDetails.acceptedAnswer, normalizedDetails.accepted_answer)
      : null,
  });
  delete updates.choices;
  updates.choices = choices === undefined ? [] : choices;
  return upsertActiveWorkflowState(rootDir, updates, options);
}

export function recordActiveWorkflowAcceptedAnswer(rootDir = process.cwd(), acceptedAnswer = null, updates = {}, options = {}) {
  return upsertActiveWorkflowState(rootDir, mergeDefined(updates, { acceptedAnswer }), options);
}

export function clearActiveWorkflowState(rootDir = process.cwd()) {
  const filePath = activeWorkflowStatePath(rootDir);
  const file = normalizePath(relative(rootDir, filePath) || filePath);
  if (!existsSync(filePath)) return { file, cleared: false };
  unlinkSync(filePath);
  return { file, cleared: true };
}

export function archiveActiveWorkflowState(rootDir = process.cwd(), options = {}) {
  const current = readCurrentActiveWorkflowState(rootDir);
  const file = current.file || normalizePath(relative(rootDir, activeWorkflowStatePath(rootDir)));
  if (!current.exists || !current.state) {
    return { file, archived: false, cleared: false, state: null };
  }
  if (current.issues.length > 0 && options.allowInvalidBase !== true) {
    throw activeWorkflowStateValidationError("cannot archive invalid active workflow state", current.issues);
  }
  const archivedState = materializeActiveWorkflowState(mergeDefined(current.state, options.updates || {}, {
    stage: "archived",
    nextCommand: options.nextCommand ?? null,
    nextAction: options.nextAction || "workflow archived; no active workflow",
  }));
  if (options.clear === false) {
    return {
      file,
      archived: true,
      cleared: false,
      state: writeActiveWorkflowState(rootDir, archivedState, options),
    };
  }
  const cleared = clearActiveWorkflowState(rootDir);
  return {
    file,
    archived: true,
    cleared: cleared.cleared,
    state: archivedState,
  };
}

export function buildActiveWorkflowResumeInfo(state = null) {
  if (!isPlainObject(state)) {
    return {
      canResume: false,
      command: "",
      stage: "none",
      nextCommand: "",
      nextAction: "none",
      hasPendingQuestion: false,
      question: null,
      acceptedAnswer: null,
      artifacts: [],
      receipts: [],
    };
  }
  const normalized = normalizeActiveWorkflowState(state);
  const stage = normalizeWorkflowStage(normalized.stage);
  const inactive = stage === "none" || stage === "archived";
  const hasPendingQuestion = isPlainObject(normalized.question) && normalized.acceptedAnswer === null;
  const defaults = defaultNextFieldsForStage(stage, normalized.command, normalized);
  const nextCommand = inactive ? "" : firstNonEmpty(normalized.nextCommand, defaults.nextCommand, normalized.command);
  const nextAction = inactive
    ? "none"
    : firstNonEmpty(
      normalized.nextAction,
      hasPendingQuestion ? "answer active workflow question" : "",
      defaults.nextAction,
      "resume active workflow",
    );
  return {
    canResume: Boolean(!inactive && normalized.command),
    command: normalized.command,
    stage,
    nextCommand,
    nextAction,
    hasPendingQuestion,
    question: normalized.question ?? null,
    acceptedAnswer: normalized.acceptedAnswer ?? null,
    artifacts: Array.isArray(normalized.artifacts) ? normalized.artifacts : [],
    receipts: Array.isArray(normalized.receipts) ? normalized.receipts : [],
  };
}

export function readActiveWorkflowStateFiles(rootDir = process.cwd()) {
  return activeWorkflowStatePaths(rootDir).map((filePath) => readActiveWorkflowStateFile(filePath, { rootDir }));
}

function readActiveWorkflowStateFile(filePath, { rootDir = process.cwd(), strict = true } = {}) {
  const file = normalizePath(relative(rootDir, filePath) || filePath);
  if (!existsSync(filePath)) {
    return { file, exists: false, checked: 0, states: [], issues: [] };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    return {
      file,
      exists: true,
      checked: 0,
      states: [],
      issues: [issue("active-workflow-state-invalid-json", file, `active workflow state JSON is invalid: ${error.message}`)],
    };
  }

  const documents = extractActiveWorkflowStateDocuments(parsed);
  if (documents.length === 0) {
    return {
      file,
      exists: true,
      checked: 0,
      states: [],
      issues: [issue("active-workflow-state-empty", file, "active workflow state file contains no workflow objects")],
    };
  }

  const states = [];
  const issues = [];
  documents.forEach((document, index) => {
    const location = documents.length > 1 ? `${file}[${index}]` : file;
    const result = validateActiveWorkflowStateDocument(document, { file: location, strict });
    states.push(result.state);
    issues.push(...result.issues);
  });

  return {
    file,
    exists: true,
    checked: documents.length,
    states,
    issues,
  };
}

export function validateActiveWorkflowStateFiles(rootDir = process.cwd(), options = {}) {
  const strict = options.strict === true;
  const files = activeWorkflowStatePaths(rootDir).map((filePath) => readActiveWorkflowStateFile(filePath, {
    rootDir,
    strict,
  }));
  const issues = files.flatMap((file) => file.issues);
  const checked = files.reduce((total, file) => total + file.checked, 0);
  if (options.strict === true && checked === 0) {
    issues.push(issue(
      "active-workflow-state-missing",
      ".supervibe/memory/active-workflow.json",
      "strict active workflow validation requires .supervibe/memory/active-workflow.json or active-workflows.json",
    ));
  }
  return {
    pass: issues.length === 0,
    checked,
    files,
    issues,
  };
}

export function validateActiveWorkflowStateDocument(document, { file = "active-workflow-state", strict = true } = {}) {
  const state = normalizeActiveWorkflowState(document);
  const issues = validateActiveWorkflowState(state, { file, original: document, strict });
  return {
    pass: issues.length === 0,
    state,
    issues,
  };
}

export function normalizeActiveWorkflowState(document = {}) {
  const source = isPlainObject(document) ? document : {};
  const next = isPlainObject(source.next) ? source.next : {};
  const question = normalizeQuestion(firstPresent(source.question, source.activeQuestion, source.currentQuestion));
  const choices = normalizeChoices(firstPresent(source.choices, question?.choices, source.questionChoices, source.nextQuestionChoices));
  const acceptedAnswer = normalizeAcceptedAnswer(firstPresent(source.acceptedAnswer, source.accepted_answer));
  const artifacts = normalizeArtifacts(firstPresent(source.artifacts, source.artifactRefs, source.artifactIds));
  const receipts = normalizeReceipts(firstPresent(source.receipts, source.receiptIds, source.receipt_ids));
  const nextCommand = normalizeCommand(firstNonEmpty(source.nextCommand, source.next_command, next.command));
  const command = normalizeCommand(firstNonEmpty(source.command, source.workflow, source.activeCommand, nextCommand));

  return {
    schemaVersion: normalizeSchemaVersion(firstPresent(source.schemaVersion, source.schema_version)),
    stage: String(firstPresent(source.stage, source.phase, "") || "").trim(),
    command,
    host: String(firstPresent(source.host, source.activeHost, "") || "").trim(),
    slug: String(firstPresent(source.slug, source.prototypeSlug, "") || "").trim(),
    handoffId: String(firstPresent(source.handoffId, source.handoff, "") || "").trim(),
    workflowRunId: String(firstPresent(source.workflowRunId, source.workflow_run_id, "") || "").trim(),
    requestedVariantCount: firstPresent(source.requestedVariantCount, source.requestedVariants, source.variantCount, source.requested_variants, ""),
    target: String(firstPresent(source.target, "") || "").trim(),
    mode: String(firstPresent(source.mode, "") || "").trim(),
    requiresCapabilityPlan: firstPresent(source.requiresCapabilityPlan, source.requireCapabilityPlan, false),
    requireBrowserEvidence: firstPresent(source.requireBrowserEvidence, source.requiresBrowserEvidence, false),
    question,
    activeQuestion: isPlainObject(question) ? question : null,
    choices,
    acceptedAnswer,
    artifacts,
    receipts,
    nextCommand,
    nextAction: String(firstPresent(source.nextAction, next.action, "") || "").trim(),
  };
}

export function activeWorkflowStateToWorkflow(state = {}) {
  const stage = normalizeWorkflowStage(state.stage || "");
  return {
    command: normalizeCommand(firstNonEmpty(state.command, state.nextCommand)),
    stage,
    host: state.host || "",
    slug: state.slug || "",
    handoffId: state.handoffId || "",
    workflowRunId: state.workflowRunId || "",
    requestedVariantCount: state.requestedVariantCount || "",
    target: state.target || "",
    mode: state.mode || "",
    requiresCapabilityPlan: state.requiresCapabilityPlan || false,
    requireBrowserEvidence: state.requireBrowserEvidence || false,
    activeQuestion: state.activeQuestion || state.question || null,
    choices: Array.isArray(state.choices) ? state.choices : [],
    acceptedAnswer: Object.hasOwn(state, "acceptedAnswer") ? state.acceptedAnswer : undefined,
    artifacts: Array.isArray(state.artifacts) ? state.artifacts : [],
    receipts: Array.isArray(state.receipts) ? state.receipts : [],
    nextCommand: state.nextCommand || "",
    nextAction: state.nextAction || "",
  };
}

function validateActiveWorkflowState(state = {}, { file = "active-workflow-state", original = undefined, strict = true } = {}) {
  const issues = [];
  const source = isPlainObject(original) ? original : isPlainObject(state) ? state : {};
  const normalized = normalizeActiveWorkflowState(state);
  if (!isPlainObject(state)) {
    issues.push(issue("active-workflow-state-invalid", file, "active workflow state must be an object"));
  }
  if (Object.hasOwn(source, "schemaVersion") || Object.hasOwn(source, "schema_version")) {
    if (normalized.schemaVersion !== ACTIVE_WORKFLOW_STATE_SCHEMA_VERSION) {
      issues.push(issue(
        "active-workflow-state-schema-version",
        file,
        `schemaVersion must be ${ACTIVE_WORKFLOW_STATE_SCHEMA_VERSION} when provided`,
      ));
    }
  }

  const rawCommand = firstPresent(source.command, source.workflow, source.activeCommand);
  if (!hasAnyOwn(source, ["command", "workflow", "activeCommand"])) {
    issues.push(issue("active-workflow-state-command-missing", file, "command is required"));
  } else if (!nonEmptyString(rawCommand)) {
    issues.push(issue("active-workflow-state-command-invalid", file, "command must be a non-empty Supervibe command"));
  } else if (!isCommandLike(normalized.command)) {
    issues.push(issue(
      "active-workflow-state-command-invalid",
      file,
      "command must be a Supervibe slash command",
    ));
  }

  if (!normalized.stage) {
    issues.push(issue("active-workflow-state-stage-missing", file, "stage is required"));
  } else if (!STAGE_SET.has(normalized.stage)) {
    issues.push(issue("active-workflow-state-stage-invalid", file, `stage must be one of ${ACTIVE_WORKFLOW_STAGES.join(", ")}`));
  }

  if (!hasAnyOwn(source, ["question", "activeQuestion", "currentQuestion"])) {
    issues.push(issue("active-workflow-state-question-missing", file, "question is required and may be null when no user prompt is active"));
  } else if (normalized.question !== null && !isPlainObject(normalized.question)) {
    issues.push(issue("active-workflow-state-question-invalid", file, "question must be null or an object"));
  } else if (isPlainObject(normalized.question)) {
    validateOptionalString(normalized.question.id, "active-workflow-state-question-invalid", "question.id", file, issues);
    validateOptionalString(normalized.question.prompt, "active-workflow-state-question-invalid", "question.prompt", file, issues);
  }

  if (!hasAnyOwn(source, ["choices", "questionChoices", "nextQuestionChoices"]) && !Array.isArray(normalized.question?.choices)) {
    issues.push(issue("active-workflow-state-choices-missing", file, "choices array is required, even when empty"));
  } else if (!Array.isArray(normalized.choices)) {
    issues.push(issue("active-workflow-state-choices-invalid", file, "choices must be an array of choice objects"));
  } else {
    const seen = new Set();
    for (const [index, choice] of normalized.choices.entries()) {
      if (!isPlainObject(choice) || !nonEmptyString(choice.id) || !nonEmptyString(choice.label)) {
        issues.push(issue("active-workflow-state-choice-invalid", file, `choices[${index}] must include non-empty id and label`));
        continue;
      }
      if (seen.has(choice.id)) {
        issues.push(issue("active-workflow-state-choice-duplicate", file, `choice id "${choice.id}" is duplicated`));
      }
      seen.add(choice.id);
    }
  }

  if (!hasAnyOwn(source, ["acceptedAnswer", "accepted_answer"])) {
    issues.push(issue("active-workflow-state-accepted-answer-missing", file, "acceptedAnswer is required and may be null until the gate is answered"));
  } else if (normalized.acceptedAnswer !== null && !isPlainObject(normalized.acceptedAnswer)) {
    issues.push(issue("active-workflow-state-accepted-answer-invalid", file, "acceptedAnswer must be null or an object"));
  } else if (isPlainObject(normalized.acceptedAnswer)) {
    validateOptionalString(normalized.acceptedAnswer.choiceId, "active-workflow-state-accepted-answer-invalid", "acceptedAnswer.choiceId", file, issues);
    if (nonEmptyString(normalized.acceptedAnswer.choiceId) && Array.isArray(normalized.choices) && normalized.choices.length > 0) {
      const choiceIds = new Set(normalized.choices
        .filter(isPlainObject)
        .map((choice) => choice.id));
      if (!choiceIds.has(normalized.acceptedAnswer.choiceId)) {
        issues.push(issue("active-workflow-state-accepted-answer-choice", file, `acceptedAnswer.choiceId "${normalized.acceptedAnswer.choiceId}" does not match a known choice`));
      }
    }
  }

  if (!hasAnyOwn(source, ["artifacts", "artifactRefs", "artifactIds"])) {
    issues.push(issue("active-workflow-state-artifacts-missing", file, "artifacts array is required, even when empty"));
  } else if (!Array.isArray(normalized.artifacts)) {
    issues.push(issue("active-workflow-state-artifacts-invalid", file, "artifacts must be an array of objects with id and path"));
  } else {
    for (const [index, artifact] of normalized.artifacts.entries()) {
      if (!isPlainObject(artifact) || !nonEmptyString(artifact.id) || !nonEmptyString(artifact.path)) {
        issues.push(issue("active-workflow-state-artifact-invalid", file, `artifacts[${index}] must include non-empty id and path`));
      }
    }
  }

  if (!hasAnyOwn(source, ["receipts", "receiptIds", "receipt_ids"])) {
    issues.push(issue("active-workflow-state-receipts-missing", file, "receipts array is required, even when empty"));
  } else if (!Array.isArray(normalized.receipts)) {
    issues.push(issue("active-workflow-state-receipts-invalid", file, "receipts must be an array of receipt ids or objects with id"));
  } else {
    for (const [index, receipt] of normalized.receipts.entries()) {
      if (!isPlainObject(receipt) || !nonEmptyString(receipt.id)) {
        issues.push(issue("active-workflow-state-receipt-invalid", file, `receipts[${index}] must include a non-empty id`));
      }
    }
  }

  const hasNextCommand = hasAnyOwn(source, ["nextCommand", "next_command"]) || isPlainObject(source.next) && Object.hasOwn(source.next, "command");
  const hasNextAction = hasAnyOwn(source, ["nextAction", "next_action"]) || isPlainObject(source.next) && Object.hasOwn(source.next, "action");
  if (!normalized.nextCommand && !normalized.nextAction) {
    issues.push(issue("active-workflow-state-next-missing", file, "nextCommand or nextAction is required"));
  }
  const rawNextCommand = firstPresent(source.nextCommand, source.next_command, isPlainObject(source.next) ? source.next.command : undefined);
  const rawNextAction = firstPresent(source.nextAction, source.next_action, isPlainObject(source.next) ? source.next.action : undefined);
  if (hasNextCommand && !nonEmptyString(rawNextCommand)) {
    issues.push(issue("active-workflow-state-next-command-invalid", file, "nextCommand must be a non-empty Supervibe slash command"));
  } else if (normalized.nextCommand && !isCommandLike(normalized.nextCommand)) {
    issues.push(issue("active-workflow-state-next-command-invalid", file, "nextCommand must be a Supervibe slash command"));
  }
  if (hasNextAction && !nonEmptyString(rawNextAction)) {
    issues.push(issue("active-workflow-state-next-action-invalid", file, "nextAction must be a non-empty string"));
  }

  if (strict !== true) {
    return issues.filter((item) => !STRICT_ONLY_STATE_ISSUES.has(item.code));
  }
  return issues;
}

function extractActiveWorkflowStateDocuments(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (!isPlainObject(parsed)) return [];
  if (Array.isArray(parsed.activeWorkflows)) return parsed.activeWorkflows;
  if (Array.isArray(parsed.workflows)) return parsed.workflows;
  if (isPlainObject(parsed.state)) return [parsed.state];
  if (isWorkflowLike(parsed)) return [parsed];
  return [];
}

function materializeActiveWorkflowState(document = {}) {
  const source = isPlainObject(document) ? document : {};
  const nestedNext = isPlainObject(source.next) ? source.next : {};
  const command = normalizeCommand(firstNonEmpty(source.command, source.workflow, source.activeCommand, source.nextCommand, nestedNext.command));
  const stage = normalizeWorkflowStage(firstPresent(source.stage, source.phase, "none"));
  const question = normalizeQuestion(firstPresent(source.question, source.activeQuestion, source.currentQuestion, null));
  const choices = normalizeChoices(firstPresent(source.choices, question?.choices, source.questionChoices, source.nextQuestionChoices, []));
  const acceptedAnswer = normalizeAcceptedAnswer(firstPresent(source.acceptedAnswer, source.accepted_answer, null));
  const artifacts = normalizeArtifacts(firstPresent(source.artifacts, source.artifactRefs, source.artifactIds, []));
  const receipts = normalizeReceipts(firstPresent(source.receipts, source.receiptIds, source.receipt_ids, []));
  const explicitNextCommand = firstPresent(source.nextCommand, source.next_command, nestedNext.command);
  const explicitNextAction = firstPresent(source.nextAction, source.next_action, nestedNext.action);
  const defaults = defaultNextFieldsForStage(stage, command, { artifacts });
  const nextCommand = normalizeCommand(firstNonEmpty(
    explicitNextCommand,
    explicitNextCommand === undefined && explicitNextAction === undefined ? defaults.nextCommand : "",
  ));
  const nextAction = String(firstNonEmpty(
    explicitNextAction,
    explicitNextCommand === undefined && explicitNextAction === undefined ? defaults.nextAction : "",
  ) || "").trim();
  const state = {
    schemaVersion: ACTIVE_WORKFLOW_STATE_SCHEMA_VERSION,
    command,
    stage,
    question,
    choices,
    acceptedAnswer,
    artifacts,
    receipts,
  };
  assignOptionalString(state, "host", firstPresent(source.host, source.activeHost));
  assignOptionalString(state, "slug", firstPresent(source.slug, source.prototypeSlug));
  assignOptionalString(state, "handoffId", firstPresent(source.handoffId, source.handoff));
  assignOptionalString(state, "workflowRunId", firstPresent(source.workflowRunId, source.workflow_run_id));
  const requestedVariantCount = firstPresent(source.requestedVariantCount, source.requestedVariants, source.variantCount, source.requested_variants);
  if (requestedVariantCount !== undefined && requestedVariantCount !== "") state.requestedVariantCount = requestedVariantCount;
  assignOptionalString(state, "target", source.target);
  assignOptionalString(state, "mode", source.mode);
  if (source.requiresCapabilityPlan !== undefined || source.requireCapabilityPlan !== undefined) {
    state.requiresCapabilityPlan = firstPresent(source.requiresCapabilityPlan, source.requireCapabilityPlan, false);
  }
  if (source.requireBrowserEvidence !== undefined || source.requiresBrowserEvidence !== undefined) {
    state.requireBrowserEvidence = firstPresent(source.requireBrowserEvidence, source.requiresBrowserEvidence, false);
  }
  if (nextCommand) state.nextCommand = nextCommand;
  if (nextAction) state.nextAction = nextAction;
  return state;
}

function normalizeWorkflowStage(stage = "") {
  const normalized = String(stage || "").trim();
  if (!normalized) return "";
  const lower = normalized.toLowerCase();
  return ACTIVE_WORKFLOW_STAGE_ALIASES[lower] || lower;
}

function defaultNextFieldsForStage(stage = "", command = "", state = {}) {
  const currentCommand = normalizeCommand(command);
  switch (normalizeWorkflowStage(stage)) {
    case "plan-scope-question":
      return { nextCommand: currentCommand || "/supervibe-plan", nextAction: "answer active workflow question" };
    case "plan-draft":
      return { nextCommand: currentCommand || "/supervibe-plan", nextAction: "continue plan drafting" };
    case "plan-review":
      return { nextCommand: currentCommand || "/supervibe-plan", nextAction: "review active plan" };
    case "plan-review-failed":
      return { nextCommand: currentCommand || "/supervibe-plan", nextAction: "revise plan and rerun review" };
    case "plan-review-passed":
      return {
        nextCommand: `/supervibe-loop --atomize-plan ${findPlanArtifactPath(state) || "<plan-path>"} --plan-review-passed`,
        nextAction: "atomize reviewed plan",
      };
    case "work-item-atomization":
      return { nextCommand: "/supervibe-ui", nextAction: "open active epic/task UI before execution" };
    case "execution-ready":
      return { nextCommand: "/supervibe-loop", nextAction: "claim next ready work item" };
    case "executing":
      return { nextCommand: "/supervibe-loop", nextAction: "continue active execution" };
    case "verification":
      return { nextCommand: "/supervibe-validate", nextAction: "run workflow verification" };
    case "release-ready":
      return { nextCommand: "/supervibe-loop", nextAction: "archive or continue release handoff" };
    case "ui":
      return { nextCommand: "/supervibe-ui", nextAction: "open active workflow UI" };
    case "resume":
      return { nextCommand: currentCommand || "/supervibe-loop", nextAction: "resume active workflow" };
    case "archived":
    case "none":
      return { nextCommand: "", nextAction: "none" };
    default:
      return { nextCommand: currentCommand, nextAction: "resume active workflow" };
  }
}

function findPlanArtifactPath(state = {}) {
  const artifacts = Array.isArray(state.artifacts) ? state.artifacts : [];
  for (const artifact of artifacts) {
    if (!isPlainObject(artifact)) continue;
    const path = String(artifact.path || artifact.file || "").trim();
    if (!path) continue;
    const id = String(artifact.id || artifact.kind || artifact.type || artifact.label || "").toLowerCase();
    if (id.includes("plan") || path.includes("/plans/") || path.includes("\\plans\\")) return path;
  }
  return "";
}

function mergeDefined(...sources) {
  const target = {};
  for (const source of sources) {
    if (!isPlainObject(source)) continue;
    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined) target[key] = value;
    }
  }
  return target;
}

function assignOptionalString(target, key, value) {
  if (value === undefined || value === null) return;
  const text = String(value).trim();
  if (text) target[key] = text;
}

function activeWorkflowStateValidationError(message, issues = []) {
  const error = new Error(`${message}: ${issues.map((item) => item.code || item.message).join(", ")}`);
  error.name = "ActiveWorkflowStateValidationError";
  error.issues = issues;
  return error;
}

function normalizeQuestion(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (isPlainObject(value)) return { ...value };
  return value;
}

function normalizeChoices(value) {
  if (!Array.isArray(value)) return value;
  return value.map((choice) => {
    if (isPlainObject(choice)) return { ...choice };
    return choice;
  });
}

function normalizeAcceptedAnswer(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (isPlainObject(value)) return { ...value };
  return value;
}

function normalizeArtifacts(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return value;
  return value.map((artifact) => isPlainObject(artifact) ? { ...artifact } : artifact);
}

function normalizeReceipts(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return value;
  return value.map((receipt) => {
    if (isPlainObject(receipt)) return { ...receipt };
    if (typeof receipt === "string") return { id: receipt.trim() };
    return receipt;
  });
}

function normalizeSchemaVersion(value) {
  const version = Number(value);
  return Number.isInteger(version) ? version : null;
}

function normalizeCommand(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function isWorkflowLike(value) {
  return Boolean(value.command || value.workflow || value.activeCommand || value.stage || value.phase || value.nextCommand || value.next?.command);
}

function hasAnyOwn(value = {}, keys = []) {
  return isPlainObject(value) && keys.some((key) => Object.hasOwn(value, key));
}

function validateOptionalString(value, code, label, file, issues) {
  if (value === undefined || value === null) return;
  if (typeof value === "string") return;
  issues.push(issue(code, file, `${label} must be a string when provided`));
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined);
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isCommandLike(value) {
  return /^\/[^\s/][^\s]*$/.test(String(value || "").trim());
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizePath(path) {
  return String(path || "").split(sep).join("/");
}

function issue(code, file, message) {
  return { code, file, message };
}
