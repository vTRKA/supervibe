const SUPERVIBE_GOALS_CONTRACT_SCHEMA_VERSION = 1;

const SUMMARY_STAGES = Object.freeze([
  "brainstorm",
  "spec-approval",
  "plan-approval",
  "loop-completion",
  "verify",
  "review",
  "ship",
]);

const SUMMARY_KINDS = Object.freeze(["pre-action", "post-artifact"]);

const SUMMARY_STAGE_SET = new Set(SUMMARY_STAGES);
const SUMMARY_KIND_SET = new Set(SUMMARY_KINDS);
const RISK_SET = new Set(["low", "medium", "high", "critical"]);

function normalizeAcceptanceCriterion(record = {}) {
  const source = isPlainObject(record) ? record : {};
  return compactObject({
    id: text(source.id),
    description: text(firstPresent(source.description, source.text, source.statement)),
    status: text(source.status) || "pending",
    evidenceIds: normalizeStringArray(firstPresent(source.evidenceIds, source.evidence_ids, source.evidence)),
  });
}

export function validateAcceptanceCriterion(record = {}, options = {}) {
  const issues = [];
  const criterion = normalizeAcceptanceCriterion(record);
  if (!isPlainObject(record)) add(issues, "acceptance-criterion-invalid", options.path, "acceptance criterion must be an object");
  requireSafeId(criterion.id, "acceptance-criterion-id", options.path, issues);
  requireText(criterion.description, "acceptance-criterion-description", options.path, issues);
  validateStringArray(criterion.evidenceIds, "acceptance-criterion-evidence", options.path, issues, { required: false });
  return validationResult(criterion, issues);
}

export function normalizeGoal(record = {}) {
  const source = isPlainObject(record) ? record : {};
  return compactObject({
    id: text(source.id),
    title: text(firstPresent(source.title, source.name)),
    status: text(source.status) || "open",
    acceptanceCriteria: normalizeArray(firstPresent(source.acceptanceCriteria, source.acceptance_criteria)).map(normalizeAcceptanceCriterion),
    evidenceIds: normalizeStringArray(firstPresent(source.evidenceIds, source.evidence_ids, source.evidence)),
  });
}

export function validateGoal(record = {}, options = {}) {
  const issues = [];
  const goal = normalizeGoal(record);
  if (!isPlainObject(record)) add(issues, "goal-record-invalid", options.path, "goal must be an object");
  requireSafeId(goal.id, "goal-record-id", options.path, issues);
  requireText(goal.title, "goal-record-title", options.path, issues);
  if (!Array.isArray(goal.acceptanceCriteria) || goal.acceptanceCriteria.length === 0) {
    add(issues, "goal-record-acceptance-criteria-missing", options.path, "goal.acceptanceCriteria must include at least one criterion");
  }
  appendNestedIssues(issues, goal.acceptanceCriteria, validateAcceptanceCriterion, "goal.acceptanceCriteria", options);
  validateStringArray(goal.evidenceIds, "goal-record-evidence", options.path, issues, { required: false });
  return validationResult(goal, issues);
}

export function normalizeChoiceRecord(record = {}) {
  const source = isPlainObject(record) ? record : {};
  const ordinal = source.ordinal === undefined || source.ordinal === null || source.ordinal === "" ? undefined : Number(source.ordinal);
  return compactObject({
    id: text(firstPresent(source.id, source.choiceId, source.choice_id)),
    label: text(firstPresent(source.label, source.title, source.text)),
    value: source.value === undefined ? undefined : source.value,
    ordinal: Number.isInteger(ordinal) ? ordinal : undefined,
    evidenceIds: normalizeStringArray(firstPresent(source.evidenceIds, source.evidence_ids, source.evidence)),
  });
}

export function validateChoiceRecord(record = {}, options = {}) {
  const issues = [];
  const choice = normalizeChoiceRecord(record);
  if (!isPlainObject(record)) add(issues, "choice-record-invalid", options.path, "choice must be an object");
  requireSafeId(choice.id, "choice-record-id", options.path, issues);
  requireText(choice.label, "choice-record-label", options.path, issues);
  if (choice.ordinal !== undefined && !Number.isInteger(choice.ordinal)) {
    add(issues, "choice-record-ordinal-invalid", options.path, "choice.ordinal must be an integer when provided");
  }
  validateStringArray(choice.evidenceIds, "choice-record-evidence", options.path, issues, { required: false });
  return validationResult(choice, issues);
}

export function normalizeQuestionRecord(record = {}) {
  const source = isPlainObject(record) ? record : {};
  return compactObject({
    id: text(source.id),
    prompt: text(firstPresent(source.prompt, source.question, source.text)),
    resumeCursor: text(firstPresent(source.resumeCursor, source.resume_cursor, source.cursor)),
    choices: normalizeArray(firstPresent(source.choices, source.options)).map(normalizeChoiceRecord),
    evidenceIds: normalizeStringArray(firstPresent(source.evidenceIds, source.evidence_ids, source.evidence)),
  });
}

export function validateQuestionRecord(record = {}, options = {}) {
  const issues = [];
  const question = normalizeQuestionRecord(record);
  if (!isPlainObject(record)) add(issues, "question-record-invalid", options.path, "question must be an object");
  requireSafeId(question.id, "question-record-id", options.path, issues);
  requireText(question.prompt, "question-record-prompt", options.path, issues);
  requireSafeId(question.resumeCursor, "question-record-resume-cursor", options.path, issues, {
    missingCode: "question-record-resume-cursor-missing",
  });
  if (!Array.isArray(question.choices) || question.choices.length === 0) {
    add(issues, "question-record-choices-missing", options.path, "question.choices must include at least one stable choice");
  }
  appendNestedIssues(issues, question.choices, validateChoiceRecord, "question.choices", options);
  validateDuplicateIds(question.choices, "question-record-choice-duplicate", options.path, issues);
  validateStringArray(question.evidenceIds, "question-record-evidence", options.path, issues, { required: false });
  return validationResult(question, issues);
}

export function normalizeApprovalRecord(record = {}) {
  const source = isPlainObject(record) ? record : {};
  return compactObject({
    id: text(source.id),
    targetId: text(firstPresent(source.targetId, source.target_id)),
    targetType: text(firstPresent(source.targetType, source.target_type)),
    actor: text(source.actor),
    approvedAt: text(firstPresent(source.approvedAt, source.approved_at)),
    expiresAt: text(firstPresent(source.expiresAt, source.expires_at)),
    evidenceIds: normalizeStringArray(firstPresent(source.evidenceIds, source.evidence_ids, source.evidence)),
    decision: text(source.decision) || "approved",
    notes: text(source.notes),
  });
}

export function validateApprovalRecord(record = {}, options = {}) {
  const issues = [];
  const approval = normalizeApprovalRecord(record);
  if (!isPlainObject(record)) add(issues, "approval-record-invalid", options.path, "approval must be an object");
  requireSafeId(approval.id, "approval-record-id", options.path, issues);
  requireSafeId(approval.targetId, "approval-record-target-id", options.path, issues);
  requireSafeId(approval.targetType, "approval-record-target-type", options.path, issues);
  requireSafeId(approval.actor, "approval-record-actor", options.path, issues);
  requireIsoDate(approval.approvedAt, "approval-record-approved-at", options.path, issues);
  requireIsoDate(approval.expiresAt, "approval-record-expires-at", options.path, issues);
  validateStringArray(approval.evidenceIds, "approval-record-evidence", options.path, issues, { required: true });
  if (approval.expiresAt && options.now && Date.parse(approval.expiresAt) < Date.parse(options.now)) {
    add(issues, "approval-record-stale", options.path, "approval.expiresAt is earlier than the validation time");
  }
  return validationResult(approval, issues);
}

export function normalizeWaiverRecord(record = {}) {
  const source = isPlainObject(record) ? record : {};
  return compactObject({
    id: text(source.id),
    risk: text(source.risk).toLowerCase(),
    affectedGoals: normalizeStringArray(firstPresent(source.affectedGoals, source.affected_goals, source.goals, source.goalIds)),
    evidenceIds: normalizeStringArray(firstPresent(source.evidenceIds, source.evidence_ids, source.evidence)),
    approval: isPlainObject(source.approval) ? normalizeApprovalRecord(source.approval) : source.approval ?? null,
    revisitTrigger: text(firstPresent(source.revisitTrigger, source.revisit_trigger)),
    releaseImpact: text(firstPresent(source.releaseImpact, source.release_impact)),
    notes: text(source.notes),
  });
}

export function validateWaiverRecord(record = {}, options = {}) {
  const issues = [];
  const waiver = normalizeWaiverRecord(record);
  if (!isPlainObject(record)) add(issues, "waiver-record-invalid", options.path, "waiver must be an object");
  requireSafeId(waiver.id, "waiver-record-id", options.path, issues);
  if (!waiver.risk) add(issues, "waiver-record-risk-missing", options.path, "waiver.risk is required");
  else if (!RISK_SET.has(waiver.risk)) add(issues, "waiver-record-risk-invalid", options.path, "waiver.risk must be low, medium, high, or critical");
  validateStringArray(waiver.affectedGoals, "waiver-record-affected-goals", options.path, issues, {
    required: true,
    missingCode: "waiver-record-affected-goals-missing",
  });
  validateStringArray(waiver.evidenceIds, "waiver-record-evidence", options.path, issues, {
    required: true,
    missingCode: "waiver-record-evidence-missing",
  });
  if (!isPlainObject(waiver.approval)) {
    add(issues, "waiver-record-approval-missing", options.path, "waiver.approval is required");
  } else {
    issues.push(...validateApprovalRecord(waiver.approval, { ...options, path: joinPath(options.path, "approval") }).issues);
  }
  requireText(waiver.revisitTrigger, "waiver-record-revisit-trigger", options.path, issues, {
    missingCode: "waiver-record-revisit-trigger-missing",
  });
  requireText(waiver.releaseImpact, "waiver-record-release-impact", options.path, issues, {
    missingCode: "waiver-record-release-impact-missing",
  });
  return validationResult(waiver, issues);
}

export function normalizeEvidenceMap(record = {}) {
  const source = Array.isArray(record)
    ? Object.fromEntries(record.filter(isPlainObject).map((entry) => [text(entry.id), entry]))
    : isPlainObject(record) ? record : {};
  const normalized = {};
  for (const key of Object.keys(source).sort()) {
    const entry = isPlainObject(source[key]) ? source[key] : {};
    normalized[key] = compactObject({
      id: text(entry.id) || key,
      kind: text(firstPresent(entry.kind, entry.type)),
      path: text(entry.path),
      hash: text(entry.hash),
      summary: text(entry.summary),
      artifactIds: normalizeStringArray(firstPresent(entry.artifactIds, entry.artifact_ids, entry.artifacts)),
    });
  }
  return normalized;
}

export function validateEvidenceMap(record = {}, options = {}) {
  const issues = [];
  const evidence = normalizeEvidenceMap(record);
  if (!isPlainObject(record) && !Array.isArray(record)) add(issues, "evidence-map-invalid", options.path, "evidence map must be an object or array");
  for (const [id, entry] of Object.entries(evidence)) {
    const path = joinPath(options.path, id);
    requireSafeId(id, "evidence-map-id", path, issues);
    requireText(entry.kind, "evidence-map-kind", path, issues);
    requireText(entry.path, "evidence-map-path", path, issues);
    requireText(entry.hash, "evidence-map-hash", path, issues);
  }
  return validationResult(evidence, issues);
}

export function normalizeArtifactManifest(record = {}) {
  const source = isPlainObject(record) ? record : {};
  return compactObject({
    id: text(source.id) || "artifact-manifest",
    artifacts: normalizeArray(source.artifacts).map((artifact) => {
      const item = isPlainObject(artifact) ? artifact : {};
      return compactObject({
        id: text(item.id),
        path: text(firstPresent(item.path, item.file)),
        hash: text(item.hash),
        kind: text(firstPresent(item.kind, item.type)),
        evidenceIds: normalizeStringArray(firstPresent(item.evidenceIds, item.evidence_ids, item.evidence)),
      });
    }),
  });
}

export function validateArtifactManifest(record = {}, options = {}) {
  const issues = [];
  const manifest = normalizeArtifactManifest(record);
  if (!isPlainObject(record)) add(issues, "artifact-manifest-invalid", options.path, "artifact manifest must be an object");
  requireSafeId(manifest.id, "artifact-manifest-id", options.path, issues);
  if (!Array.isArray(manifest.artifacts)) add(issues, "artifact-manifest-artifacts-invalid", options.path, "artifactManifest.artifacts must be an array");
  for (const [index, artifact] of manifest.artifacts.entries()) {
    const path = joinPath(options.path, `artifacts[${index}]`);
    requireSafeId(artifact.id, "artifact-manifest-artifact-id", path, issues);
    requireText(artifact.path, "artifact-manifest-artifact-path", path, issues);
    if (!artifact.hash) add(issues, "artifact-manifest-artifact-hash-missing", path, "artifact.hash is required");
    validateStringArray(artifact.evidenceIds, "artifact-manifest-artifact-evidence", path, issues, { required: false });
  }
  validateDuplicateIds(manifest.artifacts, "artifact-manifest-artifact-duplicate", options.path, issues);
  return validationResult(manifest, issues);
}

export function normalizeStageSummaryRecord(record = {}) {
  const source = isPlainObject(record) ? record : {};
  return compactObject({
    id: text(source.id),
    stage: normalizeSummaryStage(source.stage),
    kind: text(firstPresent(source.kind, source.summaryKind, source.summary_kind)),
    summary: text(source.summary),
    createdAt: text(firstPresent(source.createdAt, source.created_at)),
    evidenceIds: normalizeStringArray(firstPresent(source.evidenceIds, source.evidence_ids, source.evidence)),
    artifactIds: normalizeStringArray(firstPresent(source.artifactIds, source.artifact_ids, source.artifacts)),
  });
}

export function validateStageSummaryRecord(record = {}, options = {}) {
  const issues = [];
  const summary = normalizeStageSummaryRecord(record);
  if (!isPlainObject(record)) add(issues, "stage-summary-record-invalid", options.path, "stage summary must be an object");
  requireSafeId(summary.id, "stage-summary-record-id", options.path, issues);
  if (!summary.stage) add(issues, "stage-summary-record-stage-missing", options.path, "stage summary stage is required");
  else if (!SUMMARY_STAGE_SET.has(summary.stage)) add(issues, "stage-summary-record-stage-invalid", options.path, `stage summary stage must be one of ${SUMMARY_STAGES.join(", ")}`);
  if (!summary.kind) add(issues, "stage-summary-record-kind-missing", options.path, "stage summary kind is required");
  else if (!SUMMARY_KIND_SET.has(summary.kind)) add(issues, "stage-summary-record-kind-invalid", options.path, "stage summary kind must be pre-action or post-artifact");
  requireText(summary.summary, "stage-summary-record-summary", options.path, issues);
  requireIsoDate(summary.createdAt, "stage-summary-record-created-at", options.path, issues);
  validateStringArray(summary.evidenceIds, "stage-summary-record-evidence", options.path, issues, { required: false });
  validateStringArray(summary.artifactIds, "stage-summary-record-artifacts", options.path, issues, { required: false });
  return validationResult(summary, issues);
}

export function normalizeSpecialistEvidenceRecord(record = {}) {
  const source = isPlainObject(record) ? record : {};
  const role = text(firstPresent(source.role, source.specialistRole, source.specialist_role, source.subjectType, source.subject_type));
  const receiptId = text(firstPresent(source.receiptId, source.receipt_id, source.workflowReceiptId, source.workflow_receipt_id));
  const outputArtifact = text(firstPresent(source.outputArtifact, source.output_artifact, source.artifact, source.artifactPath, source.artifact_path));
  const hostInvocation = isPlainObject(source.hostInvocation) ? source.hostInvocation : {};
  const invocationId = text(firstPresent(source.invocationId, source.invocation_id, source.hostInvocationId, source.host_invocation_id, hostInvocation.invocationId, hostInvocation.invocation_id, source.agentId, source.agent_id));
  return compactObject({
    id: text(firstPresent(source.id, source.evidenceId, source.evidence_id, receiptId)),
    specialist: text(firstPresent(source.specialist, source.agent, source.worker, role)),
    role,
    source: text(firstPresent(source.source, source.hostInvocationSource, source.host_invocation_source, hostInvocation.source, receiptId ? "runtime-receipt" : "")),
    invocationId,
    receiptId,
    outputArtifact,
    artifactHash: text(firstPresent(source.artifactHash, source.artifact_hash, source.hash, source.sha256)),
    confidence: Number.isFinite(Number(source.confidence)) ? Number(source.confidence) : undefined,
    decisions: normalizeStringArray(source.decisions),
    risks: normalizeStringArray(source.risks),
    acceptanceMapping: normalizeArray(firstPresent(source.acceptanceMapping, source.acceptance_mapping)).map(normalizeSpecialistAcceptanceMapping),
    unresolvedGaps: normalizeStringArray(firstPresent(source.unresolvedGaps, source.unresolved_gaps, source.gaps)),
    evidenceIds: normalizeStringArray(firstPresent(source.evidenceIds, source.evidence_ids, source.evidence, receiptId ? [receiptId] : [])),
    artifactIds: normalizeStringArray(firstPresent(source.artifactIds, source.artifact_ids, source.artifacts)),
  });
}

export function validateSpecialistEvidenceRecord(record = {}, options = {}) {
  const issues = [];
  const specialist = normalizeSpecialistEvidenceRecord(record);
  if (!isPlainObject(record)) add(issues, "specialist-evidence-record-invalid", options.path, "specialist evidence must be an object");
  requireSafeId(specialist.id, "specialist-evidence-record-id", options.path, issues);
  requireSafeId(specialist.specialist, "specialist-evidence-record-specialist", options.path, issues);
  requireSafeId(specialist.source, "specialist-evidence-record-source", options.path, issues);
  if (!specialist.invocationId && !specialist.receiptId) {
    add(issues, "specialist-evidence-record-proof-missing", options.path, "specialist evidence requires invocationId or receiptId");
  } else {
    if (specialist.invocationId) requireSafeId(specialist.invocationId, "specialist-evidence-record-invocation-id", options.path, issues);
    if (specialist.receiptId) requireSafeId(specialist.receiptId, "specialist-evidence-record-receipt-id", options.path, issues);
  }
  validateStringArray(specialist.evidenceIds, "specialist-evidence-record-evidence", options.path, issues, { required: true });
  validateStringArray(specialist.artifactIds, "specialist-evidence-record-artifacts", options.path, issues, { required: false });
  return validationResult(specialist, issues);
}

export function normalizeAnswerRecord(record = {}) {
  const source = isPlainObject(record) ? record : {};
  return compactObject({
    questionId: text(firstPresent(source.questionId, source.question_id)),
    choiceId: text(firstPresent(source.choiceId, source.choice_id)),
    actor: text(source.actor),
    answeredAt: text(firstPresent(source.answeredAt, source.answered_at)),
    receiptId: text(firstPresent(source.receiptId, source.receipt_id)),
  });
}

export function validateAnswerRecord(record = {}, options = {}) {
  const issues = [];
  const answer = normalizeAnswerRecord(record);
  if (!isPlainObject(record)) add(issues, "answer-record-invalid", options.path, "answer must be an object");
  requireSafeId(answer.questionId, "answer-record-question-id", options.path, issues);
  requireSafeId(answer.choiceId, "answer-record-choice-id", options.path, issues);
  requireSafeId(answer.actor, "answer-record-actor", options.path, issues);
  requireIsoDate(answer.answeredAt, "answer-record-answered-at", options.path, issues);
  return validationResult(answer, issues);
}

function appendNestedIssues(issues, records, validator, path, options = {}) {
  if (!Array.isArray(records)) return;
  for (const [index, record] of records.entries()) {
    issues.push(...validator(record, { ...options, path: joinPath(options.path, `${path}[${index}]`) }).issues);
  }
}

function normalizeSpecialistAcceptanceMapping(record = {}) {
  const source = isPlainObject(record) ? record : {};
  return compactObject({
    criterionId: text(firstPresent(source.criterionId, source.criterion_id, source.acceptanceId, source.acceptance_id)),
    evidence: text(firstPresent(source.evidence, source.evidenceId, source.evidence_id, source.summary)),
  });
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
    if (options.required === true) add(issues, options.missingCode || `${codeBase}-missing`, path, `${codeBase} must include at least one id`);
    return;
  }
  for (const [index, value] of values.entries()) {
    if (!safeId(value)) add(issues, `${codeBase}-invalid`, joinPath(path, `[${index}]`), `${codeBase} entries must be non-empty ASCII ids`);
  }
}

function requireSafeId(value, codeBase, path, issues, options = {}) {
  if (!value) {
    add(issues, options.missingCode || `${codeBase}-missing`, path, `${codeBase} is required`);
    return;
  }
  if (!safeId(value)) add(issues, `${codeBase}-invalid`, path, `${codeBase} must be ASCII-safe`);
}

function requireText(value, codeBase, path, issues, options = {}) {
  if (!value) {
    add(issues, options.missingCode || `${codeBase}-missing`, path, `${codeBase} is required`);
    return;
  }
  if (!asciiPrintable(value)) add(issues, `${codeBase}-invalid`, path, `${codeBase} must be ASCII-safe text`);
}

function requireIsoDate(value, codeBase, path, issues) {
  if (!value) {
    add(issues, `${codeBase}-missing`, path, `${codeBase} is required`);
    return;
  }
  if (!asciiPrintable(value) || Number.isNaN(Date.parse(value))) add(issues, `${codeBase}-invalid`, path, `${codeBase} must be an ISO-compatible timestamp`);
}

function normalizeSummaryStage(value = "") {
  return text(value).toLowerCase().replaceAll("_", "-").replaceAll(" ", "-");
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

function firstPresent(...values) {
  return values.find((value) => value !== undefined);
}

function text(value) {
  return String(value ?? "").trim();
}

function safeId(value) {
  return /^[\x21-\x7e]+$/.test(String(value || ""));
}

function asciiPrintable(value) {
  return /^[\x09\x0a\x0d\x20-\x7e]+$/.test(String(value || ""));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
