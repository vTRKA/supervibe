import { createHash } from "node:crypto";

import {
  WORKFLOW_SUMMARY_CONTRACT_VERSION,
  WORKFLOW_SUMMARY_POST_STAGES,
  WORKFLOW_SUMMARY_STAGE_CONFIG,
  WORKFLOW_SUMMARY_STAGES,
  normalizeWorkflowSummaryStage as normalizeContractWorkflowSummaryStage,
} from "./workflow-summary-contract.mjs";

const STAGE_DECISION_CARD_SCHEMA_VERSION = 1;
export const WORKFLOW_SUMMARY_ARTIFACT_SCHEMA_VERSION = 1;
export const WORKFLOW_SUMMARY_ARTIFACT_SCHEMA_PATH = "docs/templates/workflow-summary-artifact.schema.json";
export const WORKFLOW_SUMMARY_ARTIFACT_ROOT = ".supervibe/artifacts/summaries";
export const WORKFLOW_SUMMARY_APPROVAL_SOURCE = "latest-user-gate";

const DEFAULT_SUMMARY_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const HASH_PREFIX = "sha256:";
const SUMMARY_STAGE_CONFIG = WORKFLOW_SUMMARY_STAGE_CONFIG;

export function buildStageDecisionCard(input = {}) {
  const record = normalizeCardInput(input);
  const createdAt = text(input.createdAt) || new Date().toISOString();
  const sourceArtifact = normalizeSourceArtifact(firstPresent(input.sourceArtifact, input.summaryArtifact, input.specArtifact, input.planArtifact), {
    stage: record.currentStage,
    createdAt,
  });
  const approvalBinding = normalizeDecisionCardApprovalBinding(input.approvalBinding, {
    record,
    sourceArtifact,
    artifactHash: firstPresent(input.artifactHash, input.summaryHash),
  });
  const boundRecord = { ...record, sourceArtifact, approvalBinding };
  const primaryUx = formatPrimaryDecisionCard(boundRecord);
  const machineHandoff = formatMachineHandoff(boundRecord);
  return {
    schemaVersion: STAGE_DECISION_CARD_SCHEMA_VERSION,
    contractVersion: "stage-decision-card-v1",
    ...boundRecord,
    primaryUx,
    machineHandoff,
  };
}

export function formatStageDecisionCard(input = {}) {
  const card = input.primaryUx && input.machineHandoff ? input : buildStageDecisionCard(input);
  return [
    card.primaryUx,
    "",
    "Machine Handoff",
    "```text",
    card.machineHandoff,
    "```",
  ].join("\n");
}

export function durableWorkflowSummaryPath({ workflowId, stage } = {}) {
  const normalizedStage = normalizeWorkflowSummaryStage(stage);
  const normalizedWorkflowId = normalizeWorkflowId(workflowId);
  return `${WORKFLOW_SUMMARY_ARTIFACT_ROOT}/${normalizedWorkflowId}/${SUMMARY_STAGE_CONFIG[normalizedStage].fileName}`;
}

export function buildWorkflowSummaryArtifact(input = {}) {
  const stage = normalizeWorkflowSummaryStage(input.stage);
  const config = SUMMARY_STAGE_CONFIG[stage];
  const now = toDate(input.createdAt || input.now) || new Date();
  const createdAt = now.toISOString();
  const expiresAt = (toDate(input.expiresAt) || new Date(now.getTime() + DEFAULT_SUMMARY_EXPIRY_MS)).toISOString();
  const sourcePromptText = text(firstPresent(input.sourcePrompt, input.prompt, input.request, input.userRequest));
  const sourcePromptHash = normalizeHash(firstPresent(input.sourcePromptHash, input.promptHash)) || hashText(sourcePromptText);
  const workflowId = normalizeWorkflowId(firstPresent(input.workflowId, input.workflow, input.planId, sourcePromptHash.slice(-12)));
  const storagePath = normalizePath(text(input.storagePath) || durableWorkflowSummaryPath({ workflowId, stage }));
  const sourceArtifact = normalizeSourceArtifact(firstPresent(input.sourceArtifact, input.specArtifact, input.planArtifact), { stage, createdAt });
  const choices = normalizeSummaryChoices(input.choices, stage);
  const decisionSummary = normalizeDecisionSummary(input.decisionSummary || input, { stage, config, choices });
  const visualSummary = normalizeVisualSummary(input.visualSummary, { stage, config, sourceArtifact, storagePath, decisionSummary });
  const staleState = normalizeStaleState(input.staleState, { stage, sourceArtifact, createdAt });
  const baseArtifact = {
    schemaVersion: WORKFLOW_SUMMARY_ARTIFACT_SCHEMA_VERSION,
    contractVersion: WORKFLOW_SUMMARY_CONTRACT_VERSION,
    artifactKind: "workflow-summary",
    summaryId: text(input.summaryId) || `summary-${hashText(`${workflowId}:${stage}:${sourcePromptHash}`).slice(HASH_PREFIX.length, HASH_PREFIX.length + 12)}`,
    workflowId,
    stage,
    stageOrder: config.order,
    title: text(input.title) || config.title,
    createdAt,
    expiresAt,
    storagePath,
    sourcePrompt: {
      hash: sourcePromptHash,
      capturedAt: createdAt,
      excerpt: summarizeText(sourcePromptText, 240),
    },
    sourceArtifact,
    summary: {
      objective: text(input.objective || input.summary?.objective),
      scope: normalizeStringArray(firstPresent(input.scope, input.summary?.scope)),
      nonGoals: normalizeStringArray(firstPresent(input.nonGoals, input.summary?.nonGoals)),
    },
    approvedScope: normalizeStringArray(input.approvedScope),
    assumptions: normalizeStringArray(input.assumptions),
    planningAssumptions: normalizeStringArray(input.planningAssumptions),
    constraints: normalizeStringArray(input.constraints),
    risks: normalizeStringArray(input.risks),
    missingFacts: normalizeStringArray(input.missingFacts),
    visualSummary,
    decisionSummary,
    staleState,
    choices,
    approvalState: normalizeSummaryApprovalState(input.approvalState, {
      stage,
      sourcePromptHash,
      expiresAt,
    }),
    evidenceAppendix: normalizeEvidenceAppendix(input.evidenceAppendix, {
      storagePath,
      sourcePromptHash,
      schemaPath: WORKFLOW_SUMMARY_ARTIFACT_SCHEMA_PATH,
      contractVersion: WORKFLOW_SUMMARY_CONTRACT_VERSION,
      sourceArtifact,
      items: input.evidence,
    }),
  };
  const artifactHash = hashWorkflowSummaryArtifact(baseArtifact);
  return {
    ...baseArtifact,
    artifactHash,
    approvalState: {
      ...baseArtifact.approvalState,
      artifactHash,
    },
    evidenceAppendix: {
      ...baseArtifact.evidenceAppendix,
      artifactHash,
    },
  };
}

export function formatWorkflowSummaryArtifact(input = {}) {
  const artifact = input?.artifactKind === "workflow-summary" ? input : buildWorkflowSummaryArtifact(input);
  const lines = [
    "Workflow Summary",
    `Stage: ${artifact.stage}`,
    `Title: ${artifact.title}`,
    `Storage path: ${artifact.storagePath}`,
    `Source prompt hash: ${artifact.sourcePrompt?.hash || "missing"}`,
    `Source artifact: ${artifact.sourceArtifact?.path || "none"}`,
    `Source artifact hash: ${artifact.sourceArtifact?.hash || "missing"}`,
    `Artifact hash: ${artifact.artifactHash || "missing"}`,
    `Expires at: ${artifact.expiresAt || "missing"}`,
    `Approval state: ${artifact.approvalState?.status || "missing"}`,
  ];
  if (artifact.summary?.objective) lines.push(`Objective: ${artifact.summary.objective}`);
  lines.push("", "Summary Table", "| Field | Value |", "| --- | --- |");
  for (const row of artifact.visualSummary?.summaryTable || []) lines.push(`| ${escapeMarkdownCell(row.label)} | ${escapeMarkdownCell(row.value)} |`);
  lines.push("", "Lifecycle Map", "```text");
  lines.push(...(artifact.visualSummary?.asciiMap || []));
  lines.push("```");
  lines.push("", "What Changed And Why");
  appendList(lines, "Added and why", artifact.decisionSummary?.addedAndWhy);
  appendList(lines, "Deferred and why", artifact.decisionSummary?.deferredAndWhy);
  if (artifact.decisionSummary?.validationResult) lines.push(`Validation result: ${artifact.decisionSummary.validationResult}`);
  if (artifact.decisionSummary?.nextRecommendedCommand) lines.push(`Next recommended command: ${artifact.decisionSummary.nextRecommendedCommand}`);
  appendList(lines, "Next user actions", artifact.decisionSummary?.nextUserActions);
  appendList(lines, "Approved scope", artifact.approvedScope);
  appendList(lines, "Assumptions", artifact.assumptions);
  appendList(lines, "Planning assumptions", artifact.planningAssumptions);
  appendList(lines, "Constraints", artifact.constraints);
  appendList(lines, "Risks", artifact.risks);
  appendList(lines, "Missing facts", artifact.missingFacts);
  lines.push("Choices:");
  for (const choice of artifact.choices || []) {
    const recommended = choice.recommended ? " (recommended)" : "";
    lines.push(`- ${choice.id}: ${choice.label}${recommended}`);
  }
  lines.push("Evidence appendix:");
  lines.push(`- schema: ${artifact.evidenceAppendix?.schemaPath || WORKFLOW_SUMMARY_ARTIFACT_SCHEMA_PATH}`);
  lines.push(`- contract: ${artifact.evidenceAppendix?.contractVersion || WORKFLOW_SUMMARY_CONTRACT_VERSION}`);
  lines.push(`- storage: ${artifact.evidenceAppendix?.storagePath || artifact.storagePath}`);
  lines.push(`- sourcePromptHash: ${artifact.evidenceAppendix?.sourcePromptHash || artifact.sourcePrompt?.hash || "missing"}`);
  lines.push(`- sourceArtifactHash: ${artifact.evidenceAppendix?.sourceArtifactHash || artifact.sourceArtifact?.hash || "missing"}`);
  lines.push(`- artifactHash: ${artifact.evidenceAppendix?.artifactHash || artifact.artifactHash || "missing"}`);
  for (const item of artifact.evidenceAppendix?.items || []) {
    lines.push(`- evidence: ${item}`);
  }
  return lines.join("\n");
}

export function validateWorkflowSummaryArtifact(artifact = {}) {
  const issues = [];
  if (!isPlainObject(artifact)) return ["summary artifact must be an object"];
  if (artifact.schemaVersion !== WORKFLOW_SUMMARY_ARTIFACT_SCHEMA_VERSION) {
    issues.push(`schemaVersion must be ${WORKFLOW_SUMMARY_ARTIFACT_SCHEMA_VERSION}`);
  }
  if (artifact.artifactKind !== "workflow-summary") issues.push("artifactKind must be workflow-summary");
  const stage = artifact.stage;
  if (!SUMMARY_STAGE_CONFIG[stage]) issues.push(`WSA_STAGE: stage must be one of ${WORKFLOW_SUMMARY_STAGES.join(", ")}`);
  if (!text(artifact.workflowId)) issues.push("workflowId is required");
  if (!text(artifact.summaryId)) issues.push("summaryId is required");
  if (!text(artifact.storagePath)) issues.push("storagePath is required");
  if (stage && artifact.workflowId) {
    const expectedPath = durableWorkflowSummaryPath({ workflowId: artifact.workflowId, stage });
    if (normalizePath(artifact.storagePath) !== expectedPath) {
      issues.push(`storagePath must be ${expectedPath}`);
    }
  }
  if (!isPlainObject(artifact.sourcePrompt)) issues.push("sourcePrompt is required");
  if (!isSha256Hash(artifact.sourcePrompt?.hash)) issues.push("sourcePrompt.hash must be a sha256 hash");
  if (!text(artifact.sourcePrompt?.capturedAt)) issues.push("sourcePrompt.capturedAt is required");
  if (!text(artifact.expiresAt)) issues.push("expiresAt is required");
  issues.push(...validateSourceArtifact(artifact.sourceArtifact, stage));
  issues.push(...validateVisualSummary(artifact.visualSummary));
  issues.push(...validateDecisionSummary(artifact.decisionSummary, stage));
  issues.push(...validateStaleState(artifact.staleState, stage));
  if (!isPlainObject(artifact.approvalState)) issues.push("approvalState is required");
  if (!["pending", "approved", "rejected", "expired"].includes(artifact.approvalState?.status)) {
    issues.push("approvalState.status must be pending, approved, rejected, or expired");
  }
  if (artifact.approvalState?.sourcePromptHash !== artifact.sourcePrompt?.hash) {
    issues.push("approvalState.sourcePromptHash must match sourcePrompt.hash");
  }
  if (artifact.approvalState?.expiresAt !== artifact.expiresAt) {
    issues.push("approvalState.expiresAt must match expiresAt");
  }
  issues.push(...validateSummaryChoices(artifact.choices, stage));
  if (!isPlainObject(artifact.evidenceAppendix)) issues.push("evidenceAppendix is required");
  if (artifact.evidenceAppendix?.schemaPath !== WORKFLOW_SUMMARY_ARTIFACT_SCHEMA_PATH) {
    issues.push(`evidenceAppendix.schemaPath must be ${WORKFLOW_SUMMARY_ARTIFACT_SCHEMA_PATH}`);
  }
  if (artifact.evidenceAppendix?.storagePath !== artifact.storagePath) {
    issues.push("evidenceAppendix.storagePath must match storagePath");
  }
  if (artifact.evidenceAppendix?.sourcePromptHash !== artifact.sourcePrompt?.hash) {
    issues.push("evidenceAppendix.sourcePromptHash must match sourcePrompt.hash");
  }
  if (WORKFLOW_SUMMARY_POST_STAGES.includes(stage) && artifact.evidenceAppendix?.sourceArtifactHash !== artifact.sourceArtifact?.hash) {
    issues.push("WSA_EVIDENCE_SOURCE_ARTIFACT_HASH: evidenceAppendix.sourceArtifactHash must match sourceArtifact.hash");
  }
  if (stage === "pre-spec") {
    if (!Array.isArray(artifact.assumptions)) issues.push("pre-spec summary requires assumptions");
    if (!Array.isArray(artifact.risks)) issues.push("pre-spec summary requires risks");
    if (!Array.isArray(artifact.missingFacts)) issues.push("pre-spec summary requires missingFacts");
  }
  if (stage === "pre-plan") {
    if (!Array.isArray(artifact.approvedScope)) issues.push("pre-plan summary requires approvedScope");
    if (!Array.isArray(artifact.constraints)) issues.push("pre-plan summary requires constraints");
    if (!Array.isArray(artifact.planningAssumptions)) issues.push("pre-plan summary requires planningAssumptions");
  }
  if (!isSha256Hash(artifact.artifactHash)) {
    issues.push("artifactHash must be a sha256 hash");
  } else {
    const expectedHash = hashWorkflowSummaryArtifact(artifact);
    if (artifact.artifactHash !== expectedHash) issues.push("artifactHash does not match canonical artifact content");
    if (artifact.approvalState?.artifactHash !== artifact.artifactHash) {
      issues.push("approvalState.artifactHash must match artifactHash");
    }
    if (artifact.evidenceAppendix?.artifactHash !== artifact.artifactHash) {
      issues.push("evidenceAppendix.artifactHash must match artifactHash");
    }
  }
  return issues;
}

export function evaluateWorkflowSummaryApproval({
  artifact,
  approval = {},
  latestUserMessage = "",
  sourcePrompt = undefined,
  sourcePromptHash = undefined,
  selectedChoiceId = undefined,
  artifactHash = undefined,
  now = new Date(),
} = {}) {
  const summary = artifact?.artifactKind === "workflow-summary" ? artifact : buildWorkflowSummaryArtifact(artifact || {});
  const issues = validateWorkflowSummaryArtifact(summary);
  if (issues.length) return approvalResult(false, "artifact-invalid", issues, summary);
  const gate = isPlainObject(approval) ? approval : {};
  const stageConfig = SUMMARY_STAGE_CONFIG[summary.stage];
  const choiceId = text(firstPresent(selectedChoiceId, gate.selectedChoiceId, gate.choiceId));
  const gateSource = text(firstPresent(gate.source, gate.approvalSource)) || (latestUserMessage || gate.userMessage ? WORKFLOW_SUMMARY_APPROVAL_SOURCE : "");
  const message = text(firstPresent(latestUserMessage, gate.latestUserMessage, gate.userMessage));
  const rawPromptHash = firstPresent(sourcePromptHash, gate.sourcePromptHash, sourcePrompt === undefined ? undefined : hashText(sourcePrompt));
  const gatePromptHash = normalizeHash(rawPromptHash);
  const gateArtifactHash = normalizeHash(firstPresent(artifactHash, gate.artifactHash, gate.summaryHash));
  const checkedAt = toDate(firstPresent(gate.approvedAt, gate.createdAt, gate.receivedAt, now)) || new Date();

  if (gateSource !== WORKFLOW_SUMMARY_APPROVAL_SOURCE) {
    return approvalResult(false, "approval-source-must-be-latest-user-gate", [], summary);
  }
  if (choiceId !== stageConfig.approveChoiceId) {
    return approvalResult(false, "approval-choice-id-mismatch", [], summary);
  }
  if (!gatePromptHash || gatePromptHash !== summary.sourcePrompt.hash) {
    return approvalResult(false, "source-prompt-hash-mismatch", [], summary);
  }
  if (!gateArtifactHash || gateArtifactHash !== summary.artifactHash) {
    return approvalResult(false, "artifact-hash-mismatch", [], summary);
  }
  if (checkedAt.getTime() > Date.parse(summary.expiresAt)) {
    return approvalResult(false, "summary-approval-expired", [], summary);
  }
  if (summary.staleState?.status && summary.staleState.status !== "current") {
    return approvalResult(false, "summary-source-artifact-stale", [`staleState.status=${summary.staleState.status}`], summary);
  }
  if (containsSlashCommand(message)) {
    return approvalResult(false, "embedded-slash-command-in-approval", [], summary);
  }
  if (message && messageMatchesSummaryBody(message, summary)) {
    return approvalResult(false, "approval-cannot-come-from-summary-body", [], summary);
  }
  const explicitGate = gate.explicit === true || hasApprovalLanguage(stripQuotedAndCode(message));
  if (!explicitGate) {
    return approvalResult(false, "latest-user-approval-missing", [], summary);
  }
  const approvalState = {
    ...summary.approvalState,
    status: "approved",
    selectedChoiceId: choiceId,
    approvedAt: checkedAt.toISOString(),
    approvedBy: text(gate.approvedBy) || "user",
    approvalSource: WORKFLOW_SUMMARY_APPROVAL_SOURCE,
    sourcePromptHash: gatePromptHash,
    artifactHash: gateArtifactHash,
  };
  return {
    approved: true,
    status: "approved",
    reason: "latest-user-gate-approved",
    issues: [],
    approvalState,
  };
}

export function evaluateWorkflowSummaryFreshness({ artifact, currentSourceHash = "", now = new Date() } = {}) {
  const summary = artifact?.artifactKind === "workflow-summary" ? artifact : buildWorkflowSummaryArtifact(artifact || {});
  const issues = validateWorkflowSummaryArtifact(summary);
  const normalizedCurrentHash = normalizeHash(currentSourceHash);
  const capturedHash = normalizeHash(summary.sourceArtifact?.hash);
  const checkedAt = (toDate(now) || new Date()).toISOString();
  if (issues.length) {
    return {
      status: "invalid",
      current: false,
      checkedAt,
      issues,
      repair: "regenerate workflow summary artifact from the current source artifact",
    };
  }
  if (WORKFLOW_SUMMARY_POST_STAGES.includes(summary.stage) && !capturedHash) {
    return {
      status: "unknown",
      current: false,
      checkedAt,
      issues: ["sourceArtifact.hash missing"],
      repair: "capture source artifact hash before approving post-stage summary",
    };
  }
  if (normalizedCurrentHash && capturedHash && normalizedCurrentHash !== capturedHash) {
    return {
      status: "stale",
      current: false,
      checkedAt,
      sourceArtifactHash: capturedHash,
      currentSourceHash: normalizedCurrentHash,
      issues: ["source artifact hash changed after summary creation"],
      repair: "regenerate post-stage summary from the current source artifact and re-request approval",
    };
  }
  return {
    status: "current",
    current: true,
    checkedAt,
    sourceArtifactHash: capturedHash,
    issues: [],
    repair: "none",
  };
}

export function hashWorkflowSummaryArtifact(artifact = {}) {
  const canonical = cloneWithoutArtifactHashes(artifact);
  return hashText(stableStringify(canonical));
}

export function workflowSummaryStageChoices(stage) {
  const normalizedStage = normalizeWorkflowSummaryStage(stage);
  return SUMMARY_STAGE_CONFIG[normalizedStage].choices.map((choice, index) => ({
    ...choice,
    ordinal: index + 1,
  }));
}

function normalizeCardInput(input = {}) {
  const source = isPlainObject(input) ? input : {};
  const choices = normalizeChoices(source.choices || source.nextUserActions || source.options);
  return {
    workflow: text(source.workflow) || "workflow",
    currentStage: text(firstPresent(source.currentStage, source.stage)) || "stage",
    artifact: text(source.artifact) || "none",
    recommendation: text(source.recommendation) || "Choose the next workflow action.",
    why: text(firstPresent(source.why, source.rationale)),
    question: normalizeQuestion(source.question),
    resumeCursor: text(firstPresent(source.resumeCursor, source.resume_cursor, source.cursor)) || "workflow:resume",
    nextCommand: text(firstPresent(source.nextCommand, source.next_command)),
    nextSkill: text(firstPresent(source.nextSkill, source.next_skill)),
    stopCondition: text(firstPresent(source.stopCondition, source.stop_condition)) || "ask-before-next-stage",
    choices,
  };
}

function formatPrimaryDecisionCard(record) {
  const lines = [
    "Decision Card",
    `Stage: ${record.currentStage}`,
    `Artifact: ${record.artifact}`,
    `Recommendation: ${record.recommendation}`,
  ];
  if (record.why) lines.push(`Why: ${record.why}`);
  if (record.sourceArtifact?.path) lines.push(`Source artifact: ${record.sourceArtifact.path}`);
  if (record.sourceArtifact?.hash) lines.push(`Source hash: ${record.sourceArtifact.hash}`);
  lines.push(`Question: ${record.question}`);
  lines.push("Choices:");
  for (const [index, choice] of record.choices.entries()) {
    const recommended = choice.recommended ? " (recommended)" : "";
    const detail = choice.description ? ` - ${choice.description}` : "";
    lines.push(`${index + 1}. ${choice.label}${recommended}${detail}`);
  }
  lines.push(`Resume: ${record.resumeCursor}`);
  if (record.nextCommand) lines.push(`Next command: ${record.nextCommand}`);
  if (record.approvalBinding?.handoffBlockedUntilApproved) lines.push("Handoff: blocked until latest user approval");
  return lines.join("\n");
}

function formatMachineHandoff(record) {
  const lines = [
    "NEXT_STEP_HANDOFF",
    `Current phase: ${record.currentStage}`,
    `Artifact: ${record.artifact}`,
  ];
  if (record.nextCommand) lines.push(`Next command: ${record.nextCommand}`);
  if (record.nextSkill) lines.push(`Next skill: ${record.nextSkill}`);
  if (record.sourceArtifact?.path) lines.push(`Source artifact: ${record.sourceArtifact.path}`);
  if (record.sourceArtifact?.hash) lines.push(`Source hash: ${record.sourceArtifact.hash}`);
  if (record.approvalBinding?.artifactHash) lines.push(`Decision artifact hash: ${record.approvalBinding.artifactHash}`);
  lines.push(`Approval source: ${record.approvalBinding?.approvalSource || WORKFLOW_SUMMARY_APPROVAL_SOURCE}`);
  lines.push(`Stop condition: ${record.stopCondition}`);
  lines.push(`Resume cursor: ${record.resumeCursor}`);
  lines.push(`Question: ${record.question}`);
  lines.push("Choices:");
  for (const choice of record.choices) {
    lines.push(`- ${choice.label}`);
  }
  lines.push("END_NEXT_STEP_HANDOFF");
  return lines.join("\n");
}

function normalizeChoices(value) {
  const source = Array.isArray(value) ? value : [];
  return source.map((choice, index) => {
    const item = isPlainObject(choice) ? choice : { label: choice };
    return {
      id: text(firstPresent(item.id, item.choiceId, item.choice_id)) || `choice_${index + 1}`,
      label: text(firstPresent(item.label, item.title, item.text)) || `Choice ${index + 1}`,
      description: text(firstPresent(item.description, item.consequences, item.detail)),
      recommended: Boolean(item.recommended),
      ordinal: Number.isInteger(Number(item.ordinal)) ? Number(item.ordinal) : index + 1,
    };
  });
}

function normalizeQuestion(value) {
  const question = text(value) || "Step 1/1: choose the next workflow action?";
  return /\bStep\s+\d+\/\d+\s*:/i.test(question) ? question : `Step 1/1: ${question}`;
}

function normalizeDecisionCardApprovalBinding(value, { record, sourceArtifact, artifactHash } = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    approvalSource: text(source.approvalSource) || WORKFLOW_SUMMARY_APPROVAL_SOURCE,
    currentUserChoiceRequired: source.currentUserChoiceRequired !== false,
    handoffBlockedUntilApproved: source.handoffBlockedUntilApproved !== false,
    allowedChoiceIds: Array.isArray(source.allowedChoiceIds) && source.allowedChoiceIds.length
      ? source.allowedChoiceIds.map(text).filter(Boolean)
      : record.choices.map((choice) => choice.id),
    selectedChoiceId: text(source.selectedChoiceId),
    sourceArtifactHash: normalizeHash(firstPresent(source.sourceArtifactHash, sourceArtifact?.hash)),
    artifactHash: normalizeHash(firstPresent(source.artifactHash, artifactHash)),
    expiresAt: text(source.expiresAt),
  };
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined);
}

function text(value) {
  return String(value ?? "").trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function normalizeWorkflowSummaryStage(stage) {
  return normalizeContractWorkflowSummaryStage(stage);
}

function normalizeWorkflowId(value) {
  const normalized = text(value)
    .toLowerCase()
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  return normalized || "workflow-summary";
}

function normalizeSourceArtifact(value, { stage = "", createdAt = new Date().toISOString() } = {}) {
  const source = isPlainObject(value) ? value : {};
  const config = SUMMARY_STAGE_CONFIG[stage] || {};
  return {
    kind: text(source.kind) || config.sourceArtifactKind || "unknown",
    path: normalizePath(firstPresent(source.path, source.artifactPath, source.file, source.storagePath)),
    hashAlgorithm: text(source.hashAlgorithm) || "sha256",
    hash: normalizeHash(firstPresent(source.hash, source.artifactHash, source.sourceHash)),
    capturedAt: text(source.capturedAt) || createdAt,
  };
}

function normalizeDecisionSummary(value, { stage, config, choices }) {
  const source = isPlainObject(value) ? value : {};
  return {
    addedAndWhy: normalizeStringArray(firstPresent(source.addedAndWhy, source.added, WORKFLOW_SUMMARY_POST_STAGES.includes(stage) ? [config.title + " captures what changed and why."] : [])),
    deferredAndWhy: normalizeStringArray(firstPresent(source.deferredAndWhy, source.deferred, [])),
    validationResult: text(source.validationResult) || (WORKFLOW_SUMMARY_POST_STAGES.includes(stage) ? "source artifact must be validated before this summary unlocks the next stage" : "pre-stage summary awaits latest user approval"),
    nextRecommendedCommand: text(source.nextRecommendedCommand) || config.nextRecommendedCommand || "",
    nextUserActions: normalizeStringArray(firstPresent(source.nextUserActions, source.actions, choices.map((choice) => choice.id + ": " + choice.label))),
  };
}

function normalizeVisualSummary(value, { stage, config, sourceArtifact, storagePath, decisionSummary }) {
  const source = isPlainObject(value) ? value : {};
  const summaryTable = Array.isArray(source.summaryTable) && source.summaryTable.length
    ? source.summaryTable.map(normalizeTableRow).filter(Boolean)
    : [
        { label: "Stage", value: stage },
        { label: "Artifact kind", value: config.summaryKind || "summary" },
        { label: "Source", value: sourceArtifact.path || sourceArtifact.kind || "prompt" },
        { label: "Next", value: decisionSummary.nextRecommendedCommand || "user decision" },
      ];
  const asciiMap = Array.isArray(source.asciiMap) && source.asciiMap.length
    ? source.asciiMap.map((line) => text(line)).filter(Boolean)
    : ["request/source", "  -> " + stage + " summary (" + storagePath + ")", "    -> " + (decisionSummary.nextRecommendedCommand || "next user decision")];
  return { required: true, summaryTable, asciiMap };
}

function normalizeTableRow(value) {
  if (!isPlainObject(value)) return null;
  const label = text(firstPresent(value.label, value.field, value.key));
  const rowValue = text(firstPresent(value.value, value.text, value.result));
  return label && rowValue ? { label, value: rowValue } : null;
}

function normalizeStaleState(value, { stage, sourceArtifact, createdAt }) {
  const source = isPlainObject(value) ? value : {};
  const postStage = WORKFLOW_SUMMARY_POST_STAGES.includes(stage);
  return {
    status: text(source.status) || (postStage && !sourceArtifact.hash ? "unknown" : "current"),
    reason: text(source.reason) || (postStage && !sourceArtifact.hash ? "source-artifact-hash-not-captured" : "source-artifact-current"),
    checkedAt: text(source.checkedAt) || createdAt,
    sourceArtifactHash: text(source.sourceArtifactHash) || sourceArtifact.hash,
    repair: text(source.repair) || "regenerate summary from current source artifact when stale",
  };
}

function validateSourceArtifact(sourceArtifact, stage) {
  const issues = [];
  if (!isPlainObject(sourceArtifact)) return ["WSA_SOURCE_ARTIFACT: sourceArtifact is required"];
  if (WORKFLOW_SUMMARY_POST_STAGES.includes(stage)) {
    if (!text(sourceArtifact.path)) issues.push("WSA_SOURCE_ARTIFACT_PATH: post-stage summary requires sourceArtifact.path");
    if (!isSha256Hash(sourceArtifact.hash)) issues.push("WSA_SOURCE_ARTIFACT_HASH: post-stage summary requires sourceArtifact.hash sha256");
  }
  if (text(sourceArtifact.hash) && !isSha256Hash(sourceArtifact.hash)) issues.push("WSA_SOURCE_ARTIFACT_HASH: sourceArtifact.hash must be sha256 when present");
  return issues;
}

function validateVisualSummary(visualSummary) {
  const issues = [];
  if (!isPlainObject(visualSummary)) return ["WSA_VISUAL_SUMMARY: visualSummary is required"];
  if (!Array.isArray(visualSummary.summaryTable) || visualSummary.summaryTable.length < 2) issues.push("WSA_VISUAL_TABLE: visualSummary.summaryTable requires at least 2 rows");
  if (!Array.isArray(visualSummary.asciiMap) || visualSummary.asciiMap.length < 2) issues.push("WSA_ASCII_MAP: visualSummary.asciiMap requires at least 2 lines");
  return issues;
}

function validateDecisionSummary(decisionSummary, stage) {
  const issues = [];
  if (!isPlainObject(decisionSummary)) return ["WSA_DECISION_SUMMARY: decisionSummary is required"];
  if (!Array.isArray(decisionSummary.nextUserActions) || decisionSummary.nextUserActions.length < 3) issues.push("WSA_NEXT_USER_ACTIONS: decisionSummary.nextUserActions requires at least 3 options");
  if (WORKFLOW_SUMMARY_POST_STAGES.includes(stage)) {
    if (!Array.isArray(decisionSummary.addedAndWhy) || decisionSummary.addedAndWhy.length < 1) issues.push("WSA_ADDED_AND_WHY: post-stage summary requires addedAndWhy");
    if (!text(decisionSummary.validationResult)) issues.push("WSA_VALIDATION_RESULT: post-stage summary requires validationResult");
    if (!text(decisionSummary.nextRecommendedCommand)) issues.push("WSA_NEXT_COMMAND: post-stage summary requires nextRecommendedCommand");
  }
  return issues;
}

function validateStaleState(staleState, stage) {
  const issues = [];
  if (!isPlainObject(staleState)) return ["WSA_STALE_STATE: staleState is required"];
  if (!["current", "unknown", "stale"].includes(staleState.status)) issues.push("WSA_STALE_STATUS: staleState.status must be current, unknown, or stale");
  if (WORKFLOW_SUMMARY_POST_STAGES.includes(stage) && staleState.status !== "current") issues.push("WSA_STALE_BLOCKS_POST_STAGE: post-stage summary must be current before approval or handoff");
  return issues;
}

function normalizeSummaryChoices(value, stage) {
  const config = SUMMARY_STAGE_CONFIG[stage];
  const source = Array.isArray(value) && value.length ? value : config.choices;
  const byId = new Map(source.map((choice, index) => {
    const item = isPlainObject(choice) ? choice : { label: choice };
    const id = text(firstPresent(item.id, item.choiceId, item.choice_id)) || `choice-${index + 1}`;
    return [id, {
      id,
      label: text(firstPresent(item.label, item.title, item.text)) || id,
      description: text(firstPresent(item.description, item.tradeoff, item.detail)),
      recommended: item.recommended === true,
      ordinal: Number.isInteger(Number(item.ordinal)) ? Number(item.ordinal) : index + 1,
    }];
  }));
  for (const [index, choice] of config.choices.entries()) {
    if (!byId.has(choice.id)) {
      byId.set(choice.id, {
        ...choice,
        ordinal: byId.size + index + 1,
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.ordinal - b.ordinal);
}

function normalizeSummaryApprovalState(value, { stage, sourcePromptHash, expiresAt }) {
  const source = isPlainObject(value) ? value : {};
  return {
    status: text(source.status) || "pending",
    selectedChoiceId: text(source.selectedChoiceId),
    approvedAt: text(source.approvedAt),
    approvedBy: text(source.approvedBy),
    approvalSource: text(source.approvalSource) || WORKFLOW_SUMMARY_APPROVAL_SOURCE,
    allowedChoiceIds: [SUMMARY_STAGE_CONFIG[stage].approveChoiceId],
    sourcePromptHash,
    artifactHash: normalizeHash(source.artifactHash),
    expiresAt,
  };
}

function normalizeEvidenceAppendix(value, { storagePath, sourcePromptHash, schemaPath, contractVersion, sourceArtifact, items }) {
  const source = isPlainObject(value) ? value : {};
  return {
    schemaPath,
    contractVersion: text(source.contractVersion) || contractVersion || WORKFLOW_SUMMARY_CONTRACT_VERSION,
    storagePath,
    sourcePromptHash,
    sourceArtifactHash: sourceArtifact?.hash || "",
    artifactHash: normalizeHash(source.artifactHash),
    items: normalizeStringArray(firstPresent(source.items, source.evidence, items)),
  };
}

function validateSummaryChoices(choices, stage) {
  const issues = [];
  if (!Array.isArray(choices) || choices.length < 3) {
    return ["choices must include at least 3 stable options"];
  }
  const ids = choices.map((choice) => text(choice?.id));
  if (new Set(ids).size !== ids.length) issues.push("choice ids must be unique");
  for (const choice of choices) {
    if (!text(choice?.id) || !text(choice?.label) || !text(choice?.description)) {
      issues.push(`choice ${choice?.id || "unknown"} missing id, label, or description`);
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(text(choice?.id))) {
      issues.push(`choice ${choice?.id || "unknown"} id must be stable kebab-case`);
    }
  }
  if (SUMMARY_STAGE_CONFIG[stage]) {
    for (const expectedId of [
      SUMMARY_STAGE_CONFIG[stage].approveChoiceId,
      SUMMARY_STAGE_CONFIG[stage].reviseChoiceId,
      SUMMARY_STAGE_CONFIG[stage].stopChoiceId,
    ]) {
      if (!ids.includes(expectedId)) issues.push(`missing stable choice id ${expectedId}`);
    }
  }
  return issues;
}

function approvalResult(approved, reason, issues, artifact) {
  return {
    approved,
    status: approved ? "approved" : "rejected",
    reason,
    issues,
    approvalState: artifact?.approvalState || null,
  };
}

function stripQuotedAndCode(value = "") {
  const withoutFences = String(value || "").replace(/```[\s\S]*?```/g, "\n");
  return withoutFences
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith(">"))
    .join("\n")
    .trim();
}

function containsSlashCommand(value = "") {
  return /(^|\s)\/[a-z][a-z0-9_-]*(?:\s|$)/i.test(String(value || ""));
}

function hasApprovalLanguage(value = "") {
  return /\b(approve|approved|yes|confirm|confirmed|go ahead|looks good|accept|accepted)\b/i.test(String(value || ""));
}

function messageMatchesSummaryBody(message, artifact) {
  const normalizedMessage = normalizeComparable(message);
  if (normalizedMessage.length < 24) return false;
  return collectSummaryBodyText(artifact)
    .map(normalizeComparable)
    .filter((value) => value.length >= 24)
    .some((value) => normalizedMessage.includes(value) || value.includes(normalizedMessage));
}

function collectSummaryBodyText(artifact) {
  return [
    artifact.title,
    artifact.summary?.objective,
    ...(artifact.summary?.scope || []),
    ...(artifact.summary?.nonGoals || []),
    ...(artifact.approvedScope || []),
    ...(artifact.assumptions || []),
    ...(artifact.planningAssumptions || []),
    ...(artifact.constraints || []),
    ...(artifact.risks || []),
    ...(artifact.missingFacts || []),
    ...(artifact.choices || []).flatMap((choice) => [choice.label, choice.description]),
  ].filter(Boolean);
}

function cloneWithoutArtifactHashes(value) {
  if (Array.isArray(value)) return value.map((item) => cloneWithoutArtifactHashes(item));
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (key === "artifactHash") continue;
    if ((key === "approvalState" || key === "evidenceAppendix") && isPlainObject(value[key])) {
      const nested = { ...value[key] };
      delete nested.artifactHash;
      out[key] = cloneWithoutArtifactHashes(nested);
      continue;
    }
    out[key] = cloneWithoutArtifactHashes(value[key]);
  }
  return out;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeStringArray(value) {
  const source = Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value];
  return source.map((item) => text(item)).filter(Boolean);
}

function normalizeHash(value) {
  const raw = text(value);
  if (!raw) return "";
  const bare = raw.startsWith(HASH_PREFIX) ? raw.slice(HASH_PREFIX.length) : raw;
  return /^[a-f0-9]{64}$/i.test(bare) ? `${HASH_PREFIX}${bare.toLowerCase()}` : raw;
}

function isSha256Hash(value) {
  return /^sha256:[a-f0-9]{64}$/i.test(text(value));
}

function hashText(value) {
  return `${HASH_PREFIX}${createHash("sha256").update(String(value || ""), "utf8").digest("hex")}`;
}

function toDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function summarizeText(value, maxLength) {
  const normalized = text(value).replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function normalizePath(value) {
  return text(value).replace(/\\/g, "/").replace(/^\.?\//, "");
}

function normalizeComparable(value) {
  return text(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function appendList(lines, label, items) {
  if (!Array.isArray(items) || !items.length) return;
  lines.push(`${label}:`);
  for (const item of items) lines.push(`- ${item}`);
}

function escapeMarkdownCell(value) {
  return text(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
