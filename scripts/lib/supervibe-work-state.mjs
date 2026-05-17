export const WORK_STATE_V1_SCHEMA_VERSION = 1;

export const WORK_STATE_REQUIRED_FIELDS = Object.freeze([
  "schemaVersion",
  "workItemId",
  "state",
  "deps",
  "writeSet",
  "ownerCapability",
  "proofPolicy",
  "verificationMode",
  "updatedAt",
]);

export const WORK_ITEM_STATE_VALUES = Object.freeze([
  "open",
  "ready",
  "claimed",
  "blocked",
  "deferred",
  "review",
  "done",
  "closed",
  "skipped",
  "cancelled",
]);

export const WORK_ITEM_PROOF_POLICIES = Object.freeze([
  "artifact-evidence",
  "runtime-receipt-required",
  "trusted-receipt-required",
  "final-release-gate",
]);

export const WORK_ITEM_VERIFICATION_MODES = Object.freeze([
  "not-run",
  "syntax",
  "targeted",
  "deferred-release",
  "release",
]);

export const BLOCKER_V1_CODES = Object.freeze([
  "dependency-not-ready",
  "write-set-conflict",
  "receipt-missing",
  "verification-failed",
  "policy-hard-stop",
  "needs-human-input",
]);

export const BLOCKER_V1_PRIORITY = deepFreeze({
  "policy-hard-stop": 100,
  "write-set-conflict": 90,
  "verification-failed": 80,
  "receipt-missing": 70,
  "dependency-not-ready": 60,
  "needs-human-input": 50,
});

export const BLOCKER_V1_DEFAULTS = deepFreeze({
  "dependency-not-ready": {
    repairCommand: "node scripts/work-state-ready.mjs --why",
    releaseImpact: "Cannot mark ready until upstream dependencies are ready or explicitly deferred.",
  },
  "write-set-conflict": {
    repairCommand: "git status --short",
    releaseImpact: "Cannot safely claim or release while ownership conflicts are unresolved.",
  },
  "receipt-missing": {
    repairCommand: "node scripts/workflow-receipt.mjs recovery-status",
    releaseImpact: "Delegated workflow evidence is incomplete until trusted receipts are issued.",
  },
  "verification-failed": {
    repairCommand: "npm run check",
    releaseImpact: "Release gate remains blocked until the failing verification is repaired.",
  },
  "policy-hard-stop": {
    repairCommand: "node scripts/supervibe-commands.mjs --match \"<request>\"",
    releaseImpact: "Workflow must stop until the required command or policy route is satisfied.",
  },
  "needs-human-input": {
    repairCommand: null,
    releaseImpact: "Workflow remains blocked until the missing decision or approval is provided.",
  },
});

export const BLOCKER_V1_RENDERING_CONTRACT = deepFreeze({
  ready: { empty: "ready", blocked: "blocked", field: "ready" },
  why: { empty: "no blockers", blocked: "blocked", field: "why" },
  status: { empty: "ready", blocked: "blocked", field: "status" },
  "run-ready": { empty: "run-ready", blocked: "blocked", field: "runReady" },
});

export const MEMORY_CANDIDATE_V1_SCHEMA_VERSION = "MemoryCandidateV1";

export const MEMORY_CANDIDATE_V1_REQUIRED_FIELDS = Object.freeze([
  "schemaVersion",
  "candidateId",
  "summary",
  "evidenceRefs",
  "redactionStatus",
  "dedupeKey",
  "decisionState",
]);

export const MEMORY_CANDIDATE_V1_FIELDS = deepFreeze({
  evidenceRefs: {
    required: true,
    type: "string[]",
    purpose: "Pointers to source artifacts, receipts, command outputs, or review records that justify the memory candidate.",
  },
  redactionStatus: {
    required: true,
    type: "enum",
    purpose: "Tracks whether sensitive content review is pending, clean, redacted, or rejected before durable write.",
  },
  dedupeKey: {
    required: true,
    type: "string",
    purpose: "Stable key used to collapse repeated learnings before durable memory mutation.",
  },
  decisionState: {
    required: true,
    type: "enum",
    purpose: "Records the candidate lifecycle state before any durable project-memory write.",
  },
});

export const MEMORY_CANDIDATE_V1_REDACTION_STATUSES = Object.freeze([
  "pending-review",
  "redacted",
  "clean",
  "rejected-sensitive",
]);

export const MEMORY_CANDIDATE_V1_DECISION_STATES = Object.freeze([
  "candidate",
  "approved",
  "rejected",
  "deferred",
  "written",
]);

export const MEMORY_CANDIDATE_V1_DURABLE_WRITE_RULES = deepFreeze({
  candidateFirst: "Durable memory writes must start as MemoryCandidateV1 records before any guidance, memory, or host-instruction mutation.",
  evidenceRequired: "Every candidate must carry at least one evidenceRefs entry that points to the source artifact, receipt, command output, or review record.",
  redactionBeforeApproval: "Candidates cannot move to approved or written while redactionStatus is pending-review or rejected-sensitive.",
  dedupeBeforeWrite: "Candidates cannot move to written without a stable dedupeKey so repeated learnings collapse before durable write.",
  explicitDecision: "Only approved candidates may be promoted to written; rejected and deferred candidates must remain non-durable.",
});


export const SUPERVIBE_KILL_SWITCH_SCHEMA_VERSION = "SupervibeKillSwitchRegistryV1";

export const SUPERVIBE_KILL_SWITCH_NAMES = Object.freeze([
  "SUPERVIBE_WORK_FACADE",
  "SUPERVIBE_AGENT_BRIDGE_APPLY",
  "SUPERVIBE_INDEX_AUTOREPAIR",
  "SUPERVIBE_MEMORY_AUTONOMY",
  "SUPERVIBE_VERIFICATION_CACHE",
]);

export const SUPERVIBE_CLI_KILL_SWITCH_FLAGS = deepFreeze({
  "--dry-run-only": {
    disables: [
      "SUPERVIBE_AGENT_BRIDGE_APPLY",
      "SUPERVIBE_INDEX_AUTOREPAIR",
      "SUPERVIBE_MEMORY_AUTONOMY",
      "SUPERVIBE_VERIFICATION_CACHE",
    ],
    mode: "dry-run",
    reason: "Forces workflow mutations, auto-repair, autonomous memory writes, and verification cache use off.",
  },
  "--no-auto-repair": {
    disables: ["SUPERVIBE_INDEX_AUTOREPAIR"],
    mode: "repair-disabled",
    reason: "Disables automatic index repair; callers may still show repair commands.",
  },
  "--no-cache": {
    disables: ["SUPERVIBE_VERIFICATION_CACHE"],
    mode: "cache-disabled",
    reason: "Disables verification cache reads and writes for the current invocation.",
  },
});

export const SUPERVIBE_KILL_SWITCH_REGISTRY = deepFreeze({
  schemaVersion: SUPERVIBE_KILL_SWITCH_SCHEMA_VERSION,
  ciDefault: "fail-closed",
  configWritesAllowed: false,
  switches: {
    SUPERVIBE_WORK_FACADE: {
      owner: "work-state",
      defaultEnabled: true,
      ciDefaultEnabled: false,
      description: "Enables the WorkState facade surface for plan, graph, and task workflow state reads.",
    },
    SUPERVIBE_AGENT_BRIDGE_APPLY: {
      owner: "agent-bridge",
      defaultEnabled: false,
      ciDefaultEnabled: false,
      description: "Allows bridge apply paths that materialize delegated agent outputs.",
    },
    SUPERVIBE_INDEX_AUTOREPAIR: {
      owner: "code-index",
      defaultEnabled: true,
      ciDefaultEnabled: false,
      description: "Allows bounded automatic Code RAG or CodeGraph index repair when health gates detect stale or missing rows.",
    },
    SUPERVIBE_MEMORY_AUTONOMY: {
      owner: "project-memory",
      defaultEnabled: false,
      ciDefaultEnabled: false,
      description: "Allows autonomous project-memory writes from workflow runtime decisions.",
    },
    SUPERVIBE_VERIFICATION_CACHE: {
      owner: "verification",
      defaultEnabled: true,
      ciDefaultEnabled: false,
      description: "Allows verification cache use for repeatable syntax and smoke checks.",
    },
  },
  cliFlags: SUPERVIBE_CLI_KILL_SWITCH_FLAGS,
});
const STATE_SET = new Set(WORK_ITEM_STATE_VALUES);
const PROOF_POLICY_SET = new Set(WORK_ITEM_PROOF_POLICIES);
const VERIFICATION_MODE_SET = new Set(WORK_ITEM_VERIFICATION_MODES);
const BLOCKER_CODE_SET = new Set(BLOCKER_V1_CODES);
const MEMORY_CANDIDATE_REDACTION_STATUS_SET = new Set(MEMORY_CANDIDATE_V1_REDACTION_STATUSES);
const MEMORY_CANDIDATE_DECISION_STATE_SET = new Set(MEMORY_CANDIDATE_V1_DECISION_STATES);
const KILL_SWITCH_NAME_SET = new Set(SUPERVIBE_KILL_SWITCH_NAMES);

export const WORK_STATE_V1_TRANSITIONS = deepFreeze({
  open: ["ready", "blocked", "deferred", "skipped", "cancelled"],
  ready: ["claimed", "blocked", "deferred", "skipped", "cancelled"],
  claimed: ["ready", "blocked", "review", "done", "closed", "cancelled"],
  blocked: ["ready", "deferred", "skipped", "cancelled"],
  deferred: ["ready", "blocked", "cancelled"],
  review: ["claimed", "ready", "blocked", "done", "closed", "cancelled"],
  done: [],
  closed: [],
  skipped: [],
  cancelled: [],
});

export const WORK_STATE_V1_FIXTURES = deepFreeze({
  valid: {
    schemaVersion: WORK_STATE_V1_SCHEMA_VERSION,
    workItemId: "task-001",
    state: "ready",
    deps: ["task-000"],
    writeSet: ["scripts/lib/example.mjs"],
    ownerCapability: "systems-analyst",
    proofPolicy: "artifact-evidence",
    verificationMode: "deferred-release",
    updatedAt: "2026-05-15T00:00:00.000Z",
  },
  missingRequiredField: {
    schemaVersion: WORK_STATE_V1_SCHEMA_VERSION,
    workItemId: "task-001",
    state: "ready",
  },
  invalidEnum: {
    schemaVersion: WORK_STATE_V1_SCHEMA_VERSION,
    workItemId: "task-001",
    state: "finished",
    deps: [],
    writeSet: [],
    ownerCapability: "systems-analyst",
    proofPolicy: "artifact-evidence",
    verificationMode: "deferred-release",
    updatedAt: "2026-05-15T00:00:00.000Z",
  },
  invalidTransition: {
    from: "done",
    to: "claimed",
  },
  blockerValid: {
    code: "receipt-missing",
    message: "Required reviewer receipt is missing.",
    repairCommand: "node scripts/workflow-receipt.mjs recovery-status",
    releaseImpact: "Delegated workflow evidence is incomplete until trusted receipts are issued.",
    priority: 70,
  },
  blockerInvalid: {
    code: "unknown-blocker",
    message: "Unknown blocker code.",
  },
  memoryCandidateValid: {
    schemaVersion: MEMORY_CANDIDATE_V1_SCHEMA_VERSION,
    candidateId: "memory-candidate-001",
    summary: "Run-level learnings are stored as candidates before any durable memory mutation.",
    evidenceRefs: [
      "artifacts/evidence/memory-autonomy-policy.md",
    ],
    redactionStatus: "clean",
    dedupeKey: "memory-autonomy:candidate-first-durable-write",
    decisionState: "candidate",
  },
  memoryCandidateApprovedWritable: {
    schemaVersion: MEMORY_CANDIDATE_V1_SCHEMA_VERSION,
    candidateId: "memory-candidate-approved-001",
    summary: "Approved memory candidates with evidence, redaction clearance, and a dedupe key may be promoted to durable memory.",
    evidenceRefs: [
      "artifacts/evidence/memory-autonomy-policy.md",
    ],
    redactionStatus: "redacted",
    dedupeKey: "memory-autonomy:approved-candidate-durable-write",
    decisionState: "approved",
  },
  memoryCandidateInvalidDurableWrite: {
    schemaVersion: MEMORY_CANDIDATE_V1_SCHEMA_VERSION,
    candidateId: "memory-candidate-002",
    summary: "Invalid durable write because it lacks evidence and redaction approval.",
    evidenceRefs: [],
    redactionStatus: "pending-review",
    dedupeKey: "",
    decisionState: "written",
  },
  killSwitchRegistryValid: SUPERVIBE_KILL_SWITCH_REGISTRY,
  killSwitchResolutionCiDefault: {
    env: { CI: "true" },
    argv: [],
    expected: {
      SUPERVIBE_WORK_FACADE: false,
      SUPERVIBE_AGENT_BRIDGE_APPLY: false,
      SUPERVIBE_INDEX_AUTOREPAIR: false,
      SUPERVIBE_MEMORY_AUTONOMY: false,
      SUPERVIBE_VERIFICATION_CACHE: false,
    },
  },
  killSwitchResolutionDryRunOnly: {
    env: { SUPERVIBE_WORK_FACADE: "1", SUPERVIBE_VERIFICATION_CACHE: "1" },
    argv: ["--dry-run-only"],
    expected: {
      SUPERVIBE_WORK_FACADE: true,
      SUPERVIBE_AGENT_BRIDGE_APPLY: false,
      SUPERVIBE_INDEX_AUTOREPAIR: false,
      SUPERVIBE_MEMORY_AUTONOMY: false,
      SUPERVIBE_VERIFICATION_CACHE: false,
    },
  },
});

export const WORK_COMMAND_ENVELOPE_V1_SCHEMA_VERSION = "WorkCommandEnvelopeV1";

export const WORK_STATE_CONTRACT_FIXTURE_PACK = deepFreeze({
  schemaVersion: "SupervibeWorkStateContractFixturePackV1",
  exports: [
    "WorkStateV1",
    "BlockerV1",
    "AgentRunRecordV1",
    "MemoryCandidateV1",
    "VerificationCacheRecordV2",
    "GateApprovalV1",
    "WorkCommandEnvelopeV1",
  ],
  WorkStateV1: {
    valid: WORK_STATE_V1_FIXTURES.valid,
    invalid: {
      missingRequiredField: WORK_STATE_V1_FIXTURES.missingRequiredField,
      invalidEnum: WORK_STATE_V1_FIXTURES.invalidEnum,
      invalidTransition: WORK_STATE_V1_FIXTURES.invalidTransition,
    },
  },
  BlockerV1: {
    valid: WORK_STATE_V1_FIXTURES.blockerValid,
    invalid: WORK_STATE_V1_FIXTURES.blockerInvalid,
  },
  AgentRunRecordV1: {
    valid: {
      schemaId: "supervibe.agent-run-record.v1",
      version: 1,
      taskId: "contract-fixture-pack-task",
      agentId: "fixture-worker",
      runId: "agent-run-contract-fixture",
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
    },
    invalid: {
      schemaId: "supervibe.agent-run-record.v1",
      version: 1,
      taskId: "",
      agentId: "fixture-worker",
      runId: "",
      lifecycle: "planned",
      automation: {
        actions: ["unsupported-action"],
        gateCRequired: false,
      },
      timestamps: {},
      evidence: null,
    },
  },
  MemoryCandidateV1: {
    valid: WORK_STATE_V1_FIXTURES.memoryCandidateValid,
    validWritable: WORK_STATE_V1_FIXTURES.memoryCandidateApprovedWritable,
    invalid: WORK_STATE_V1_FIXTURES.memoryCandidateInvalidDurableWrite,
  },
  VerificationCacheRecordV2: {
    valid: {
      schemaVersion: 2,
      command: "node",
      args: ["--check", "scripts/lib/supervibe-work-state.mjs"],
      inputContentHashes: {
        "scripts/lib/supervibe-work-state.mjs": "sha256:source",
      },
      gitHead: "abc123",
      scriptHash: "sha256:script",
      dependencyHash: "sha256:deps",
      envFingerprint: "node-v22.5.0-platform-win32",
      proofHashes: {
        stdout: "sha256:stdout",
      },
      result: {
        exitCode: 0,
        status: "pass",
      },
    },
    invalid: {
      schemaVersion: 2,
      command: "",
      args: ["--check"],
      inputContentHashes: {},
      gitHead: "",
      scriptHash: "sha256:script",
      dependencyHash: "sha256:deps",
      envFingerprint: "node-v22.5.0-platform-win32",
      proofHashes: {},
    },
  },
  GateApprovalV1: {
    valid: {
      schemaVersion: "GateApprovalV1",
      gate: "C",
      status: "approved",
      approvedBy: "quality-gate-reviewer",
      approvedAt: "2026-05-15T00:00:00.000Z",
      artifactId: "gate-c-approval-fixture",
    },
    invalid: {
      schemaVersion: "GateApprovalV1",
      gate: "C",
      status: "pending",
      approvedBy: "",
      approvedAt: "",
    },
  },
  WorkCommandEnvelopeV1: {
    valid: {
      schemaVersion: WORK_COMMAND_ENVELOPE_V1_SCHEMA_VERSION,
      command: "node",
      args: ["--check", "scripts/lib/supervibe-work-state.mjs"],
      cwd: ".",
      taskId: "contract-fixture-pack-task",
      allowedVerification: true,
      proofPolicy: "artifact-evidence",
    },
    invalid: {
      schemaVersion: WORK_COMMAND_ENVELOPE_V1_SCHEMA_VERSION,
      command: "npm",
      args: ["run", "check"],
      cwd: "",
      taskId: "",
      allowedVerification: false,
      proofPolicy: "unknown",
    },
  },
});

export class WorkStateValidationError extends Error {
  constructor(issues = []) {
    super(formatWorkStateIssues(issues));
    this.name = "WorkStateValidationError";
    this.issues = issues;
  }
}

export function createWorkStateV1(input = {}) {
  const record = normalizeWorkStateV1(input);
  const validation = validateWorkStateV1(record, { previousState: input.previousState });
  if (!validation.pass) throw new WorkStateValidationError(validation.issues);
  return record;
}

export function normalizeWorkStateV1(input = {}) {
  const now = input.updatedAt || new Date().toISOString();
  const record = {
    schemaVersion: Number(input.schemaVersion ?? WORK_STATE_V1_SCHEMA_VERSION),
    workItemId: String(input.workItemId || input.itemId || input.id || "").trim(),
    state: normalizeToken(input.state || "open"),
    deps: normalizeStringList(input.deps || input.dependencies || input.blockedBy),
    writeSet: normalizeWriteSet(input.writeSet || input.writeScope),
    ownerCapability: String(input.ownerCapability || input.owner || "").trim(),
    proofPolicy: normalizeToken(input.proofPolicy || "artifact-evidence"),
    verificationMode: normalizeToken(input.verificationMode || "deferred-release"),
    updatedAt: String(now).trim(),
  };

  if (Array.isArray(input.blockers)) record.blockers = input.blockers.map(normalizeBlocker).filter(Boolean);
  if (input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)) {
    record.metadata = { ...input.metadata };
  }
  return record;
}

export function validateWorkStateV1(record = {}, options = {}) {
  const issues = [];
  for (const field of WORK_STATE_REQUIRED_FIELDS) {
    if (record[field] === undefined || record[field] === null || record[field] === "") {
      issues.push(issue("missing-required-field", field, `${field} is required for WorkStateV1.`));
    }
  }

  if (record.schemaVersion !== WORK_STATE_V1_SCHEMA_VERSION) {
    issues.push(issue("schema-version", "schemaVersion", `schemaVersion must be ${WORK_STATE_V1_SCHEMA_VERSION}.`));
  }
  if (!isStrongString(record.workItemId)) issues.push(issue("invalid-work-item-id", "workItemId", "workItemId must be a non-empty string."));
  if (!STATE_SET.has(record.state)) issues.push(issue("invalid-state", "state", `state must be one of: ${WORK_ITEM_STATE_VALUES.join(", ")}.`));
  if (!Array.isArray(record.deps) || !record.deps.every(isStrongString)) issues.push(issue("invalid-deps", "deps", "deps must be an array of non-empty strings."));
  if (!Array.isArray(record.writeSet) || !record.writeSet.every(isWriteSetEntry)) {
    issues.push(issue("invalid-write-set", "writeSet", "writeSet must be an array of non-empty path strings or { path, action } entries."));
  }
  if (!isStrongString(record.ownerCapability)) {
    issues.push(issue("invalid-owner-capability", "ownerCapability", "ownerCapability must be a non-empty string."));
  }
  if (!PROOF_POLICY_SET.has(record.proofPolicy)) {
    issues.push(issue("invalid-proof-policy", "proofPolicy", `proofPolicy must be one of: ${WORK_ITEM_PROOF_POLICIES.join(", ")}.`));
  }
  if (!VERIFICATION_MODE_SET.has(record.verificationMode)) {
    issues.push(issue("invalid-verification-mode", "verificationMode", `verificationMode must be one of: ${WORK_ITEM_VERIFICATION_MODES.join(", ")}.`));
  }
  if (!isIsoDateLike(record.updatedAt)) {
    issues.push(issue("invalid-updated-at", "updatedAt", "updatedAt must be an ISO-like timestamp string."));
  }
  if (options.previousState) {
    issues.push(...validateWorkStateTransition({ from: options.previousState, to: record.state, workItemId: record.workItemId }).issues);
  }
  if (record.blockers !== undefined) {
    if (!Array.isArray(record.blockers)) {
      issues.push(issue("invalid-blockers", "blockers", "blockers must be an array of BlockerV1 entries."));
    } else {
      record.blockers.forEach((blocker, index) => {
        issues.push(...validateBlockerV1(blocker, { fieldPrefix: `blockers[${index}]` }).issues);
      });
    }
  }

  return {
    schemaVersion: WORK_STATE_V1_SCHEMA_VERSION,
    pass: issues.length === 0,
    workItemId: record.workItemId || null,
    state: record.state || null,
    issues,
  };
}

export function createBlockerV1(input = {}) {
  const record = normalizeBlocker(input);
  const validation = validateBlockerV1(record);
  if (!validation.pass) throw new WorkStateValidationError(validation.issues);
  return record;
}

export function validateBlockerV1(blocker = {}, options = {}) {
  const fieldPrefix = options.fieldPrefix || "blocker";
  const issues = [];
  if (!blocker || typeof blocker !== "object" || Array.isArray(blocker)) {
    issues.push(issue("invalid-blocker", fieldPrefix, "BlockerV1 must be an object."));
    return blockerValidationResult(blocker, issues);
  }

  if (!BLOCKER_CODE_SET.has(blocker.code)) {
    issues.push(issue("invalid-blocker-code", `${fieldPrefix}.code`, `code must be one of: ${BLOCKER_V1_CODES.join(", ")}.`));
  }
  if (!isStrongString(blocker.message)) {
    issues.push(issue("invalid-blocker-message", `${fieldPrefix}.message`, "message must be a non-empty string."));
  }
  if (blocker.repairCommand !== null && blocker.repairCommand !== undefined && !isStrongString(blocker.repairCommand)) {
    issues.push(issue("invalid-blocker-repair-command", `${fieldPrefix}.repairCommand`, "repairCommand must be null or a non-empty string."));
  }
  if (!isStrongString(blocker.releaseImpact)) {
    issues.push(issue("invalid-blocker-release-impact", `${fieldPrefix}.releaseImpact`, "releaseImpact must be a non-empty string."));
  }
  if (!Number.isInteger(blocker.priority)) {
    issues.push(issue("invalid-blocker-priority", `${fieldPrefix}.priority`, "priority must be an integer."));
  }

  return blockerValidationResult(blocker, issues);
}

export function renderBlockerV1Status(blockers = [], mode = "status") {
  const contract = BLOCKER_V1_RENDERING_CONTRACT[mode] || BLOCKER_V1_RENDERING_CONTRACT.status;
  const normalized = normalizeBlockers(blockers);
  if (!normalized.length) return { mode, [contract.field]: contract.empty, blockers: [] };
  return { mode, [contract.field]: contract.blocked, blockers: normalized };
}

export function createMemoryCandidateV1(input = {}) {
  const record = normalizeMemoryCandidateV1(input);
  const validation = validateMemoryCandidateV1(record);
  if (!validation.pass) throw new WorkStateValidationError(validation.issues);
  return record;
}

export function normalizeMemoryCandidateV1(input = {}) {
  const summary = String(input.summary || input.learning || input.text || "").replace(/\s+/g, " ").trim();
  const baseKey = createMemoryDedupeKey([input.type || "memory", input.scope || "repo", summary]);
  const candidateId = String(input.candidateId || input.id || "").trim() || baseKey;
  return {
    schemaVersion: input.schemaVersion || MEMORY_CANDIDATE_V1_SCHEMA_VERSION,
    candidateId,
    summary,
    evidenceRefs: normalizeStringList(input.evidenceRefs || input.evidence || input.evidencePaths),
    redactionStatus: normalizeToken(input.redactionStatus || input.redaction_status || "pending-review"),
    dedupeKey: String(input.dedupeKey || input.dedupe_key || "").trim() || baseKey,
    decisionState: normalizeToken(input.decisionState || input.decision_state || input.status || "candidate"),
  };
}

export function validateMemoryCandidateV1(record = {}) {
  const issues = [];
  for (const field of MEMORY_CANDIDATE_V1_REQUIRED_FIELDS) {
    if (record[field] === undefined || record[field] === null || record[field] === "") {
      issues.push(issue("missing-memory-candidate-field", field, `${field} is required for MemoryCandidateV1.`));
    }
  }

  if (record.schemaVersion !== MEMORY_CANDIDATE_V1_SCHEMA_VERSION) {
    issues.push(issue("invalid-memory-candidate-schema", "schemaVersion", `schemaVersion must be ${MEMORY_CANDIDATE_V1_SCHEMA_VERSION}.`));
  }
  if (!isStrongString(record.candidateId)) issues.push(issue("invalid-memory-candidate-id", "candidateId", "candidateId must be a non-empty string."));
  if (!isStrongString(record.summary)) issues.push(issue("invalid-memory-candidate-summary", "summary", "summary must be a non-empty string."));
  if (!Array.isArray(record.evidenceRefs) || !record.evidenceRefs.every(isStrongString)) {
    issues.push(issue("invalid-memory-candidate-evidence", "evidenceRefs", "evidenceRefs must be an array of non-empty strings."));
  } else if (record.evidenceRefs.length === 0) {
    issues.push(issue("missing-memory-candidate-evidence", "evidenceRefs", "MemoryCandidateV1 requires at least one evidence reference."));
  }
  if (!MEMORY_CANDIDATE_REDACTION_STATUS_SET.has(record.redactionStatus)) {
    issues.push(issue("invalid-memory-candidate-redaction-status", "redactionStatus", `redactionStatus must be one of: ${MEMORY_CANDIDATE_V1_REDACTION_STATUSES.join(", ")}.`));
  }
  if (!isStrongString(record.dedupeKey)) issues.push(issue("invalid-memory-candidate-dedupe-key", "dedupeKey", "dedupeKey must be a non-empty stable string."));
  if (!MEMORY_CANDIDATE_DECISION_STATE_SET.has(record.decisionState)) {
    issues.push(issue("invalid-memory-candidate-decision-state", "decisionState", `decisionState must be one of: ${MEMORY_CANDIDATE_V1_DECISION_STATES.join(", ")}.`));
  }

  if (["approved", "written"].includes(record.decisionState) && !["clean", "redacted"].includes(record.redactionStatus)) {
    issues.push(issue("memory-candidate-redaction-not-cleared", "redactionStatus", "approved and written candidates require redactionStatus clean or redacted."));
  }
  if (record.decisionState === "written" && record.redactionStatus === "rejected-sensitive") {
    issues.push(issue("memory-candidate-sensitive-write", "decisionState", "rejected-sensitive candidates cannot be written to durable memory."));
  }
  if (record.decisionState === "written" && !isStrongString(record.dedupeKey)) {
    issues.push(issue("memory-candidate-write-without-dedupe", "dedupeKey", "written candidates require a stable dedupeKey."));
  }

  return {
    schemaVersion: MEMORY_CANDIDATE_V1_SCHEMA_VERSION,
    pass: issues.length === 0,
    candidateId: record.candidateId || null,
    decisionState: record.decisionState || null,
    issues,
  };
}

export function canWriteMemoryCandidateV1(record = {}) {
  const validation = validateMemoryCandidateV1(record);
  const writeIssues = [];
  if (record.decisionState !== "approved") {
    writeIssues.push(issue("memory-candidate-not-approved", "decisionState", "Only approved MemoryCandidateV1 records can be promoted to durable memory."));
  }
  if (!["clean", "redacted"].includes(record.redactionStatus)) {
    writeIssues.push(issue("memory-candidate-redaction-not-cleared", "redactionStatus", "Durable memory writes require clean or redacted candidates."));
  }
  return {
    schemaVersion: MEMORY_CANDIDATE_V1_SCHEMA_VERSION,
    pass: validation.pass && writeIssues.length === 0,
    candidateId: record.candidateId || null,
    issues: [...validation.issues, ...writeIssues],
  };
}

export function validateMemoryCandidateDurableWriteV1(record = {}) {
  return canWriteMemoryCandidateV1(record);
}

export function validateWorkStateTransition({ from, to, workItemId = null } = {}) {
  const normalizedFrom = normalizeToken(from);
  const normalizedTo = normalizeToken(to);
  const issues = [];
  if (!STATE_SET.has(normalizedFrom)) issues.push(issue("invalid-from-state", "from", `Unknown from state: ${from}.`, { workItemId }));
  if (!STATE_SET.has(normalizedTo)) issues.push(issue("invalid-to-state", "to", `Unknown to state: ${to}.`, { workItemId }));
  if (issues.length === 0 && normalizedFrom !== normalizedTo && !WORK_STATE_V1_TRANSITIONS[normalizedFrom].includes(normalizedTo)) {
    issues.push(issue("invalid-transition", "state", `Invalid WorkStateV1 transition: ${normalizedFrom} -> ${normalizedTo}.`, {
      from: normalizedFrom,
      to: normalizedTo,
      workItemId,
      allowedTo: WORK_STATE_V1_TRANSITIONS[normalizedFrom],
    }));
  }
  return {
    schemaVersion: WORK_STATE_V1_SCHEMA_VERSION,
    pass: issues.length === 0,
    from: normalizedFrom,
    to: normalizedTo,
    issues,
  };
}

export function formatWorkStateIssues(issues = []) {
  if (!issues.length) return "WorkStateV1 validation passed.";
  return issues.map((item) => `${item.code}:${item.field} ${item.message}`).join("; ");
}


export function validateSupervibeKillSwitchRegistryV1(registry = SUPERVIBE_KILL_SWITCH_REGISTRY) {
  const issues = [];
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    return killSwitchValidationResult(registry, [issue("invalid-kill-switch-registry", "registry", "Kill switch registry must be an object.")]);
  }
  if (registry.schemaVersion !== SUPERVIBE_KILL_SWITCH_SCHEMA_VERSION) {
    issues.push(issue("invalid-kill-switch-schema-version", "schemaVersion", `schemaVersion must be ${SUPERVIBE_KILL_SWITCH_SCHEMA_VERSION}.`));
  }
  if (registry.ciDefault !== "fail-closed") {
    issues.push(issue("invalid-kill-switch-ci-default", "ciDefault", "CI default must be fail-closed."));
  }
  if (registry.configWritesAllowed !== false) {
    issues.push(issue("invalid-kill-switch-config-writes", "configWritesAllowed", "Kill switch resolution must not write project config."));
  }
  for (const name of SUPERVIBE_KILL_SWITCH_NAMES) {
    const entry = registry.switches?.[name];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      issues.push(issue("missing-kill-switch", `switches.${name}`, `${name} must be declared.`));
      continue;
    }
    if (entry.ciDefaultEnabled !== false) {
      issues.push(issue("invalid-kill-switch-ci-default-enabled", `switches.${name}.ciDefaultEnabled`, `${name} must fail closed in CI.`));
    }
    if (typeof entry.defaultEnabled !== "boolean") {
      issues.push(issue("invalid-kill-switch-default", `switches.${name}.defaultEnabled`, `${name}.defaultEnabled must be boolean.`));
    }
    if (!isStrongString(entry.owner)) {
      issues.push(issue("invalid-kill-switch-owner", `switches.${name}.owner`, `${name}.owner must be a non-empty string.`));
    }
    if (!isStrongString(entry.description)) {
      issues.push(issue("invalid-kill-switch-description", `switches.${name}.description`, `${name}.description must be a non-empty string.`));
    }
  }
  for (const name of Object.keys(registry.switches || {})) {
    if (!KILL_SWITCH_NAME_SET.has(name)) issues.push(issue("unknown-kill-switch", `switches.${name}`, `${name} is not a registered kill switch.`));
  }
  for (const [flag, entry] of Object.entries(registry.cliFlags || {})) {
    if (!SUPERVIBE_CLI_KILL_SWITCH_FLAGS[flag]) {
      issues.push(issue("unknown-kill-switch-cli-flag", `cliFlags.${flag}`, `${flag} is not a registered kill switch CLI flag.`));
    }
    if (!Array.isArray(entry.disables) || !entry.disables.every((name) => KILL_SWITCH_NAME_SET.has(name))) {
      issues.push(issue("invalid-kill-switch-cli-flag", `cliFlags.${flag}.disables`, `${flag}.disables must reference registered kill switches.`));
    }
  }
  return killSwitchValidationResult(registry, issues);
}

export function resolveSupervibeKillSwitches({
  env = process.env,
  argv = process.argv.slice(2),
  registry = SUPERVIBE_KILL_SWITCH_REGISTRY,
} = {}) {
  const validation = validateSupervibeKillSwitchRegistryV1(registry);
  if (!validation.pass) throw new WorkStateValidationError(validation.issues);
  const ci = isCiEnvironment(env);
  const flags = new Set(argv || []);
  const disabledByFlag = new Map();
  for (const [flag, flagContract] of Object.entries(registry.cliFlags || {})) {
    if (!flags.has(flag)) continue;
    for (const name of flagContract.disables || []) disabledByFlag.set(name, flag);
  }

  const switches = {};
  for (const name of SUPERVIBE_KILL_SWITCH_NAMES) {
    const entry = registry.switches[name];
    const envValue = parseSwitchEnvValue(env?.[name]);
    const defaultEnabled = ci ? entry.ciDefaultEnabled : entry.defaultEnabled;
    const enabledBeforeFlags = envValue === null ? defaultEnabled : envValue;
    const flag = disabledByFlag.get(name);
    switches[name] = {
      enabled: flag ? false : enabledBeforeFlags,
      source: flag ? "cli-flag" : envValue === null ? (ci ? "ci-default" : "default") : "env",
      flag: flag || null,
      envVar: name,
      configWrite: false,
    };
  }
  return {
    schemaVersion: registry.schemaVersion,
    ci,
    failClosed: ci,
    configWritesAllowed: false,
    switches,
  };
}

export function assertSupervibeKillSwitchEnabled(name, resolution = resolveSupervibeKillSwitches()) {
  if (!KILL_SWITCH_NAME_SET.has(name)) {
    throw new WorkStateValidationError([issue("unknown-kill-switch", "name", `${name} is not a registered kill switch.`)]);
  }
  const state = resolution.switches?.[name];
  if (!state?.enabled) {
    const error = new Error(`${name} is disabled by ${state?.source || "kill-switch"}.`);
    error.name = "SupervibeKillSwitchDisabledError";
    error.code = "SUPERVIBE_KILL_SWITCH_DISABLED";
    error.switchName = name;
    error.source = state?.source || "unknown";
    error.flag = state?.flag || null;
    throw error;
  }
  return true;
}
function normalizeStringList(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(list.map((item) => String(item || "").trim()).filter(Boolean))];
}

function normalizeWriteSet(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (entry && typeof entry === "object") {
        const path = String(entry.path || entry.file || "").trim();
        if (!path) return "";
        const action = String(entry.action || "touch").trim();
        return action ? { action, path } : { path };
      }
      return "";
    })
    .filter(Boolean);
}

function normalizeBlocker(blocker) {
  if (!blocker || typeof blocker !== "object") return null;
  const code = normalizeToken(blocker.code || blocker.reason || "");
  if (!code) return null;
  const defaults = BLOCKER_V1_DEFAULTS[code] || {};
  const repairCommand = blocker.repairCommand === undefined ? defaults.repairCommand : blocker.repairCommand;
  const releaseImpact = blocker.releaseImpact === undefined ? defaults.releaseImpact : blocker.releaseImpact;
  return {
    code,
    message: String(blocker.message || blocker.reason || code).trim(),
    repairCommand: repairCommand ? String(repairCommand).trim() : null,
    releaseImpact: String(releaseImpact || "").trim(),
    priority: Number(blocker.priority ?? BLOCKER_V1_PRIORITY[code] ?? 0),
  };
}

function normalizeBlockers(blockers) {
  const list = Array.isArray(blockers) ? blockers : blockers ? [blockers] : [];
  return list.map(normalizeBlocker).filter(Boolean).sort((left, right) => right.priority - left.priority || left.code.localeCompare(right.code));
}

function blockerValidationResult(blocker, issues) {
  return {
    schemaVersion: WORK_STATE_V1_SCHEMA_VERSION,
    pass: issues.length === 0,
    code: blocker && blocker.code ? blocker.code : null,
    issues,
  };
}

function normalizeToken(value) {
  return String(value || "").trim().toLowerCase().replace(/_/g, "-");
}

function isStrongString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isWriteSetEntry(entry) {
  if (isStrongString(entry)) return true;
  return Boolean(entry && typeof entry === "object" && isStrongString(entry.path));
}

function isIsoDateLike(value) {
  return isStrongString(value) && !Number.isNaN(Date.parse(value));
}

function issue(code, field, message, extra = {}) {
  return { code, field, message, ...extra };
}

function createMemoryDedupeKey(parts) {
  return parts
    .map((part) => String(part || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .join(":")
    .slice(0, 160);
}


function killSwitchValidationResult(registry, issues) {
  return {
    schemaVersion: SUPERVIBE_KILL_SWITCH_SCHEMA_VERSION,
    pass: issues.length === 0,
    switchCount: registry?.switches ? Object.keys(registry.switches).length : 0,
    issues,
  };
}

function parseSwitchEnvValue(value) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) return false;
  return null;
}

function isCiEnvironment(env = {}) {
  return parseSwitchEnvValue(env.CI) === true
    || parseSwitchEnvValue(env.GITHUB_ACTIONS) === true
    || parseSwitchEnvValue(env.BUILD_BUILDID) === true
    || parseSwitchEnvValue(env.TF_BUILD) === true;
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
