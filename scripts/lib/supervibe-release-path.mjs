import {
  normalizeAnswerRecord,
  normalizeApprovalRecord,
  normalizeArtifactManifest,
  normalizeEvidenceMap,
  normalizeGoal,
  normalizeQuestionRecord,
  normalizeSpecialistEvidenceRecord,
  normalizeStageSummaryRecord,
  normalizeWaiverRecord,
  validateAnswerRecord,
  validateApprovalRecord,
  validateArtifactManifest,
  validateEvidenceMap,
  validateGoal,
  validateQuestionRecord,
  validateSpecialistEvidenceRecord,
  validateStageSummaryRecord,
  validateWaiverRecord,
} from "./supervibe-goals-contract.mjs";

const SUPERVIBE_RELEASE_PATH_SCHEMA_VERSION = 1;

const RELEASE_PATH_STAGES = Object.freeze([
  "brainstorm",
  "spec-approval",
  "plan-approval",
  "loop-completion",
  "verify",
  "review",
  "ship",
]);

const PRODUCTION_RELEASE_SEQUENCE = Object.freeze(["verify", "review", "ship"]);

const COMPLETION_EVENT_TYPES = new Set([
  "stage-completed",
  "stage-complete",
  "gate-passed",
  "command-completed",
  "command-passed",
  "verified",
  "reviewed",
  "shipped",
  "release-gate-passed",
]);

const RELEASE_PATH_STAGE_SET = new Set(RELEASE_PATH_STAGES);

export function normalizeWorkflowEvent(record = {}) {
  const source = isPlainObject(record) ? record : {};
  return compactObject({
    id: text(source.id),
    type: normalizeToken(firstPresent(source.type, source.eventType, source.event_type)),
    stage: normalizeStage(source.stage),
    createdAt: text(firstPresent(source.createdAt, source.created_at)),
    evidenceIds: normalizeStringArray(firstPresent(source.evidenceIds, source.evidence_ids, source.evidence)),
    artifactIds: normalizeStringArray(firstPresent(source.artifactIds, source.artifact_ids, source.artifacts)),
    summaryId: text(firstPresent(source.summaryId, source.summary_id)),
  });
}

export function validateWorkflowEvent(record = {}, options = {}) {
  const issues = [];
  const event = normalizeWorkflowEvent(record);
  if (!isPlainObject(record)) add(issues, "workflow-event-invalid", options.path, "workflow event must be an object");
  requireSafeId(event.id, "workflow-event-id", options.path, issues);
  requireSafeId(event.type, "workflow-event-type", options.path, issues);
  requireStage(event.stage, "workflow-event-stage", options.path, issues);
  requireIsoDate(event.createdAt, "workflow-event-created-at", options.path, issues);
  validateStringArray(event.evidenceIds, "workflow-event-evidence", options.path, issues, { required: false });
  validateStringArray(event.artifactIds, "workflow-event-artifacts", options.path, issues, { required: false });
  return validationResult(event, issues);
}

export function normalizeWorkflowState(record = {}) {
  const source = isPlainObject(record) ? record : {};
  const currentQuestion = firstPresent(source.currentQuestion, source.activeQuestion, source.question);
  return compactObject({
    schemaVersion: numberOrDefault(firstPresent(source.schemaVersion, source.schema_version), SUPERVIBE_RELEASE_PATH_SCHEMA_VERSION),
    id: text(firstPresent(source.id, source.workflowRunId, source.workflow_run_id)),
    command: normalizeCommand(firstPresent(source.command, source.workflow)),
    stage: normalizeStage(source.stage),
    goals: normalizeArray(source.goals).map(normalizeGoal),
    currentQuestion: isPlainObject(currentQuestion) ? normalizeQuestionRecord(currentQuestion) : currentQuestion ?? null,
    choices: normalizeArray(source.choices).map((choice) => ({ ...choice })),
    answerHistory: normalizeArray(firstPresent(source.answerHistory, source.answer_history, source.answers)).map(normalizeAnswerRecord),
    resumeCursor: text(firstPresent(source.resumeCursor, source.resume_cursor, isPlainObject(currentQuestion) ? currentQuestion.resumeCursor : undefined)),
    blockedDecision: normalizeNullableObject(firstPresent(source.blockedDecision, source.blocked_decision)),
    nextCommand: normalizeCommand(firstPresent(source.nextCommand, source.next_command)),
    nextAction: text(firstPresent(source.nextAction, source.next_action)),
    approvals: normalizeArray(source.approvals).map(normalizeApprovalRecord),
    waivers: normalizeArray(source.waivers).map(normalizeWaiverRecord),
    evidence: normalizeEvidenceMap(firstPresent(source.evidence, source.evidenceMap, source.evidence_map)),
    artifactManifest: normalizeArtifactManifest(firstPresent(source.artifactManifest, source.artifact_manifest, { artifacts: source.artifacts })),
    summaries: normalizeArray(firstPresent(source.summaries, source.stageSummaries, source.stage_summaries)).map(normalizeStageSummaryRecord),
    specialistEvidence: normalizeArray(firstPresent(source.specialistEvidence, source.specialist_evidence)).map(normalizeSpecialistEvidenceRecord),
    events: normalizeArray(source.events).map(normalizeWorkflowEvent),
  });
}

export function buildLoopCompletionDecision(input = {}) {
  const source = isPlainObject(input) ? input : {};
  const artifact = text(source.artifact || source.graphPath || source.graph || source.path) || "completed-loop";
  const nextCommand = text(source.nextCommand) || nextReleaseCommandForFacts(source);
  const choices = [
    {
      id: "proceed-verify",
      label: "Run /supervibe-verify",
      command: "/supervibe-verify",
      description: "Build the Goal-to-evidence verification packet before review.",
      recommended: nextCommand === "/supervibe-verify",
    },
    {
      id: "proceed-review",
      label: "Run /supervibe-review",
      command: "/supervibe-review",
      description: "Review verified evidence and production readiness.",
      recommended: nextCommand === "/supervibe-review",
    },
    {
      id: "continue-loop",
      label: "Continue loop",
      command: "/supervibe-loop --resume-dispatch",
      description: "Resume implementation with the next ready parallel agent wave when completion evidence still has gaps.",
      recommended: nextCommand === "/supervibe-loop --resume-dispatch" || nextCommand === "/supervibe-loop --status",
    },
    {
      id: "revise-goals",
      label: "Revise goals",
      command: "/supervibe-loop --revise-goals",
      description: "Adjust, defer, split, or repair goals before release gates.",
    },
    {
      id: "stop-with-gaps",
      label: "Stop with gaps",
      command: "",
      description: "Persist the current handoff with explicit remaining gaps.",
    },
  ];
  return {
    workflow: text(source.workflow) || "verify-review-ship",
    currentStage: "loop-completion",
    artifact,
    recommendation: text(source.recommendation) || "Choose the next production-readiness gate for the completed loop.",
    why: text(source.why) || "Production-ready handoff must pass verify, review, and ship unless an explicit waiver or skip evidence covers a gate.",
    question: text(source.question) || "Step 1/1: choose the next action after loop completion?",
    resumeCursor: text(source.resumeCursor || source.resume_cursor) || "loop-completion:next-decision",
    nextCommand,
    nextSkill: text(source.nextSkill || source.next_skill) || "supervibe:verification",
    stopCondition: "wait-for-explicit-next-decision",
    choices,
  };
}

export function validateProductionReleasePath(record = {}, options = {}) {
  const state = normalizeWorkflowState(record);
  const issues = [];
  if (options.validateState !== false) {
    issues.push(...validateWorkflowState(record, { ...options, enforceProductionPath: false, productionReady: false }).issues);
  }

  const enforce = Boolean(
    options.enforce
      || options.productionReady
      || options.enforceProductionPath
      || state.stage === "ship"
      || state.nextCommand === "/supervibe-ship"
      || /\b(ship|production-ready|release)\b/i.test(state.nextAction || ""),
  );
  const completionTimes = releaseStageCompletionTimes(state);
  const completedStages = PRODUCTION_RELEASE_SEQUENCE.filter((stage) => completionTimes[stage]);
  const waivedStages = PRODUCTION_RELEASE_SEQUENCE.filter((stage) => releaseStageWaived(state, stage, options));
  const satisfiedStages = new Set([...completedStages, ...waivedStages]);
  const targetStage = releaseTargetStage(state, satisfiedStages);

  if (enforce || targetStage) {
    if ((targetStage === "review" || targetStage === "ship") && !satisfiedStages.has("verify")) {
      add(issues, "production-release-verify-missing", options.path, "production release path requires /supervibe-verify evidence before review or ship");
    }
    if (targetStage === "ship" && !satisfiedStages.has("review")) {
      add(issues, "production-release-review-missing", options.path, "production release path requires /supervibe-review evidence before ship");
    }
    if (completedStages.includes("review") && !waivedStages.includes("verify") && !hasCompletionAtOrAfter(state, "review", completionTimes.verify)) {
      add(issues, "production-release-review-before-verify", options.path, "production release path requires review completion after verify completion");
    }
    const evaluatingShipGate = targetStage === "ship" || completedStages.includes("ship");
    if (evaluatingShipGate && !waivedStages.includes("verify") && !hasCompletionAtOrAfter(state, "ship", completionTimes.verify)) {
      add(issues, "production-release-ship-before-verify", options.path, "production release path requires ship completion after verify completion");
    }
    const reviewGateTime = latestCompletionBetween(state, "review", completionTimes.verify, completionTimes.ship);
    if (evaluatingShipGate && !waivedStages.includes("review") && completionTimes.ship && !reviewGateTime) {
      add(issues, "production-release-ship-before-review", options.path, "production release path requires ship completion after review completion");
    }
  }

  return {
    pass: issues.length === 0,
    record: state,
    issues,
    completedStages,
    waivedStages,
    nextRequiredStage: PRODUCTION_RELEASE_SEQUENCE.find((stage) => !satisfiedStages.has(stage)) || "complete",
  };
}

export function validateWorkflowState(record = {}, options = {}) {
  const issues = [];
  const state = normalizeWorkflowState(record);
  if (!isPlainObject(record)) add(issues, "workflow-state-invalid", options.path, "workflow state must be an object");
  if (state.schemaVersion !== SUPERVIBE_RELEASE_PATH_SCHEMA_VERSION) {
    add(issues, "workflow-state-schema-version", options.path, `schemaVersion must be ${SUPERVIBE_RELEASE_PATH_SCHEMA_VERSION}`);
  }
  requireSafeId(state.id, "workflow-state-id", options.path, issues);
  if (state.command && !isCommandLike(state.command)) add(issues, "workflow-state-command-invalid", options.path, "workflow state command must be a slash command when provided");
  requireStage(state.stage, "workflow-state-stage", options.path, issues);
  if (!Array.isArray(state.goals) || state.goals.length === 0) {
    add(issues, "workflow-state-goals-missing", options.path, "workflow state must include at least one goal");
  }
  appendNestedIssues(issues, state.goals, validateGoal, "goals", options);
  validateDuplicateIds(state.goals, "workflow-state-goal-duplicate", options.path, issues);

  if (isPlainObject(state.currentQuestion)) {
    issues.push(...validateQuestionRecord(state.currentQuestion, { ...options, path: joinPath(options.path, "currentQuestion") }).issues);
  } else if (state.currentQuestion !== null && state.currentQuestion !== undefined) {
    add(issues, "workflow-state-current-question-invalid", options.path, "currentQuestion must be null or an object");
  }

  appendNestedIssues(issues, state.answerHistory, validateAnswerRecord, "answerHistory", options);
  if (state.resumeCursor && !safeId(state.resumeCursor)) add(issues, "workflow-state-resume-cursor-invalid", options.path, "resumeCursor must be ASCII-safe");
  if (state.nextCommand && !isCommandLike(state.nextCommand)) add(issues, "workflow-state-next-command-invalid", options.path, "nextCommand must be a slash command when provided");
  appendNestedIssues(issues, state.approvals, validateApprovalRecord, "approvals", options);
  appendNestedIssues(issues, state.waivers, validateWaiverRecord, "waivers", options);
  issues.push(...validateEvidenceMap(state.evidence, { ...options, path: joinPath(options.path, "evidence") }).issues);
  issues.push(...validateArtifactManifest(state.artifactManifest, { ...options, path: joinPath(options.path, "artifactManifest") }).issues);
  appendNestedIssues(issues, state.summaries, validateStageSummaryRecord, "summaries", options);
  appendNestedIssues(issues, state.specialistEvidence, validateSpecialistEvidenceRecord, "specialistEvidence", options);
  appendNestedIssues(issues, state.events, validateWorkflowEvent, "events", options);
  if (options.enforceProductionPath || options.productionReady) {
    issues.push(...validateProductionReleasePath(state, { ...options, validateState: false, enforce: true }).issues);
  }

  return validationResult(state, issues);
}

function nextReleaseCommandForFacts(source = {}) {
  if (source.reviewed || source.reviewComplete || source.review_complete || source.shipped || source.shipComplete || source.ship_complete) {
    return "/supervibe-loop --resume-dispatch";
  }
  if (source.verified || source.verifyComplete || source.verify_complete) return "/supervibe-review";
  return "/supervibe-verify";
}

function releaseTargetStage(state = {}, satisfiedStages = new Set()) {
  if (state.stage === "ship" || state.nextCommand === "/supervibe-ship") return "ship";
  if (state.stage === "review" || state.nextCommand === "/supervibe-review") return "review";
  if (releaseStageCompleted(state, "ship") || satisfiedStages.has("ship")) return "ship";
  if (releaseStageCompleted(state, "review") || satisfiedStages.has("review")) return "review";
  return "";
}

function releaseStageCompleted(state = {}, stage) {
  return normalizeArray(state.events).some((event) => {
    const normalized = normalizeWorkflowEvent(event);
    return normalized.stage === stage
      && COMPLETION_EVENT_TYPES.has(normalized.type)
      && normalizeStringArray(normalized.evidenceIds).length > 0;
  });
}

function releaseStageCompletionTimes(state = {}) {
  const times = {};
  for (const event of releaseCompletionEvents(state)) {
    const current = times[event.stage];
    times[event.stage] = current == null ? event.time : Math.min(current, event.time);
  }
  return times;
}

function hasCompletionAtOrAfter(state = {}, stage, minTime) {
  if (minTime == null) return true;
  return releaseCompletionEvents(state).some((event) => event.stage === stage && event.time >= minTime);
}

function latestCompletionBetween(state = {}, stage, minTime, maxTime) {
  const matches = releaseCompletionEvents(state)
    .filter((event) => event.stage === stage)
    .filter((event) => minTime == null || event.time >= minTime)
    .filter((event) => maxTime == null || event.time <= maxTime)
    .sort((left, right) => right.time - left.time);
  return matches[0]?.time || null;
}

function releaseCompletionEvents(state = {}) {
  return normalizeArray(state.events).flatMap((event) => {
    const normalized = normalizeWorkflowEvent(event);
    if (!PRODUCTION_RELEASE_SEQUENCE.includes(normalized.stage)) return [];
    if (!COMPLETION_EVENT_TYPES.has(normalized.type)) return [];
    if (normalizeStringArray(normalized.evidenceIds).length === 0) return [];
    const time = Date.parse(normalized.createdAt || "");
    if (Number.isNaN(time)) return [];
    return [{ stage: normalized.stage, time }];
  });
}

function releaseStageWaived(state = {}, stage, options = {}) {
  return normalizeArray(state.waivers).some((waiver) => {
    const validation = validateWaiverRecord(waiver, options);
    if (!validation.pass) return false;
    const goals = new Set(normalizeStringArray(validation.record.affectedGoals).map(normalizeToken));
    return goals.has(stage) || goals.has(`${stage}-gate`) || goals.has("production-release-path");
  });
}

function appendNestedIssues(issues, records, validator, path, options = {}) {
  if (!Array.isArray(records)) return;
  for (const [index, record] of records.entries()) {
    issues.push(...validator(record, { ...options, path: joinPath(options.path, `${path}[${index}]`) }).issues);
  }
}

function validateDuplicateIds(records = [], code, path, issues) {
  const seen = new Set();
  for (const record of records || []) {
    if (!isPlainObject(record) || !record.id) continue;
    if (seen.has(record.id)) add(issues, code, path, `duplicate id ${record.id}`);
    seen.add(record.id);
  }
}

function validateStringArray(values = [], codeBase, path, issues, options = {}) {
  if (!Array.isArray(values) || values.length === 0) {
    if (options.required === true) add(issues, `${codeBase}-missing`, path, `${codeBase} must include at least one id`);
    return;
  }
  for (const [index, value] of values.entries()) {
    if (!safeId(value)) add(issues, `${codeBase}-invalid`, joinPath(path, `[${index}]`), `${codeBase} entries must be non-empty ASCII ids`);
  }
}

function requireSafeId(value, codeBase, path, issues) {
  if (!value) {
    add(issues, `${codeBase}-missing`, path, `${codeBase} is required`);
    return;
  }
  if (!safeId(value)) add(issues, `${codeBase}-invalid`, path, `${codeBase} must be ASCII-safe`);
}

function requireStage(value, codeBase, path, issues) {
  if (!value) {
    add(issues, `${codeBase}-missing`, path, `${codeBase} is required`);
    return;
  }
  if (!RELEASE_PATH_STAGE_SET.has(value)) add(issues, `${codeBase}-invalid`, path, `${codeBase} must be one of ${RELEASE_PATH_STAGES.join(", ")}`);
}

function requireIsoDate(value, codeBase, path, issues) {
  if (!value) {
    add(issues, `${codeBase}-missing`, path, `${codeBase} is required`);
    return;
  }
  if (Number.isNaN(Date.parse(value))) add(issues, `${codeBase}-invalid`, path, `${codeBase} must be an ISO-compatible timestamp`);
}

function normalizeNullableObject(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return isPlainObject(value) ? { ...value } : value;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(text).filter(Boolean);
}

function compactObject(value) {
  const result = {};
  for (const [key, field] of Object.entries(value)) {
    if (field === undefined) continue;
    if (Array.isArray(field) && field.length === 0) {
      result[key] = field;
      continue;
    }
    if (field !== "") result[key] = field;
  }
  return result;
}

function validationResult(record, issues) {
  return { pass: issues.length === 0, record, issues };
}

function add(issues, code, path, message) {
  issues.push({ code, path: path || "record", message });
}

function joinPath(path, child) {
  if (!path) return child || "record";
  if (!child) return path;
  return child.startsWith("[") ? `${path}${child}` : `${path}.${child}`;
}

function normalizeStage(value = "") {
  return normalizeToken(value);
}

function normalizeToken(value = "") {
  return text(value).toLowerCase().replaceAll("_", "-").replaceAll(" ", "-");
}

function normalizeCommand(value = "") {
  const command = text(value);
  if (!command) return "";
  return command.startsWith("/") ? command : `/${command}`;
}

function numberOrDefault(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function isCommandLike(value) {
  return /^\/[^\s/][^\r\n]*$/.test(String(value || "").trim());
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined);
}

function text(value) {
  return String(value ?? "").trim();
}

function safeId(value) {
  return /^[\x21-\x7e]+$/.test(String(value || ""));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
