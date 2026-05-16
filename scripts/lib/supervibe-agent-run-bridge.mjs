import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";

export const AGENT_RUN_RECORD_V1_SCHEMA_ID = "supervibe.agent-run-record.v1";

export const AGENT_RUN_AUTOMATION_ACTIONS = Object.freeze([
  "apply",
  "spawn",
  "receipt",
]);

export const GATE_C_APPROVAL_STATUSES = Object.freeze([
  "approved",
  "accepted",
]);

export const HOST_INVOCATION_SOURCES = Object.freeze({
  claude: "claude-code-task-hook",
  codex: "codex-spawn-agent",
  cursor: "cursor-agent-run",
  gemini: "gemini-agent-run",
  opencode: "opencode-agent-run",
});

export const DEFAULT_RESPAWN_LIMIT = 2;
export const SPAWN_INVOCATION_LOG_BINDING_V1_SCHEMA_ID = "supervibe.spawn-invocation-log-binding.v1";
export const AUTOMATIC_RECEIPT_ISSUE_REQUEST_V1_SCHEMA_ID = "supervibe.automatic-receipt-issue-request.v1";
export const AGENT_OUTCOME_FEEDBACK_V1_SCHEMA_ID = "supervibe.agent-outcome-feedback.v1";

export const agentRunRecordV1Fixture = Object.freeze({
  schemaId: AGENT_RUN_RECORD_V1_SCHEMA_ID,
  version: 1,
  taskId: "agent-run-bridge-task-fixture",
  agentId: "fixture-worker",
  runId: "agent-run-bridge-fixture",
  lifecycle: "planned",
  automation: {
    actions: ["apply", "spawn", "receipt"],
    gateCRequired: true,
    gateCApprovalArtifact: ".supervibe/artifacts/approvals/gate-c.json",
  },
  timestamps: {
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z",
  },
  evidence: [],
});

export const gateCApprovalArtifactFixture = Object.freeze({
  gate: "C",
  status: "approved",
  approvedBy: "quality-gate-reviewer",
  approvedAt: "2026-05-15T00:00:00.000Z",
  artifactId: "gate-c-approval-fixture",
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasNonEmptyString(record, key) {
  return typeof record[key] === "string" && record[key].trim().length > 0;
}

export function validateAgentRunRecordV1(record = {}) {
  const errors = [];

  if (!isPlainObject(record)) {
    return { valid: false, errors: ["record must be an object"] };
  }

  for (const key of ["schemaId", "taskId", "agentId", "runId", "lifecycle"]) {
    if (!hasNonEmptyString(record, key)) errors.push(`${key} must be a non-empty string`);
  }

  if (record.schemaId !== AGENT_RUN_RECORD_V1_SCHEMA_ID) {
    errors.push(`schemaId must equal ${AGENT_RUN_RECORD_V1_SCHEMA_ID}`);
  }

  if (record.version !== 1) errors.push("version must equal 1");

  if (!isPlainObject(record.automation)) {
    errors.push("automation must be an object");
  } else {
    if (!Array.isArray(record.automation.actions)) {
      errors.push("automation.actions must be an array");
    } else {
      const invalidActions = record.automation.actions.filter(
        (action) => !AGENT_RUN_AUTOMATION_ACTIONS.includes(action),
      );
      if (invalidActions.length > 0) {
        errors.push(`automation.actions contains unsupported values: ${invalidActions.join(", ")}`);
      }
    }

    if (record.automation.gateCRequired !== true) {
      errors.push("automation.gateCRequired must be true");
    }
  }

  if (!isPlainObject(record.timestamps)) {
    errors.push("timestamps must be an object");
  } else {
    for (const key of ["createdAt", "updatedAt"]) {
      if (!hasNonEmptyString(record.timestamps, key)) errors.push(`timestamps.${key} must be a non-empty string`);
    }
  }

  if (!Array.isArray(record.evidence)) errors.push("evidence must be an array");

  return { valid: errors.length === 0, errors };
}

export function assertAgentRunRecordV1(record = {}) {
  const validation = validateAgentRunRecordV1(record);
  if (!validation.valid) {
    throw new Error(`Invalid AgentRunRecordV1: ${validation.errors.join("; ")}`);
  }
  return record;
}

export function validateGateCApprovalArtifact(artifact = {}) {
  const errors = [];

  if (!isPlainObject(artifact)) {
    return { valid: false, errors: ["Gate C approval artifact must be an object"] };
  }

  if (artifact.gate !== "C" && artifact.gateId !== "GATE-C") {
    errors.push('Gate C approval artifact must identify gate "C" or "GATE-C"');
  }

  if (!GATE_C_APPROVAL_STATUSES.includes(artifact.status)) {
    errors.push(`Gate C approval status must be one of: ${GATE_C_APPROVAL_STATUSES.join(", ")}`);
  }

  if (!hasNonEmptyString(artifact, "approvedBy")) errors.push("approvedBy must be a non-empty string");
  if (!hasNonEmptyString(artifact, "approvedAt")) errors.push("approvedAt must be a non-empty string");

  return { valid: errors.length === 0, errors };
}

export function assertGateCApprovalArtifact(artifact = {}) {
  const validation = validateGateCApprovalArtifact(artifact);
  if (!validation.valid) {
    throw new Error(`Gate C approval required: ${validation.errors.join("; ")}`);
  }
  return artifact;
}

export function enforceGateCForAutomation({
  record = agentRunRecordV1Fixture,
  approvalArtifact = null,
  action = "spawn",
} = {}) {
  assertAgentRunRecordV1(record);

  if (!AGENT_RUN_AUTOMATION_ACTIONS.includes(action)) {
    throw new Error(`Unsupported automation action: ${action}`);
  }

  if (!record.automation.actions.includes(action)) {
    throw new Error(`Automation action is not declared on AgentRunRecordV1: ${action}`);
  }

  assertGateCApprovalArtifact(approvalArtifact);

  return {
    allowed: true,
    action,
    gate: "C",
    record,
    approvalArtifact,
  };
}

export function evaluateAgentOutputProofBinding({
  record = null,
  outputBinding = null,
  requireReceipt = true,
} = {}) {
  const issues = [];
  let validatedRecord = null;

  try {
    validatedRecord = record ? assertAgentRunRecordV1(record) : null;
  } catch (error) {
    issues.push(error.message);
  }

  if (!isPlainObject(outputBinding)) {
    issues.push("outputBinding must be an object");
  } else {
    if (!hasNonEmptyString(outputBinding, "artifact")) issues.push("outputBinding.artifact must be a non-empty string");
    if (requireReceipt && !hasNonEmptyString(outputBinding, "receiptId")) {
      issues.push("outputBinding.receiptId must be a non-empty string");
    }
    if (requireReceipt && !hasNonEmptyString(outputBinding, "ledgerHash")) {
      issues.push("outputBinding.ledgerHash must be a non-empty string");
    }
    if (requireReceipt && !hasNonEmptyString(outputBinding, "proofHash")) {
      issues.push("outputBinding.proofHash must be a non-empty string");
    }
    if (!isPlainObject(outputBinding.hostInvocation)) {
      issues.push("outputBinding.hostInvocation must be an object");
    } else {
      if (!hasNonEmptyString(outputBinding.hostInvocation, "source")) {
        issues.push("outputBinding.hostInvocation.source must be a non-empty string");
      }
      if (!hasNonEmptyString(outputBinding.hostInvocation, "invocationId")) {
        issues.push("outputBinding.hostInvocation.invocationId must be a non-empty string");
      }
    }
  }

  const plannedHostInvocation = validatedRecord?.automation?.plannedHostInvocation;
  const boundHostInvocation = outputBinding?.hostInvocation;
  if (plannedHostInvocation && boundHostInvocation) {
    if (plannedHostInvocation.source !== boundHostInvocation.source) {
      issues.push("outputBinding.hostInvocation.source must match the planned host invocation source");
    }
    if (plannedHostInvocation.agentId !== boundHostInvocation.agentId) {
      issues.push("outputBinding.hostInvocation.agentId must match the planned host invocation agentId");
    }
  }

  return {
    trusted: issues.length === 0,
    trustStatus: issues.length === 0 ? "trusted" : "untrusted",
    issues,
    record: validatedRecord,
    outputBinding: isPlainObject(outputBinding) ? outputBinding : null,
  };
}

export function assertAgentOutputProofBinding(options = {}) {
  const result = evaluateAgentOutputProofBinding(options);
  if (!result.trusted) {
    throw new Error(`Agent output proof binding required: ${result.issues.join("; ")}`);
  }
  return result;
}

export function createSpawnInvocationLogBinding({
  plannedInvocation = null,
  spawnResult = {},
  invocationRecord = null,
  receiptResult = null,
  proofProjection = null,
  outputArtifact = null,
} = {}) {
  const issues = [];
  let validatedRecord = null;
  try {
    validatedRecord = plannedInvocation?.record ? assertAgentRunRecordV1(plannedInvocation.record) : null;
  } catch (error) {
    issues.push(error.message);
  }

  const plannedHostInvocation = validatedRecord?.automation?.plannedHostInvocation || plannedInvocation?.hostInvocation || null;
  const hostInvocation = normalizeActualHostInvocation({
    plannedHostInvocation,
    spawnResult,
    invocationRecord,
  });
  const artifact = firstNonEmptyString(
    outputArtifact,
    proofProjection?.artifactPath,
    firstReceiptOutputArtifact(receiptResult),
    invocationRecord?.structured_output?.json,
    invocationRecord?.structuredOutput?.json,
    spawnResult?.outputArtifact,
  );
  const receiptId = firstNonEmptyString(
    proofProjection?.receiptId,
    receiptResult?.receipt?.receiptId,
    receiptResult?.receiptId,
    spawnResult?.receiptId,
  );
  const ledgerHash = firstNonEmptyString(
    proofProjection?.ledgerHash,
    receiptResult?.ledgerEntry?.entryHash,
    receiptResult?.receipt?.runtime?.canonicalHash,
    receiptResult?.ledgerHash,
    spawnResult?.ledgerHash,
  );
  const projectionTrustStatus = proofProjection?.trustStatus || null;
  const proofHash = proofProjection
    ? `sha256:${createHash("sha256").update(stableStringify(proofProjection)).digest("hex")}`
    : firstNonEmptyString(spawnResult?.proofHash, receiptResult?.proofHash);
  const workKind = normalizeWorkKind(
    plannedInvocation?.workKind
    || plannedInvocation?.record?.dispatch?.workKind
    || spawnResult?.workKind,
  );

  if (!artifact) issues.push("output artifact required for spawn invocation log binding");
  if (!receiptId) issues.push("receiptId required for spawn invocation log binding");
  if (!ledgerHash) issues.push("ledgerHash required for spawn invocation log binding");
  if (!proofHash) issues.push("proofHash required for spawn invocation log binding");
  if (!hostInvocation.source) issues.push("host invocation source required for spawn invocation log binding");
  if (!hostInvocation.invocationId) issues.push("host invocation id required for spawn invocation log binding");
  if (hostInvocation.invocationId && String(hostInvocation.invocationId).startsWith("planned-")) {
    issues.push("planned dry-run invocation id cannot be used as a spawned host invocation proof");
  }
  if (plannedHostInvocation?.source && hostInvocation.source && plannedHostInvocation.source !== hostInvocation.source) {
    issues.push("spawned host invocation source must match planned host invocation source");
  }
  if (plannedHostInvocation?.agentId && hostInvocation.agentId && plannedHostInvocation.agentId !== hostInvocation.agentId) {
    issues.push("spawned host invocation agentId must match planned host invocation agentId");
  }
  if (proofProjection && projectionTrustStatus !== "trusted") {
    issues.push(`proof projection must be trusted, got ${projectionTrustStatus || "missing"}`);
  }

  const outputBinding = {
    schemaId: SPAWN_INVOCATION_LOG_BINDING_V1_SCHEMA_ID,
    artifact,
    receiptId,
    ledgerHash,
    proofHash,
    trustStatus: issues.length === 0 ? "trusted" : "untrusted",
    hostInvocation,
    invocationLog: {
      path: ".supervibe/memory/agent-invocations.jsonl",
      bound: Boolean(invocationRecord),
      structuredOutput: firstNonEmptyString(invocationRecord?.structured_output?.json, invocationRecord?.structuredOutput?.json) || null,
    },
    proofProjection: proofProjection ? {
      trustStatus: projectionTrustStatus,
      artifactPath: proofProjection.artifactPath || null,
      receiptId: proofProjection.receiptId || null,
    } : null,
    outcomeFeedback: createAgentOutcomeFeedback({
      workKind,
      dryRun: false,
      applied: true,
      spawned: Boolean(hostInvocation.invocationId),
      receiptIssued: Boolean(receiptId),
      status: issues.length === 0 ? "success" : "blocked",
      issues,
      hostInvocation,
    }),
    issues,
  };

  return {
    trusted: issues.length === 0,
    trustStatus: outputBinding.trustStatus,
    issues,
    outcomeFeedback: outputBinding.outcomeFeedback,
    outputBinding,
  };
}

export function assertSpawnInvocationLogBinding(options = {}) {
  const result = createSpawnInvocationLogBinding(options);
  if (!result.trusted) {
    throw new Error(`Spawn invocation log binding required: ${result.issues.join("; ")}`);
  }
  assertAgentOutputProofBinding({
    record: options.plannedInvocation?.record || null,
    outputBinding: result.outputBinding,
    requireReceipt: true,
  });
  return result;
}

export function createAutomaticReceiptIssueRequest({
  plannedInvocation = null,
  spawnResult = {},
  approvalArtifact = null,
  command = plannedInvocation?.record?.dispatch?.command,
  stage = plannedInvocation?.record?.dispatch?.stage,
  handoffId = plannedInvocation?.record?.dispatch?.handoffId,
  taskSummary = spawnResult?.taskSummary || plannedInvocation?.taskId,
  confidence = spawnResult?.confidence ?? 10,
  outputArtifacts = [],
  inputEvidence = [],
  subjectType = "worker",
  subjectId = plannedInvocation?.agentId,
  root = null,
} = {}) {
  const record = plannedInvocation?.record ? assertAgentRunRecordV1(plannedInvocation.record) : null;
  enforceGateCForAutomation({ record, approvalArtifact, action: "receipt" });
  const hostInvocation = normalizeActualHostInvocation({
    plannedHostInvocation: record?.automation?.plannedHostInvocation || plannedInvocation?.hostInvocation || null,
    spawnResult,
  });
  const normalizedOutputArtifacts = normalizeStringList(outputArtifacts);
  const normalizedInputEvidence = normalizeStringList(inputEvidence);
  const normalizedConfidence = Number(confidence);
  const errors = [];

  if (!command) errors.push("command required for automatic receipt issue");
  if (!stage) errors.push("stage required for automatic receipt issue");
  if (!handoffId) errors.push("handoffId required for automatic receipt issue");
  if (!taskSummary) errors.push("taskSummary required for automatic receipt issue");
  if (!normalizedOutputArtifacts.length) errors.push("outputArtifacts required for automatic receipt issue");
  if (!hostInvocation.source) errors.push("host invocation source required for automatic receipt issue");
  if (!hostInvocation.invocationId) errors.push("host invocation id required for automatic receipt issue");
  if (hostInvocation.invocationId && String(hostInvocation.invocationId).startsWith("planned-")) {
    errors.push("planned dry-run invocation id cannot issue a receipt");
  }
  if (!Number.isFinite(normalizedConfidence) || normalizedConfidence < 0 || normalizedConfidence > 10) {
    errors.push("confidence must be a number from 0 to 10");
  }
  if (errors.length) {
    throw new Error(`Automatic receipt issue request invalid: ${errors.join("; ")}`);
  }

  const args = [
    "scripts/agent-invocation.mjs",
    "log",
    "--agent",
    hostInvocation.agentId || plannedInvocation?.agentId,
    "--host",
    hostInvocation.host || "codex",
    "--host-invocation-id",
    hostInvocation.invocationId,
    "--task",
    String(taskSummary),
    "--confidence",
    String(normalizedConfidence),
    "--issue-receipt",
    "--command",
    command,
    "--stage",
    stage,
    "--handoff-id",
    handoffId,
    "--output-artifacts",
    normalizedOutputArtifacts.join(","),
    "--subject-type",
    subjectType,
    "--subject-id",
    subjectId || hostInvocation.agentId || plannedInvocation?.agentId,
  ];
  if (root) args.push("--root", root);
  if (normalizedInputEvidence.length) args.push("--input-evidence", normalizedInputEvidence.join(","));

  return {
    schemaId: AUTOMATIC_RECEIPT_ISSUE_REQUEST_V1_SCHEMA_ID,
    dryRun: false,
    executable: "node",
    args,
    hostInvocation,
    receipt: {
      command,
      stage,
      handoffId,
      outputArtifacts: normalizedOutputArtifacts,
      inputEvidence: normalizedInputEvidence,
      subjectType,
      subjectId: subjectId || hostInvocation.agentId || plannedInvocation?.agentId,
    },
    outcomeFeedback: createAgentOutcomeFeedback({
      workKind: plannedInvocation?.workKind || record?.dispatch?.workKind,
      dryRun: false,
      applied: true,
      spawned: true,
      receiptIssued: false,
      status: "receipt-ready",
      hostInvocation,
    }),
  };
}

export function evaluateRespawnLimitPolicy({
  attempts = [],
  respawnCount = null,
  maxRespawns = DEFAULT_RESPAWN_LIMIT,
} = {}) {
  const parsedLimit = Number(maxRespawns);
  const normalizedLimit = Number.isFinite(parsedLimit) ? Math.max(0, Math.floor(parsedLimit)) : DEFAULT_RESPAWN_LIMIT;
  const countFromAttempts = Array.isArray(attempts)
    ? attempts.filter((attempt) => isRespawnAttempt(attempt)).length
    : 0;
  const parsedCount = Number(respawnCount);
  const used = Number.isFinite(parsedCount) ? Math.max(0, Math.floor(parsedCount)) : countFromAttempts;
  const remaining = Math.max(0, normalizedLimit - used);
  const allowed = used < normalizedLimit;

  return {
    allowed,
    maxRespawns: normalizedLimit,
    used,
    remaining,
    reason: allowed ? "respawn permitted" : `respawn limit ${normalizedLimit} exhausted`,
  };
}

export function enforceAutomationPreflight({
  record = agentRunRecordV1Fixture,
  approvalArtifact = null,
  action = "spawn",
  outputBinding = null,
  respawnPolicy = null,
} = {}) {
  const gate = enforceGateCForAutomation({ record, approvalArtifact, action });

  if (action === "receipt") {
    assertAgentOutputProofBinding({ record, outputBinding, requireReceipt: true });
  }

  if (action === "spawn" && respawnPolicy && respawnPolicy.allowed !== true) {
    throw new Error(`Respawn blocked: ${respawnPolicy.reason || "respawn limit exhausted"}`);
  }

  return {
    allowed: true,
    action,
    gate,
    outputBinding: outputBinding || null,
    respawnPolicy: respawnPolicy || null,
    outcomeFeedback: createAgentOutcomeFeedback({
      workKind: record?.dispatch?.workKind,
      dryRun: record?.automation?.dryRun === true,
      applied: false,
      spawned: false,
      receiptIssued: false,
      status: "preflight-ready",
      issues: respawnPolicy?.allowed === false ? [respawnPolicy.reason || "respawn blocked"] : [],
      hostInvocation: record?.automation?.plannedHostInvocation || null,
    }),
  };
}

export function planDryRunHostInvocation({
  task = {},
  taskId = task.id || task.taskId || task.itemId,
  agentId = task.agentId || task.ownerCapability || task.owner || "worker",
  workKind = "implementation",
  host = "codex",
  hostInvocationSource = HOST_INVOCATION_SOURCES[String(host || "codex").toLowerCase()] || `${sanitizeId(host)}-agent-run`,
  waveId = "wave-1",
  sequence = 1,
  actions = ["spawn", "receipt"],
  command = null,
  stage = null,
  handoffId = null,
  now = "dry-run-planned",
} = {}) {
  const normalizedTaskId = normalizeRequiredId(taskId, "taskId");
  const normalizedAgentId = normalizeRequiredId(agentId, "agentId");
  const normalizedWorkKind = normalizeWorkKind(workKind);
  const normalizedHost = sanitizeId(host || "codex");
  const normalizedSource = String(hostInvocationSource || "").trim();
  if (!normalizedSource) throw new Error("hostInvocationSource must be a non-empty string");
  const normalizedActions = normalizeAutomationActions(actions);
  const safeWaveId = sanitizeId(waveId || "wave-1");
  const safeSequence = Math.max(1, Math.floor(Number(sequence) || 1));
  const runId = `dry-run-${safeWaveId}-${safeSequence}-${sanitizeId(normalizedTaskId)}`;
  const hostInvocationId = `planned-${normalizedHost}-${safeWaveId}-${safeSequence}-${sanitizeId(normalizedTaskId)}`;
  const respawnPolicy = evaluateRespawnLimitPolicy({
    attempts: task.spawnAttempts || task.respawnAttempts || [],
    respawnCount: task.respawnCount,
    maxRespawns: task.maxRespawns ?? DEFAULT_RESPAWN_LIMIT,
  });
  const timestamps = {
    createdAt: now,
    updatedAt: now,
  };
  const hostInvocation = {
    source: normalizedSource,
    invocationId: hostInvocationId,
    agentId: normalizedAgentId,
    host: normalizedHost,
    dryRun: true,
    planned: true,
    spawned: false,
    applied: false,
    receiptIssued: false,
  };
  const outcomeFeedback = createAgentOutcomeFeedback({
    workKind: normalizedWorkKind,
    dryRun: true,
    applied: false,
    spawned: false,
    receiptIssued: false,
    status: respawnPolicy.allowed ? "planned" : "blocked",
    issues: respawnPolicy.allowed ? [] : [respawnPolicy.reason],
    hostInvocation,
  });
  const record = assertAgentRunRecordV1({
    schemaId: AGENT_RUN_RECORD_V1_SCHEMA_ID,
    version: 1,
    taskId: normalizedTaskId,
    agentId: normalizedAgentId,
    runId,
    lifecycle: "dry-run-planned",
    automation: {
      actions: normalizedActions,
      gateCRequired: true,
      gateCApprovalArtifact: null,
      dryRun: true,
      plannedHostInvocation: hostInvocation,
      respawnPolicy,
      outcomeFeedback,
    },
    dispatch: {
      waveId,
      sequence: safeSequence,
      workKind: normalizedWorkKind,
      command,
      stage,
      handoffId,
    },
    timestamps,
    evidence: [],
  });

  return {
    dryRun: true,
    lifecycle: "dry-run-planned",
    taskId: normalizedTaskId,
    agentId: normalizedAgentId,
    workKind: normalizedWorkKind,
    runId,
    actions: normalizedActions,
    gateC: {
      required: true,
      approved: false,
      status: "not-evaluated",
    },
    respawnPolicy,
    hostInvocation,
    outcomeFeedback,
    record,
  };
}

export function createAgentOutcomeFeedback({
  workKind = "implementation",
  dryRun = false,
  applied = false,
  spawned = false,
  receiptIssued = false,
  status = "planned",
  issues = [],
  hostInvocation = null,
} = {}) {
  const normalizedWorkKind = normalizeWorkKind(workKind);
  const normalizedIssues = normalizeStringList(issues);
  const blocked = normalizedIssues.length > 0 || ["blocked", "failed", "error", "retryable_failure"].includes(String(status || "").toLowerCase());
  const outcome = selectOutcomeKind({
    workKind: normalizedWorkKind,
    blocked,
    dryRun,
    applied,
    spawned,
    receiptIssued,
    status,
  });

  return {
    schemaId: AGENT_OUTCOME_FEEDBACK_V1_SCHEMA_ID,
    outcome,
    status: blocked ? "blocked" : outcomeStatus(outcome),
    workKind: normalizedWorkKind,
    dryRun: dryRun === true,
    applied: applied === true,
    spawned: spawned === true,
    receiptIssued: receiptIssued === true,
    message: agentOutcomeMessage(outcome),
    issues: normalizedIssues,
    hostInvocation: hostInvocation ? {
      source: hostInvocation.source || null,
      invocationId: hostInvocation.invocationId || null,
      agentId: hostInvocation.agentId || null,
      host: hostInvocation.host || null,
    } : null,
  };
}

export async function readGateCApprovalArtifact(artifactPath) {
  if (!artifactPath || typeof artifactPath !== "string") {
    throw new Error("Gate C approval artifact path must be a non-empty string");
  }
  await access(artifactPath);
  const raw = await readFile(artifactPath, "utf8");
  return JSON.parse(raw);
}

export async function enforceGateCForAutomationFromPath({
  record = agentRunRecordV1Fixture,
  approvalArtifactPath,
  action = "spawn",
} = {}) {
  const approvalArtifact = await readGateCApprovalArtifact(approvalArtifactPath);
  return enforceGateCForAutomation({ record, approvalArtifact, action });
}

function normalizeAutomationActions(actions = []) {
  const requested = Array.isArray(actions) ? actions : [actions];
  const normalized = requested
    .map((action) => String(action || "").trim())
    .filter(Boolean);
  const invalidActions = normalized.filter((action) => !AGENT_RUN_AUTOMATION_ACTIONS.includes(action));
  if (invalidActions.length > 0) {
    throw new Error(`Unsupported dry-run automation action: ${invalidActions.join(", ")}`);
  }
  return [...new Set(normalized)].sort();
}

function normalizeActualHostInvocation({
  plannedHostInvocation = null,
  spawnResult = {},
  invocationRecord = null,
} = {}) {
  const fromResult = spawnResult?.hostInvocation || {};
  return {
    source: firstNonEmptyString(
      fromResult.source,
      spawnResult.hostInvocationSource,
      invocationRecord?.host_invocation_source,
      invocationRecord?.hostInvocationSource,
      plannedHostInvocation?.source,
    ),
    invocationId: firstNonEmptyString(
      fromResult.invocationId,
      spawnResult.hostInvocationId,
      spawnResult.invocationId,
      invocationRecord?.invocation_id,
      invocationRecord?.invocationId,
    ),
    agentId: firstNonEmptyString(
      fromResult.agentId,
      spawnResult.agentId,
      invocationRecord?.agent_id,
      invocationRecord?.agentId,
      plannedHostInvocation?.agentId,
    ),
    host: firstNonEmptyString(fromResult.host, spawnResult.host, plannedHostInvocation?.host, "codex"),
    traceId: firstNonEmptyString(fromResult.traceId, spawnResult.traceId, invocationRecord?.trace_id, invocationRecord?.traceId) || null,
    spanId: firstNonEmptyString(fromResult.spanId, spawnResult.spanId, invocationRecord?.span_id, invocationRecord?.spanId) || null,
  };
}

function firstReceiptOutputArtifact(receiptResult = null) {
  const firstHash = receiptResult?.receipt?.outputHashes?.[0] || receiptResult?.outputHashes?.[0] || null;
  return firstNonEmptyString(firstHash?.path, firstHash?.artifactPath, firstHash?.relPath);
}

function normalizeStringList(value = []) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(list.map((item) => String(item || "").trim()).filter(Boolean))];
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeRequiredId(value, name) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${name} must be a non-empty string`);
  return normalized;
}

function normalizeWorkKind(value = "implementation") {
  const normalized = String(value || "implementation").trim().toLowerCase().replace(/_/g, "-");
  if (["review", "final-sweep", "release-sweep"].includes(normalized)) return normalized;
  return "implementation";
}

function selectOutcomeKind({
  workKind = "implementation",
  blocked = false,
  dryRun = false,
  applied = false,
  spawned = false,
  receiptIssued = false,
  status = "planned",
} = {}) {
  if (blocked) return "blocked";
  if (workKind === "final-sweep" || workKind === "release-sweep") return "final-sweep-ready";
  if (workKind === "review") return "review-ready";
  const normalizedStatus = String(status || "").toLowerCase();
  if (normalizedStatus === "receipt-ready") return "receipt-ready";
  if (applied && spawned && receiptIssued) return "implementation-success";
  if (applied && spawned) return "implementation-spawned";
  if (dryRun) return "implementation-planned";
  return "implementation-pending";
}

function outcomeStatus(outcome = "") {
  if (outcome === "blocked") return "blocked";
  if (outcome === "implementation-success") return "success";
  if (outcome === "review-ready" || outcome === "final-sweep-ready" || outcome === "receipt-ready") return "ready";
  if (outcome === "implementation-spawned") return "spawned";
  return "planned";
}

function agentOutcomeMessage(outcome = "") {
  switch (outcome) {
    case "implementation-success":
      return "Implementation work completed with receipt-bound output ready for controller review.";
    case "implementation-spawned":
      return "Implementation worker was spawned; receipt binding is still pending or external.";
    case "implementation-planned":
      return "Implementation worker dispatch is planned and waiting for apply.";
    case "review-ready":
      return "Review work is ready to run after implementation output is available.";
    case "final-sweep-ready":
      return "Final sweep work is ready for the release or graph closure gate.";
    case "receipt-ready":
      return "Agent output is ready for automatic receipt issuance.";
    case "blocked":
      return "Agent work is blocked; inspect issues before dispatch or acceptance.";
    default:
      return "Agent work is pending dispatch feedback.";
  }
}

function isRespawnAttempt(attempt = {}) {
  if (!isPlainObject(attempt)) return Boolean(attempt);
  const kind = String(attempt.kind || attempt.type || attempt.action || "").toLowerCase();
  const lifecycle = String(attempt.lifecycle || attempt.status || "").toLowerCase();
  return kind === "respawn" || lifecycle.includes("respawn");
}

function sanitizeId(value = "") {
  const sanitized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "unknown";
}
