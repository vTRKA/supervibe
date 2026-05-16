import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  assertWorkflowStageId,
} from "./workflow-stage-registry.mjs";
import {
  appendTraceSpan,
  createTraceContext,
  createTraceSpan,
} from "./supervibe-runtime-trace.mjs";
import {
  createWorkflowReceiptEvidenceSnapshot,
  validateWorkflowReceiptEvidenceSnapshot,
  workflowReceiptLiveOutputDiagnostics,
} from "./supervibe-receipt-snapshot-store.mjs";
import {
  findWorkflowReceiptIndexMatches,
  rebuildWorkflowReceiptIndex,
  upsertWorkflowReceiptIndex,
} from "./supervibe-receipt-index.mjs";

export const WORKFLOW_RECEIPT_ISSUER = "supervibe-workflow-receipt-runtime";

const ALGORITHM = "hmac-sha256";
const KEY_RELATIVE_PATH = ".supervibe/memory/workflow-receipt-runtime.key";
const LEDGER_RELATIVE_PATH = ".supervibe/memory/workflow-invocation-ledger.jsonl";
const LEDGER_LOCK_RELATIVE_PATH = ".supervibe/memory/workflow-invocation-ledger.lock";
const DEFAULT_RECEIPT_DIR = ".supervibe/artifacts/_workflow-invocations";
const ARTIFACT_LINKS_FILE = "artifact-links.json";
const COMPACT_MANIFEST_TYPE = "supervibe-agent-output-compact-manifest";
const GENERATED_STATE_RECOVERY_TYPE = "supervibe-generated-state-recovery-policy";
const GENERATED_STATE_RECOVERY_LOCK_RELATIVE_PATH = ".supervibe/memory/generated-state-recovery.lock";
const RECEIPT_LOCK_TIMEOUT_MS = 30_000;
const RECEIPT_LOCK_RETRY_MS = 25;
const MUTABLE_OUTPUT_PATTERNS = Object.freeze([
  /^\.supervibe\/memory\/agent-invocations\.jsonl$/i,
  /^\.supervibe\/memory\/workflow-invocation-ledger\.jsonl$/i,
  /^\.supervibe\/memory\/workflow-receipt-runtime\.key$/i,
  /^\.supervibe\/memory\/workflow-invocation-ledger\.lock$/i,
  /^\.supervibe\/memory\/index\.json$/i,
  /^\.supervibe\/memory\/active-plan\.json$/i,
  /^\.supervibe\/memory\/work-items\/index\.json$/i,
  /^\.supervibe\/memory\/loops\/task-tracker-map\.json$/i,
  /^\.supervibe\/memory\/(?:.+\/)?state\.json$/i,
  /\.jsonl$/i,
  /\.log$/i,
  /\.lock$/i,
  /\.key$/i,
]);
export const WORKFLOW_RECEIPT_REPAIR_OPERATIONS = Object.freeze([
  "inspect",
  "reissue",
  "prune-stale",
  "rebuild-ledger",
  "recovery-status",
]);
const WORKFLOW_RECEIPT_REPAIR_OPERATION_SET = new Set(WORKFLOW_RECEIPT_REPAIR_OPERATIONS);
const GENERATED_STATE_PATTERNS = Object.freeze([
  /^\.supervibe\/memory\/code\.db$/i,
  /^\.supervibe\/memory\/index\.json$/i,
  /^\.supervibe\/memory\/work-items\/index\.json$/i,
  /^\.supervibe\/memory\/workflow-invocation-ledger\.jsonl$/i,
  /^\.supervibe\/memory\/workflow-receipt-runtime\.key$/i,
  /^\.supervibe\/memory\/active-plan\.json$/i,
  /^\.supervibe\/memory\/active-workflows?\.json$/i,
]);

export function defaultWorkflowReceiptKeyPath(rootDir = process.cwd()) {
  return join(rootDir, ...KEY_RELATIVE_PATH.split("/"));
}

export function defaultWorkflowReceiptLedgerPath(rootDir = process.cwd()) {
  return join(rootDir, ...LEDGER_RELATIVE_PATH.split("/"));
}

function defaultWorkflowReceiptLedgerLockPath(rootDir = process.cwd()) {
  return join(rootDir, ...LEDGER_LOCK_RELATIVE_PATH.split("/"));
}

export function defaultGeneratedStateRecoveryLockPath(rootDir = process.cwd()) {
  return join(rootDir, ...GENERATED_STATE_RECOVERY_LOCK_RELATIVE_PATH.split("/"));
}

export async function issueWorkflowInvocationReceipt({
  rootDir = process.cwd(),
  command,
  subjectType = "command",
  subjectId,
  agentId = null,
  skillId = null,
  stage,
  invocationReason,
  inputEvidence = [],
  outputArtifacts = [],
  allowMutableOutputArtifacts = false,
  snapshotEvidence = true,
  startedAt,
  completedAt = null,
  runTimestamp = null,
  handoffId,
  receiptDir = null,
  receiptPrefix = "workflow",
  secret = null,
  hostInvocation = null,
  taskId = null,
  workItemId = null,
  graphId = null,
  workGraphId = null,
  allowMissingHostInvocationProof = false,
  recovery = null,
} = {}) {
  if (!command) throw new Error("command required");
  if (!subjectId) throw new Error("subjectId required");
  if (!stage) throw new Error("stage required");
  if (!invocationReason) throw new Error("invocationReason required");
  if (!handoffId) throw new Error("handoffId required");
  if (!outputArtifacts?.length) throw new Error("outputArtifacts required");
  assertWorkflowStageId({ command, stage });
  if (isHostAgentSubject(subjectType) && !hostInvocation && !allowMissingHostInvocationProof) {
    throw new Error("hostInvocation proof required for agent, worker, and reviewer receipts");
  }
  if (!allowMutableOutputArtifacts) assertReceiptableOutputArtifacts(outputArtifacts, rootDir);
  const normalizedHostInvocation = enrichHostInvocationProof(rootDir, hostInvocation);
  if (isHostAgentSubject(subjectType) && !allowMissingHostInvocationProof) {
    assertHostInvocationProofExists(rootDir, normalizedHostInvocation, agentId || subjectId);
  }

  const resolvedSecret = await ensureReceiptSecret(rootDir, secret);
  const resolvedRunTimestamp = resolveWorkflowRunTimestamp({ runTimestamp, startedAt, completedAt });
  const absReceiptDir = receiptDir
    ? resolveReceiptDir(rootDir, receiptDir)
    : join(rootDir, ...DEFAULT_RECEIPT_DIR.split("/"), sanitizeId(command), sanitizeId(handoffId));
  const receiptPath = join(absReceiptDir, `${sanitizeId(subjectId)}-${sanitizeId(stage)}.json`);
  const relReceiptPath = normalizeRelPath(relative(rootDir, receiptPath));
  const issuedAt = resolvedRunTimestamp;
  const keyId = keyIdForSecret(resolvedSecret);
  const inputHashes = inputEvidence.map((path) => hashEvidencePath(rootDir, path, { required: false }));
  const outputHashes = outputArtifacts.map((path) => hashEvidencePath(rootDir, path, { required: true }));
  const receiptId = `${sanitizeId(receiptPrefix)}-${createHash("sha1")
    .update(`${command}:${subjectType}:${subjectId}:${stage}:${handoffId}:${issuedAt}`)
    .digest("hex")
    .slice(0, 12)}`;
  const workItemBinding = normalizeWorkItemBinding({
    taskId,
    workItemId,
    graphId,
    workGraphId,
  });
  const evidenceSnapshot = snapshotEvidence === false
    ? null
    : await createWorkflowReceiptEvidenceSnapshot({
      rootDir,
      receiptId,
      command,
      subjectType,
      subjectId,
      stage,
      handoffId,
      createdAt: issuedAt,
      inputHashes,
      outputHashes,
      workItemBinding,
    });

  const runtime = {
    issuer: WORKFLOW_RECEIPT_ISSUER,
    issuedAt,
    runTimestamp: resolvedRunTimestamp,
    keyId,
    algorithm: ALGORITHM,
  };
  const canonical = {
    schemaVersion: 2,
    receiptId,
    command,
    invokedBy: command.replace(/^\//, ""),
    subjectType,
    subjectId,
    agentId,
    skillId,
    stage,
    status: "completed",
    invocationReason,
    inputEvidence: normalizePathList(inputEvidence, rootDir),
    outputArtifacts: normalizePathList(outputArtifacts, rootDir),
    inputHashes,
    outputHashes,
    startedAt: startedAt || resolvedRunTimestamp,
    completedAt: completedAt || resolvedRunTimestamp,
    handoffId,
    runtime,
  };
  if (normalizedHostInvocation) canonical.hostInvocation = normalizedHostInvocation;
  if (evidenceSnapshot) canonical.evidenceSnapshot = evidenceSnapshot;
  if (workItemBinding) canonical.workItemBinding = workItemBinding;
  const normalizedRecovery = normalizeRecoveryMetadata(recovery);
  if (normalizedRecovery) {
    canonical.recovery = normalizedRecovery;
    if (normalizedRecovery.originalReceiptId) {
      canonical.supersedes = {
        receiptId: normalizedRecovery.originalReceiptId,
        receiptPath: normalizedRecovery.originalReceiptPath || null,
        reason: normalizedRecovery.reason || null,
      };
    }
  }
  const canonicalHash = sha256(stableStringify(canonical));
  const signature = signCanonical(canonical, resolvedSecret);
  const receipt = {
    ...canonical,
    runtime: {
      ...runtime,
      canonicalHash,
      signature,
    },
  };

  const { relArtifactLinksPath, ledgerEntry } = await withWorkflowReceiptLedgerLock(rootDir, async () => {
    await mkdir(absReceiptDir, { recursive: true });
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

    const artifactLinksPath = join(absReceiptDir, ARTIFACT_LINKS_FILE);
    const relLinksPath = normalizeRelPath(relative(rootDir, artifactLinksPath));
    await upsertArtifactLinks(artifactLinksPath, receipt, relReceiptPath);

    const entry = await upsertReceiptLedger(rootDir, {
      receiptId,
      command,
      subjectType,
      subjectId,
      workItemBinding,
      receiptPath: relReceiptPath,
      artifactLinksPath: relLinksPath,
      canonicalHash,
      signature,
      issuedAt,
    });
    await upsertWorkflowReceiptIndex(rootDir, { ...receipt, __file: relReceiptPath }, relReceiptPath);
    return { relArtifactLinksPath: relLinksPath, ledgerEntry: entry };
  });

  const traceContext = createTraceContext({
    traceId: normalizedHostInvocation?.traceId || undefined,
    parentSpanId: normalizedHostInvocation?.spanId || null,
  });
  const receiptSpan = createTraceSpan({
    name: "supervibe.workflow.receipt.issue",
    traceId: traceContext.traceId,
    parentSpanId: traceContext.parentSpanId,
    startTime: startedAt || resolvedRunTimestamp,
    endTime: completedAt || resolvedRunTimestamp,
    status: "ok",
    attributes: {
      "supervibe.workflow.command": command,
      "supervibe.workflow.stage": stage,
      "supervibe.workflow.subject_type": subjectType,
      "supervibe.workflow.subject_id": subjectId,
      "supervibe.workflow.handoff_id": handoffId,
      "supervibe.workflow.receipt_id": receiptId,
      "supervibe.workflow.receipt_path": relReceiptPath,
      ...(workItemBinding ? {
        "supervibe.workflow.graph_id": workItemBinding.graphId || "",
        "supervibe.workflow.task_id": workItemBinding.taskId || "",
      } : {}),
    },
    links: normalizedHostInvocation?.traceId
      ? [{
          traceId: normalizedHostInvocation.traceId,
          spanId: normalizedHostInvocation.spanId || null,
          attributes: { "supervibe.link.type": "hostInvocation" },
        }]
      : [],
  });
  await appendTraceSpan({ rootDir, span: receiptSpan }).catch(() => null);

  return {
    receipt,
    receiptPath: relReceiptPath,
    artifactLinksPath: relArtifactLinksPath,
    ledgerEntry,
  };
}

export function validateWorkflowReceiptTrust(rootDir = process.cwd(), receipt = {}, options = {}) {
  const issues = [];
  const diagnostics = [];
  const secret = options.secret ?? readReceiptSecretSync(rootDir);
  if (!receipt?.receiptId) {
    return { pass: false, issues: ["receiptId missing"], diagnostics };
  }
  if (receipt.runtime?.issuer !== WORKFLOW_RECEIPT_ISSUER) {
    issues.push("runtime issuer missing or invalid");
  }
  if (receipt.runtime?.algorithm !== ALGORITHM) {
    issues.push("runtime signature algorithm missing or invalid");
  }
  if (!receipt.runtime?.canonicalHash || !receipt.runtime?.signature) {
    issues.push("runtime canonicalHash/signature missing");
  }
  if (!secret) {
    issues.push("receipt runtime secret missing");
  }

  if (secret && receipt.runtime?.signature) {
    const canonical = canonicalReceiptForVerification(receipt);
    const expectedHash = sha256(stableStringify(canonical));
    const expectedSignature = signCanonical(canonical, secret);
    if (receipt.runtime.canonicalHash !== expectedHash) {
      issues.push("receipt canonical hash mismatch");
    }
    if (receipt.runtime.signature !== expectedSignature) {
      issues.push("receipt signature mismatch");
    }
    if (receipt.runtime.keyId !== keyIdForSecret(secret)) {
      issues.push("receipt keyId mismatch");
    }
  }

  const snapshotCheck = validateWorkflowReceiptEvidenceSnapshot(rootDir, receipt);
  if (!snapshotCheck.pass) {
    issues.push(...snapshotCheck.issues);
  } else if (snapshotCheck.legacy) {
    issues.push(...liveOutputTrustIssues(rootDir, receipt));
  } else {
    diagnostics.push(...workflowReceiptLiveOutputDiagnostics(rootDir, receipt));
  }

  const ledgerCheck = validateReceiptLedgerEntry(rootDir, receipt, options);
  issues.push(...ledgerCheck.issues);

  const linkCheck = validateArtifactLinks(rootDir, receipt);
  issues.push(...linkCheck.issues);

  if (options.requireHostInvocationProof === true && isHostAgentSubject(receipt.subjectType)) {
    try {
      const proof = enrichHostInvocationProof(rootDir, receipt.hostInvocation);
      assertHostInvocationProofExists(rootDir, proof, receipt.agentId || receipt.subjectId);
    } catch (err) {
      issues.push(err.message);
    }
  }

  return { pass: issues.length === 0, issues, diagnostics };
}

export function validateWorkflowReceiptLedgerChain(rootDir = process.cwd(), options = {}) {
  const secret = options.secret ?? readReceiptSecretSync(rootDir);
  const entries = readReceiptLedgerSync(rootDir);
  const issues = [];
  let previousEntryHash = null;
  for (const [index, entry] of entries.entries()) {
    if (entry.__invalidJson) {
      issues.push(`ledger entry ${index} is not valid JSON`);
      continue;
    }
    if (entry.previousEntryHash !== previousEntryHash) {
      issues.push(`ledger entry ${index} previousEntryHash mismatch`);
    }
    const expectedEntryHash = ledgerEntryHash({ ...entry, entryHash: undefined });
    if (entry.entryHash !== expectedEntryHash) {
      issues.push(`ledger entry ${index} entryHash mismatch`);
    }
    if (secret && entry.signature) {
      const receipt = readJsonSync(join(rootDir, ...String(entry.receiptPath || "").split("/")));
      if (!receipt || receipt.runtime?.signature !== entry.signature) {
        issues.push(`ledger entry ${index} receipt signature mismatch`);
      }
    }
    previousEntryHash = entry.entryHash;
  }
  return { pass: issues.length === 0, entries: entries.length, issues };
}

export function readWorkflowReceipts(rootDir = process.cwd()) {
  return readAllWorkflowReceipts(rootDir);
}

export function normalizeWorkflowReceiptScope(options = {}) {
  const hostInvocation = options.hostInvocation || buildScopedHostInvocation(options);
  const handoffId = normalizeOptional(options.handoffId || options.handoff || options.slug);
  return {
    command: normalizeCommand(options.command || options.workflowCommand || options.cmd),
    handoffId,
    workflowRunId: handoffId ? "" : normalizeOptional(options.workflowRunId || options.workflow_run_id || options.runId),
    stages: uniqueStrings([options.stage, ...(arrayFrom(options.stages || options.stageIds))]),
    subjectIds: uniqueStrings([
      options.subjectId,
      options.agentId,
      options.skillId,
      options.workerId,
      options.reviewerId,
      ...(arrayFrom(options.subjectIds || options.requiredSubjectIds || options.requiredAgentIds)),
    ]),
    artifactPaths: uniqueStrings([
      options.artifact,
      options.artifactPath,
      options.outputArtifact,
      ...(arrayFrom(options.artifacts || options.artifactPaths || options.outputArtifacts || options.outputs)),
    ]).map(normalizeRelPath),
    artifactHashes: uniqueStrings([
      options.artifactHash,
      options.outputHash,
      ...(arrayFrom(options.artifactHashes || options.outputHashes)),
    ]).map((item) => item.toLowerCase()),
    hostInvocation,
  };
}

export function workflowReceiptMatchesScope(receipt = {}, options = {}) {
  const scope = normalizeWorkflowReceiptScope(options);
  if (receipt.__invalidJson) return invalidReceiptPathMatchesWorkflowScope(receipt, scope);
  if (scope.command && normalizeCommand(receipt.command) !== scope.command) return false;
  if (scope.handoffId && receipt.handoffId !== scope.handoffId) return false;
  if (scope.workflowRunId && receipt.workflowRunId !== scope.workflowRunId && receipt.workflow_run_id !== scope.workflowRunId) return false;
  if (scope.stages?.length && !scope.stages.includes(String(receipt.stage || ""))) return false;
  if (scope.subjectIds?.length) {
    const ids = [receipt.subjectId, receipt.agentId, receipt.skillId].filter(Boolean).map(String);
    if (!ids.some((id) => scope.subjectIds.includes(id))) return false;
  }
  if (scope.artifactPaths?.length) {
    const paths = [
      ...(Array.isArray(receipt.outputArtifacts) ? receipt.outputArtifacts : []),
      ...(Array.isArray(receipt.outputHashes) ? receipt.outputHashes.map((item) => item.path) : []),
    ].map(normalizeRelPath);
    if (!paths.some((path) => scope.artifactPaths.some((artifact) => sameWorkflowArtifact(path, artifact)))) return false;
  }
  if (scope.artifactHashes?.length) {
    const hashes = (Array.isArray(receipt.outputHashes) ? receipt.outputHashes : [])
      .map((item) => String(item.sha256 || "").toLowerCase())
      .filter(Boolean);
    if (!hashes.some((hash) => scope.artifactHashes.includes(hash))) return false;
  }
  if (scope.hostInvocation && !hostInvocationMatchesScope(receipt.hostInvocation, scope.hostInvocation)) return false;
  return true;
}

export function validateScopedWorkflowReceipts(rootDir = process.cwd(), options = {}) {
  const scope = normalizeWorkflowReceiptScope(options);
  const indexMatches = findWorkflowReceiptIndexMatches(rootDir, scope);
  const allReceipts = indexMatches.available
    ? readWorkflowReceiptsByPaths(rootDir, indexMatches.receiptPaths)
    : readAllWorkflowReceipts(rootDir);
  const receipts = allReceipts.filter((receipt) => workflowReceiptMatchesScope(receipt, scope));
  const issues = [];
  const diagnostics = [];
  for (const receipt of receipts) {
    const trust = validateWorkflowReceiptTrust(rootDir, receipt, { ...options, skipLedgerChain: true });
    for (const message of trust.diagnostics || []) {
      diagnostics.push({
        code: "workflow-receipt-live-output-diagnostic",
        file: receipt.__file,
        message: receipt.__file + ": " + message,
      });
    }
    for (const message of trust.issues) {
      issues.push({
        code: /artifact link manifest missing|artifact link missing/i.test(message)
          ? "missing-scoped-workflow-artifact-receipt-link"
          : "untrusted-scoped-workflow-receipt",
        file: receipt.__file,
        message: `${receipt.__file}: ${message}`,
      });
    }
  }
  if (receipts.length === 0 && options.requireReceipts !== false) {
    issues.push({
      code: "missing-scoped-workflow-receipt",
      file: scopedWorkflowReceiptFileHint(scope),
      message: "no trusted receipt candidate matched the requested command/handoff/stage/artifact/subject/host scope",
    });
  }
  return {
    pass: issues.length === 0,
    checked: receipts.length,
    receipts: receipts.length,
    totalReceipts: indexMatches.available ? indexMatches.totalReceipts : allReceipts.length,
    ledgerEntries: null,
    scopeMode: "scoped",
    indexMode: indexMatches.available ? "indexed" : "full-scan-fallback",
    scope,
    batchingOptimization: "scoped-trust-fast-path",
    nextRepairCommand: repairCommandForReceiptIssues(issues),
    issues,
    diagnostics,
  };
}

export const WORK_ITEM_RECEIPT_LOOKUP_STATUSES = Object.freeze([
  "trusted",
  "missing",
  "untrusted",
  "stale",
  "superseded",
  "migrated",
  "legacy",
]);

export function lookupWorkItemReceipt(rootDir = process.cwd(), options = {}) {
  const scope = normalizeWorkItemReceiptLookupScope(options);
  if (!scope.taskId && !scope.graphId && scope.artifactPaths.length === 0 && !scope.receiptId) {
    throw new Error("lookup requires --task-id, --graph-id, --artifact, or --receipt");
  }
  const receipts = readAllWorkflowReceipts(rootDir).filter((receipt) => !receipt.__invalidJson);
  const ledgerEntries = readReceiptLedgerSync(rootDir).filter((entry) => !entry.__invalidJson);
  const supersededBy = supersededReceiptMap(receipts);
  const candidates = receipts
    .map((receipt) => classifyWorkItemReceiptCandidate(rootDir, receipt, {
      scope,
      ledgerEntries,
      supersededBy,
      secret: options.secret ?? null,
    }))
    .filter(Boolean)
    .sort(compareWorkItemReceiptCandidates);
  const selected = candidates.find((candidate) => candidate.status === "trusted")
    || candidates.find((candidate) => candidate.status === "migrated")
    || candidates.find((candidate) => candidate.status === "legacy")
    || candidates[0]
    || null;
  const status = selected?.status || "missing";
  return {
    schemaVersion: "WorkItemReceiptLookupV1",
    status,
    pass: ["trusted", "migrated"].includes(status),
    scope,
    selected,
    candidates,
    checked: receipts.length,
    matched: candidates.length,
    proofProjection: selected
      ? proofProjectionForWorkItemReceiptLookup(selected, scope)
      : missingProofProjectionForWorkItemReceiptLookup(scope),
  };
}

export function diagnoseWorkItemReceiptDrift(rootDir = process.cwd(), options = {}) {
  const lookup = lookupWorkItemReceipt(rootDir, options);
  const candidates = lookup.candidates || [];
  const diagnostics = candidates.flatMap((candidate) => workItemReceiptDriftDiagnostics(candidate));
  const selectedDiagnostics = lookup.selected
    ? diagnostics.filter((item) => item.receiptId === lookup.selected.receiptId)
    : [];
  const stale = candidates.filter((item) => item.status === "stale").length;
  const untrusted = candidates.filter((item) => item.status === "untrusted").length;
  const superseded = candidates.filter((item) => item.status === "superseded").length;
  const migrated = candidates.filter((item) => item.status === "migrated").length;
  return {
    schemaVersion: "WorkItemReceiptDriftDiagnosticV1",
    pass: lookup.pass && selectedDiagnostics.every((item) => item.severity !== "error"),
    status: lookup.status,
    scope: lookup.scope,
    checked: lookup.checked,
    matched: lookup.matched,
    selected: lookup.selected ? workItemReceiptDiagnosticSummary(lookup.selected) : null,
    totals: {
      diagnostics: diagnostics.length,
      stale,
      untrusted,
      superseded,
      migrated,
      missingArtifactLink: diagnostics.filter((item) => item.code === "missing-artifact-link").length,
      hashMismatch: diagnostics.filter((item) => item.code === "hash-mismatch").length,
    },
    diagnostics,
    selectedDiagnostics,
    nextRepairCommand: nextWorkItemReceiptDriftRepairCommand({ lookup, diagnostics, selectedDiagnostics }),
    proofProjection: lookup.proofProjection,
  };
}

export function validateWorkflowReceipts(rootDir = process.cwd(), options = {}) {
  const receipts = readAllWorkflowReceipts(rootDir);
  const issues = [];
  const diagnostics = [];
  const ledger = validateWorkflowReceiptLedgerChain(rootDir, options);
  for (const receipt of receipts) {
    const trust = validateWorkflowReceiptTrust(rootDir, receipt, { ...options, skipLedgerChain: true });
    for (const message of trust.diagnostics || []) {
      diagnostics.push({
        code: "workflow-receipt-live-output-diagnostic",
        file: receipt.__file,
        message: receipt.__file + ": " + message,
      });
    }
    for (const message of trust.issues) {
      issues.push({
        code: /artifact link manifest missing|artifact link missing/i.test(message)
          ? "missing-workflow-artifact-receipt-link"
          : "untrusted-workflow-receipt",
        file: receipt.__file,
        message: `${receipt.__file}: ${message}`,
      });
    }
  }
  for (const message of ledger.issues) {
    issues.push({
      code: "invalid-workflow-receipt-ledger",
      file: LEDGER_RELATIVE_PATH,
      message,
    });
  }
  return {
    pass: issues.length === 0,
    checked: receipts.length,
    receipts: receipts.length,
    ledgerEntries: ledger.entries,
    nextRepairCommand: repairCommandForReceiptIssues(issues),
    issues,
    diagnostics,
  };
}


export function classifyWorkflowReceiptRepairCommand(command = "") {
  const normalized = String(command || "").trim().replace(/\s+/g, " ");
  const comparable = normalized.replace(/\\/g, "/");
  const match = comparable.match(/(?:^|\s)(?:node(?:\.exe)?\s+)?(?:\.\/)?scripts\/workflow-receipt\.mjs\s+([a-z-]+)/i);
  const operation = match?.[1] || "";
  const allowed = WORKFLOW_RECEIPT_REPAIR_OPERATION_SET.has(operation);
  return {
    command: normalized,
    operation: operation || null,
    allowed,
    mutates: operation === "reissue" || operation === "prune-stale" || operation === "rebuild-ledger",
    reason: allowed
      ? null
      : "receipt repair must use workflow-receipt.mjs inspect, reissue, prune-stale, rebuild-ledger, or recovery-status",
  };
}

export function assertWorkflowReceiptRepairCommandAllowed(command = "") {
  const classification = classifyWorkflowReceiptRepairCommand(command);
  if (!classification.allowed) {
    throw new Error(classification.reason + ": " + (classification.command || "(missing command)"));
  }
  return classification;
}

export function classifyGeneratedStatePath(path, rootDir = process.cwd()) {
  const relPath = normalizeInputPath(path, rootDir);
  const generatedState = GENERATED_STATE_PATTERNS.some((pattern) => pattern.test(relPath));
  const receiptRepairSurface = /(?:^|\/)workflow-invocation-ledger\.jsonl$|(?:^|\/)workflow-receipt-runtime\.key$|\/_workflow-invocations\//i.test(relPath);
  return {
    path: relPath,
    generatedState,
    receiptRepairSurface,
    reason: generatedState ? null : "path is not a known generated Supervibe memory state artifact",
  };
}

export async function createGeneratedStateRecoveryPolicy({
  rootDir = process.cwd(),
  paths = [],
  operation = "generated-state-repair",
  repairCommand = "",
  postCheckCommands = [],
  runTimestamp = null,
  apply = false,
  lockPath = GENERATED_STATE_RECOVERY_LOCK_RELATIVE_PATH,
} = {}) {
  const timestamp = runTimestamp || new Date().toISOString();
  const normalizedPaths = uniqueStrings(paths).map((item) => normalizeInputPath(item, rootDir));
  if (normalizedPaths.length === 0) throw new Error("generated-state recovery paths required");
  const recoveryRoot = normalizeRelPath(".supervibe/artifacts/_workflow-recovery/generated-state/" + sanitizeId(operation) + "/" + sanitizeId(timestamp));
  const lockRel = normalizeInputPath(lockPath, rootDir);
  const receiptRepairSurface = normalizedPaths.some((item) => classifyGeneratedStatePath(item, rootDir).receiptRepairSurface);
  const materialize = async () => {
    const entries = [];
    for (const relPath of normalizedPaths) {
      const classification = classifyGeneratedStatePath(relPath, rootDir);
      const before = hashGeneratedStatePath(rootDir, relPath);
      const snapshotPath = normalizeRelPath(recoveryRoot + "/snapshots/" + snapshotNameForGeneratedState(relPath));
      if (apply && before.exists) {
        const snapshotAbs = join(rootDir, ...snapshotPath.split("/"));
        await mkdir(dirname(snapshotAbs), { recursive: true });
        await writeFile(snapshotAbs, await readFile(join(rootDir, ...relPath.split("/"))));
      }
      entries.push({
        path: relPath,
        generatedState: classification.generatedState,
        receiptRepairSurface: classification.receiptRepairSurface,
        before,
        snapshot: {
          path: snapshotPath,
          exists: before.exists,
          sha256: before.sha256,
          bytes: before.bytes,
        },
        restore: {
          command: generatedStateRestoreCommand({ snapshotPath, targetPath: relPath }),
          targetPath: relPath,
          sourceSnapshotPath: snapshotPath,
        },
      });
    }
    const policy = {
      schemaVersion: 1,
      type: GENERATED_STATE_RECOVERY_TYPE,
      operation: String(operation || "generated-state-repair"),
      generatedAt: timestamp,
      apply: Boolean(apply),
      recoveryRoot,
      lock: {
        path: lockRel,
        required: true,
        mode: "exclusive-file",
        acquiredDuringApply: Boolean(apply),
      },
      repair: {
        command: String(repairCommand || "").trim(),
        receiptRepairSurface,
        receiptRepairCommand: receiptRepairSurface ? classifyWorkflowReceiptRepairCommand(repairCommand) : null,
      },
      entries,
      postCheck: {
        required: true,
        commands: uniqueStrings(postCheckCommands),
      },
      recoveryStatusCommand: "node scripts/workflow-receipt.mjs recovery-status",
    };
    const validation = validateGeneratedStateRecoveryPolicy(rootDir, policy);
    policy.validation = {
      pass: validation.pass,
      issues: validation.issues,
    };
    if (apply) {
      const manifestPath = normalizeRelPath(recoveryRoot + "/generated-state-recovery.json");
      const manifestAbs = join(rootDir, ...manifestPath.split("/"));
      const manifestBytes = JSON.stringify(policy, null, 2) + "\n";
      await mkdir(dirname(manifestAbs), { recursive: true });
      await writeFile(manifestAbs, manifestBytes, "utf8");
      return {
        ...policy,
        manifest: {
          path: manifestPath,
          sha256: sha256(manifestBytes),
          bytes: Buffer.byteLength(manifestBytes),
        },
      };
    }
    return policy;
  };
  if (!apply) return materialize();
  return withGeneratedStateRecoveryLock(rootDir, lockRel, materialize);
}

export function validateGeneratedStateRecoveryPolicy(rootDir = process.cwd(), policy = {}, options = {}) {
  const issues = [];
  if (policy.type !== GENERATED_STATE_RECOVERY_TYPE) issues.push(policyIssue("generated-state-recovery-type", "generated-state recovery policy type missing or invalid"));
  if (!policy.lock?.required || !policy.lock?.path) issues.push(policyIssue("generated-state-recovery-lock-missing", "generated-state recovery requires an exclusive lock path"));
  const entries = Array.isArray(policy.entries) ? policy.entries : [];
  if (entries.length === 0) issues.push(policyIssue("generated-state-recovery-entries-missing", "generated-state recovery requires at least one state entry"));
  for (const [index, entry] of entries.entries()) {
    const label = entry?.path || "entry[" + index + "]";
    const classification = classifyGeneratedStatePath(label, rootDir);
    if (!classification.generatedState && options.allowUnknownGeneratedStatePaths !== true) {
      issues.push(policyIssue("generated-state-path-unsupported", label + ": " + classification.reason));
    }
    if (entry?.before?.exists !== false && !entry?.before?.sha256) {
      issues.push(policyIssue("generated-state-before-hash-missing", label + ": before sha256 is required"));
    }
    if (!entry?.snapshot?.path || (entry.snapshot.exists !== false && !entry.snapshot.sha256)) {
      issues.push(policyIssue("generated-state-snapshot-missing", label + ": snapshot path and hash are required"));
    }
    if (!entry?.restore?.command || !entry.restore?.sourceSnapshotPath || !entry.restore?.targetPath) {
      issues.push(policyIssue("generated-state-restore-missing", label + ": restore command, source snapshot, and target path are required"));
    }
  }
  const postChecks = Array.isArray(policy.postCheck?.commands) ? policy.postCheck.commands.filter(Boolean) : [];
  if (policy.postCheck?.required !== true || postChecks.length === 0) {
    issues.push(policyIssue("generated-state-post-check-missing", "generated-state recovery requires at least one post-check command"));
  }
  const receiptRepairSurface = policy.repair?.receiptRepairSurface === true
    || entries.some((entry) => classifyGeneratedStatePath(entry?.path || "", rootDir).receiptRepairSurface);
  if (receiptRepairSurface) {
    const repair = classifyWorkflowReceiptRepairCommand(policy.repair?.command || "");
    if (!repair.allowed) issues.push(policyIssue("receipt-repair-command-unsupported", repair.reason));
  }
  return {
    pass: issues.length === 0,
    issues,
  };
}


export async function backfillWorkflowReceiptEvidenceSnapshots({
  rootDir = process.cwd(),
  apply = false,
  runTimestamp = null,
  secret = null,
  limit = 0,
} = {}) {
  const timestamp = runTimestamp || new Date().toISOString();
  const resolvedSecret = secret ?? readReceiptSecretSync(rootDir);
  const receipts = readAllWorkflowReceipts(rootDir).filter((receipt) => !receipt.__invalidJson);
  const missingSnapshot = receipts.filter((receipt) => !receipt.evidenceSnapshot);
  const candidates = [];
  const skipped = [];
  if (!resolvedSecret) {
    for (const receipt of missingSnapshot) {
      skipped.push({ receiptPath: receipt.__file, reason: "receipt runtime secret missing" });
    }
  } else {
    for (const receipt of missingSnapshot) {
      const trust = validateWorkflowReceiptTrust(rootDir, receipt, { secret: resolvedSecret, skipLedgerChain: true });
      if (!trust.pass) {
        skipped.push({ receiptPath: receipt.__file, reason: trust.issues.join("; ") || "receipt not trusted" });
        continue;
      }
      candidates.push(receipt);
    }
  }
  const max = Number(limit || 0);
  const selected = max > 0 ? candidates.slice(0, max) : candidates;
  const recoveryRoot = normalizeRelPath(".supervibe/artifacts/_workflow-recovery/receipt-snapshot-backfill/" + sanitizeId(timestamp));
  const migrated = [];
  let ledger = null;
  let reportPath = null;

  if (apply && selected.length > 0) {
    for (const receipt of selected) {
      const receiptRel = normalizeRelPath(receipt.__file);
      const receiptAbs = join(rootDir, ...receiptRel.split("/"));
      const backupRel = normalizeRelPath(recoveryRoot + "/receipts/" + receiptRel);
      const backupAbs = join(rootDir, ...backupRel.split("/"));
      await mkdir(dirname(backupAbs), { recursive: true });
      await writeFile(backupAbs, JSON.stringify(stripRuntimeFields(receipt), null, 2) + "\n", "utf8");
      const snapshot = await createWorkflowReceiptEvidenceSnapshot({
        rootDir,
        receiptId: receipt.receiptId,
        command: receipt.command,
        subjectType: receipt.subjectType,
        subjectId: receipt.subjectId,
        stage: receipt.stage,
        handoffId: receipt.handoffId,
        createdAt: timestamp,
        inputHashes: receipt.inputHashes || [],
        outputHashes: receipt.outputHashes || [],
        workItemBinding: receipt.workItemBinding || null,
      });
      const nextReceipt = {
        ...stripRuntimeFields(receipt),
        evidenceSnapshot: snapshot,
      };
      const canonical = canonicalReceiptForVerification(nextReceipt);
      const canonicalHash = sha256(stableStringify(canonical));
      nextReceipt.runtime = {
        ...(nextReceipt.runtime || {}),
        canonicalHash,
        signature: signCanonical(canonical, resolvedSecret),
        keyId: keyIdForSecret(resolvedSecret),
      };
      await writeFile(receiptAbs, JSON.stringify(nextReceipt, null, 2) + "\n", "utf8");
      migrated.push({
        receiptId: receipt.receiptId,
        receiptPath: receiptRel,
        backupPath: backupRel,
        snapshotPath: snapshot.path,
        beforeCanonicalHash: receipt.runtime?.canonicalHash || null,
        afterCanonicalHash: canonicalHash,
      });
    }
    ledger = await rebuildWorkflowReceiptLedger({ rootDir, secret: resolvedSecret, pruneStale: false });
  }

  if (apply) {
    reportPath = normalizeRelPath(recoveryRoot + "/report.json");
    const reportAbs = join(rootDir, ...reportPath.split("/"));
    await mkdir(dirname(reportAbs), { recursive: true });
    await writeFile(reportAbs, JSON.stringify({
      schemaVersion: 1,
      operation: "receipt-snapshot-backfill",
      appliedAt: timestamp,
      checked: receipts.length,
      missingSnapshot: missingSnapshot.length,
      eligible: candidates.length,
      migrated: migrated.length,
      skipped,
      ledger,
    }, null, 2) + "\n", "utf8");
  }

  return {
    schemaVersion: 1,
    apply,
    checked: receipts.length,
    missingSnapshot: missingSnapshot.length,
    eligible: candidates.length,
    selected: selected.length,
    migrated: migrated.length,
    remainingMissingSnapshot: Math.max(0, missingSnapshot.length - migrated.length),
    skipped,
    migratedReceipts: migrated,
    recoveryRoot: apply ? recoveryRoot : null,
    reportPath,
    ledger,
  };
}

export async function reissueWorkflowInvocationReceipt({
  rootDir = process.cwd(),
  receiptPath,
  reason = null,
  runTimestamp = null,
  secret = null,
  rebuildLedger = true,
} = {}) {
  if (!receiptPath) throw new Error("receiptPath required");
  const normalizedReceiptPath = normalizeRelPath(receiptPath);
  const existing = readJsonSync(join(rootDir, ...normalizedReceiptPath.split("/")));
  if (!existing || existing.__invalidJson) throw new Error(`receipt not readable: ${normalizedReceiptPath}`);
  if (!Array.isArray(existing.outputArtifacts) || existing.outputArtifacts.length === 0) {
    throw new Error(`receipt has no outputArtifacts: ${normalizedReceiptPath}`);
  }
  const timestamp = runTimestamp || new Date().toISOString();
  const result = await issueWorkflowInvocationReceipt({
    rootDir,
    command: existing.command,
    subjectType: existing.subjectType,
    subjectId: existing.subjectId,
    agentId: existing.agentId || null,
    skillId: existing.skillId || null,
    stage: existing.stage,
    invocationReason: reason || existing.invocationReason || "workflow receipt reissued for current artifact hashes",
    inputEvidence: existing.inputEvidence || [],
    outputArtifacts: existing.outputArtifacts,
    allowMutableOutputArtifacts: true,
    startedAt: timestamp,
    completedAt: timestamp,
    runTimestamp: timestamp,
    handoffId: existing.handoffId,
    receiptDir: dirname(normalizedReceiptPath),
    receiptPrefix: receiptPrefixFromReceiptId(existing.receiptId),
    secret,
    hostInvocation: existing.hostInvocation || null,
    taskId: existing.workItemBinding?.taskId || null,
    graphId: existing.workItemBinding?.graphId || null,
    allowMissingHostInvocationProof: false,
    recovery: {
      operation: "reissue",
      originalReceiptId: existing.receiptId || null,
      originalReceiptPath: normalizedReceiptPath,
      reason: reason || "workflow receipt reissued for current artifact hashes",
    },
  });
  const ledger = rebuildLedger
    ? await rebuildWorkflowReceiptLedger({ rootDir, secret, pruneStale: false })
    : null;
  return { ...result, ledgerRepair: ledger };
}

export async function pruneStaleWorkflowReceipts({
  rootDir = process.cwd(),
  apply = false,
  runTimestamp = null,
  secret = null,
} = {}) {
  const timestamp = runTimestamp || new Date().toISOString();
  const receipts = readAllWorkflowReceipts(rootDir).filter((receipt) => !receipt.__invalidJson);
  const stale = receipts
    .map((receipt) => ({ receipt, driftIssues: receiptArtifactDriftIssues(rootDir, receipt) }))
    .filter((item) => item.driftIssues.length > 0);
  const archived = [];
  if (apply) {
    const archiveRoot = join(rootDir, ".supervibe", ".archive", "workflow-receipts-stale", sanitizeId(timestamp));
    for (const item of stale) {
      const source = join(rootDir, ...item.receipt.__file.split("/"));
      const target = join(archiveRoot, ...item.receipt.__file.split("/"));
      await mkdir(dirname(target), { recursive: true });
      await rename(source, target);
      archived.push(normalizeRelPath(relative(rootDir, target)));
    }
  }
  const ledger = await rebuildWorkflowReceiptLedger({ rootDir, secret, pruneStale: true });
  return {
    pass: stale.length === 0 || apply,
    checked: receipts.length,
    stale: stale.length,
    archived,
    driftIssues: stale.flatMap((item) => item.driftIssues.map((message) => `${item.receipt.__file}: ${message}`)),
    ledger,
  };
}

export async function rebuildWorkflowReceiptLedger({
  rootDir = process.cwd(),
  secret = null,
  pruneStale = false,
} = {}) {
  const receipts = readAllWorkflowReceipts(rootDir)
    .filter((receipt) => !receipt.__invalidJson)
    .map((receipt) => ({
      receipt,
      driftIssues: receiptArtifactDriftIssues(rootDir, receipt),
      signatureIssues: receiptSignatureIssues(rootDir, receipt, { secret }),
    }));
  const retained = receipts
    .filter((item) => item.signatureIssues.length === 0)
    .filter((item) => !pruneStale || item.driftIssues.length === 0)
    .sort((left, right) => {
      const leftTime = left.receipt.runtime?.issuedAt || left.receipt.completedAt || left.receipt.startedAt || "";
      const rightTime = right.receipt.runtime?.issuedAt || right.receipt.completedAt || right.receipt.startedAt || "";
      return leftTime.localeCompare(rightTime)
        || String(left.receipt.__file || "").localeCompare(String(right.receipt.__file || ""))
        || String(left.receipt.receiptId || "").localeCompare(String(right.receipt.receiptId || ""));
    });
  const ledgerPath = defaultWorkflowReceiptLedgerPath(rootDir);
  await withWorkflowReceiptLedgerLock(rootDir, async () => {
    let previousEntryHash = null;
    const lines = [];
    for (const item of retained) {
      const receipt = item.receipt;
      const artifactLinksPath = normalizeRelPath(`${dirname(receipt.__file)}/${ARTIFACT_LINKS_FILE}`);
      const withChain = {
        schemaVersion: 1,
        receiptId: receipt.receiptId,
        command: receipt.command,
        subjectType: receipt.subjectType,
        subjectId: receipt.subjectId,
        ...(receipt.workItemBinding ? { workItemBinding: receipt.workItemBinding } : {}),
        receiptPath: receipt.__file,
        artifactLinksPath,
        canonicalHash: receipt.runtime?.canonicalHash,
        signature: receipt.runtime?.signature,
        issuedAt: receipt.runtime?.issuedAt || receipt.completedAt || receipt.startedAt,
        previousEntryHash,
      };
      const entry = {
        ...withChain,
        entryHash: ledgerEntryHash(withChain),
      };
      previousEntryHash = entry.entryHash;
      lines.push(JSON.stringify(entry));
    }
    await mkdir(dirname(ledgerPath), { recursive: true });
    await writeFile(ledgerPath, `${lines.join("\n")}${lines.length ? "\n" : ""}`, "utf8");
    await rebuildWorkflowReceiptIndex(rootDir, retained.map((item) => ({ ...item.receipt, __file: item.receipt.__file })));
  });
  return {
    pass: receipts.every((item) => item.signatureIssues.length === 0) && (!pruneStale || receipts.every((item) => item.driftIssues.length === 0 || !retained.includes(item))),
    checked: receipts.length,
    retained: retained.length,
    pruned: receipts.length - retained.length,
    stale: receipts.filter((item) => item.driftIssues.length > 0).length,
    signatureIssues: receipts.flatMap((item) => item.signatureIssues.map((message) => `${item.receipt.__file}: ${message}`)),
    driftIssues: receipts.flatMap((item) => item.driftIssues.map((message) => `${item.receipt.__file}: ${message}`)),
  };
}

function validateReceiptLedgerEntry(rootDir, receipt, options = {}) {
  const entries = readReceiptLedgerSync(rootDir);
  const chain = options.skipLedgerChain ? { issues: [] } : validateWorkflowReceiptLedgerChain(rootDir, options);
  const issues = [...chain.issues];
  const match = entries.find((entry) => entry.receiptId === receipt.receiptId);
  if (!match) {
    issues.push(`ledger entry missing for receipt ${receipt.receiptId}`);
  } else {
    if (match.canonicalHash !== receipt.runtime?.canonicalHash) {
      issues.push(`ledger canonical hash mismatch for receipt ${receipt.receiptId}`);
    }
    if (match.signature !== receipt.runtime?.signature) {
      issues.push(`ledger signature mismatch for receipt ${receipt.receiptId}`);
    }
  }
  return { pass: issues.length === 0, issues };
}

function receiptArtifactDriftIssues(rootDir, receipt = {}) {
  const snapshotCheck = validateWorkflowReceiptEvidenceSnapshot(rootDir, receipt);
  if (!snapshotCheck.legacy) {
    return snapshotCheck.pass ? [] : snapshotCheck.issues;
  }
  return liveOutputTrustIssues(rootDir, receipt);
}

function liveOutputTrustIssues(rootDir, receipt = {}) {
  const issues = [];
  for (const output of receipt.outputHashes || []) {
    const current = hashEvidencePath(rootDir, output.path, { required: false });
    if (!current.exists) {
      issues.push(`output artifact missing: ${output.path}`);
      continue;
    }
    if (current.sha256 !== output.sha256) {
      issues.push(`output artifact hash mismatch: ${output.path}`);
    }
  }
  return issues;
}

export function classifyWorkflowReceiptOutputArtifact(path, rootDir = process.cwd()) {
  const relPath = normalizeInputPath(path, rootDir);
  const mutable = MUTABLE_OUTPUT_PATTERNS.some((pattern) => pattern.test(relPath));
  return {
    path: relPath,
    receiptable: !mutable,
    reason: mutable ? "mutable-log-like-output-artifact" : null,
    recommendation: mutable
      ? "Use a stable per-agent or per-stage output artifact such as .supervibe/artifacts/_agent-outputs/<invocation-id>/agent-output.json, summary.md, or a timestamped state snapshot under .supervibe/artifacts/_workflow-transactions/."
      : null,
  };
}

function assertReceiptableOutputArtifacts(outputArtifacts = [], rootDir = process.cwd()) {
  const blocked = (outputArtifacts || [])
    .map((path) => classifyWorkflowReceiptOutputArtifact(path, rootDir))
    .filter((item) => item.receiptable !== true);
  if (blocked.length === 0) return true;
  const paths = blocked.map((item) => item.path).join(", ");
  const recommendation = blocked[0].recommendation;
  throw new Error(`output artifact is mutable/log-like and cannot be receipt output: ${paths}. ${recommendation}`);
}

function normalizeWorkItemBinding({ taskId = null, workItemId = null, graphId = null, workGraphId = null } = {}) {
  const normalizedTaskId = normalizeOptional(taskId || workItemId) || null;
  const normalizedGraphId = normalizeOptional(graphId || workGraphId) || inferGraphIdFromTaskId(normalizedTaskId) || null;
  if (!normalizedTaskId && !normalizedGraphId) return null;
  return compactOptionalObject({
    graphId: normalizedGraphId,
    taskId: normalizedTaskId,
  });
}

function inferGraphIdFromTaskId(taskId = "") {
  const normalizedTaskId = normalizeOptional(taskId);
  if (!normalizedTaskId) return null;
  const match = /^(.*?)-(?:a\d{3,}|t\d+[a-z]?(?:-sub\d+)?)$/i.exec(normalizedTaskId);
  const graphId = match?.[1] || null;
  if (!graphId || graphId === normalizedTaskId) return null;
  return graphId;
}

function normalizeWorkItemReceiptLookupScope(options = {}) {
  const taskId = normalizeOptional(options.taskId || options["task-id"] || options.workItemId || options["work-item-id"]) || null;
  const graphId = normalizeOptional(options.graphId || options["graph-id"] || options.workGraphId || options["work-graph-id"] || inferGraphIdFromTaskId(taskId)) || null;
  return {
    receiptId: normalizeOptional(options.receiptId || options.receipt || options["receipt-id"]) || null,
    command: normalizeCommand(options.command || options.workflowCommand || options.cmd),
    handoffId: normalizeOptional(options.handoffId || options.handoff || options.slug) || null,
    stage: normalizeOptional(options.stage) || null,
    subjectId: normalizeOptional(options.subjectId || options["subject-id"] || options.agentId || options.agent || options.worker || options.reviewer || options.skill) || null,
    graphId,
    taskId,
    artifactPaths: uniqueStrings([
      options.artifact,
      options.artifactPath,
      options.outputArtifact,
      ...(arrayFrom(options.artifacts || options.artifactPaths || options.outputArtifacts || options.output || options.outputs)),
    ]).map(normalizeRelPath),
  };
}

function classifyWorkItemReceiptCandidate(rootDir, receipt, { scope, ledgerEntries, supersededBy, secret }) {
  if (scope.receiptId && receipt.receiptId !== scope.receiptId) return null;
  if (scope.command && normalizeCommand(receipt.command) !== scope.command) return null;
  if (scope.handoffId && receipt.handoffId !== scope.handoffId) return null;
  if (scope.stage && String(receipt.stage || "") !== scope.stage) return null;
  if (scope.subjectId) {
    const ids = [receipt.subjectId, receipt.agentId, receipt.skillId].filter(Boolean).map(String);
    if (!ids.includes(scope.subjectId)) return null;
  }

  const artifactLinks = readReceiptArtifactLinks(rootDir, receipt)
    .filter((link) => !link.receiptId || link.receiptId === receipt.receiptId);
  const evidence = workItemReceiptMatchEvidence(receipt, artifactLinks, scope);
  if (!evidence.matches) return null;

  const trust = validateWorkflowReceiptTrust(rootDir, receipt, { secret, skipLedgerChain: true });
  const driftIssues = receiptArtifactDriftIssues(rootDir, receipt);
  const ledgerEntry = ledgerEntries.find((entry) => entry.receiptId === receipt.receiptId) || null;
  const superseded = supersededBy.get(receipt.receiptId) || null;
  const legacy = evidence.modes.includes("legacy-artifact") || evidence.modes.includes("legacy-path-token");
  const migrated = Boolean(receipt.recovery?.operation || receipt.supersedes?.receiptId || receipt.evidenceSnapshot?.migration);
  const status = superseded
    ? "superseded"
    : driftIssues.length > 0
      ? "stale"
      : trust.pass
        ? legacy
          ? "legacy"
          : migrated
            ? "migrated"
            : "trusted"
        : "untrusted";

  return {
    status,
    receiptId: receipt.receiptId || null,
    receiptPath: receipt.__file || null,
    command: receipt.command || null,
    handoffId: receipt.handoffId || null,
    stage: receipt.stage || null,
    subjectType: receipt.subjectType || null,
    subjectId: receipt.subjectId || null,
    agentId: receipt.agentId || null,
    workItemBinding: receipt.workItemBinding || null,
    matchedBy: evidence.modes,
    matchedArtifacts: evidence.artifacts,
    artifactLinks: artifactLinks.map((link) => compactOptionalObject({
      artifactPath: normalizeRelPath(link.artifactPath),
      receiptId: link.receiptId || null,
      receiptPath: normalizeRelPath(link.receiptPath || ""),
      sha256: link.sha256 || null,
      workItemBinding: link.workItemBinding || null,
    })),
    ledger: ledgerEntry ? {
      entryHash: ledgerEntry.entryHash || null,
      canonicalHash: ledgerEntry.canonicalHash || null,
      artifactLinksPath: normalizeRelPath(ledgerEntry.artifactLinksPath || ""),
      issuedAt: ledgerEntry.issuedAt || null,
    } : null,
    runtime: {
      issuer: receipt.runtime?.issuer || null,
      issuedAt: receipt.runtime?.issuedAt || null,
      keyId: receipt.runtime?.keyId || null,
      canonicalHash: receipt.runtime?.canonicalHash || null,
    },
    hostInvocation: receipt.hostInvocation || null,
    outputArtifacts: normalizePathList(receipt.outputArtifacts || [], rootDir),
    outputHashes: Array.isArray(receipt.outputHashes) ? receipt.outputHashes : [],
    trust: {
      pass: trust.pass,
      issues: trust.issues,
      diagnostics: trust.diagnostics || [],
    },
    driftIssues,
    supersededBy: superseded,
    migration: compactOptionalObject({
      state: migrated ? "migrated" : legacy ? "legacy" : null,
      operation: receipt.recovery?.operation || null,
      originalReceiptId: receipt.supersedes?.receiptId || receipt.recovery?.originalReceiptId || null,
      originalReceiptPath: receipt.supersedes?.receiptPath || receipt.recovery?.originalReceiptPath || null,
    }),
  };
}

function workItemReceiptMatchEvidence(receipt = {}, artifactLinks = [], scope = {}) {
  const modes = [];
  const artifacts = new Set();
  if (scope.receiptId && receipt.receiptId === scope.receiptId) modes.push("receipt-id");
  const binding = receipt.workItemBinding || null;
  if (workItemBindingMatchesScope(binding, scope)) modes.push("receipt-work-item-binding");
  for (const link of artifactLinks) {
    if (workItemBindingMatchesScope(link.workItemBinding, scope)) {
      modes.push("artifact-link-work-item-binding");
      if (link.artifactPath) artifacts.add(normalizeRelPath(link.artifactPath));
    }
  }

  const receiptArtifacts = receiptArtifactPaths(receipt);
  if (scope.artifactPaths.length > 0) {
    for (const artifact of receiptArtifacts) {
      if (!scope.artifactPaths.some((expected) => sameWorkflowArtifact(artifact, expected))) continue;
      modes.push(binding ? "artifact" : "legacy-artifact");
      artifacts.add(artifact);
    }
    for (const link of artifactLinks) {
      const artifact = normalizeRelPath(link.artifactPath);
      if (!scope.artifactPaths.some((expected) => sameWorkflowArtifact(artifact, expected))) continue;
      modes.push(link.workItemBinding ? "artifact-link" : "legacy-artifact-link");
      artifacts.add(artifact);
    }
  }

  if (!binding && !artifactLinks.some((link) => link.workItemBinding) && (scope.taskId || scope.graphId)) {
    const tokens = uniqueStrings([scope.taskId, scope.graphId]);
    for (const artifact of receiptArtifacts) {
      if (tokens.some((token) => token && normalizeRelPath(artifact).includes(token))) {
        modes.push("legacy-path-token");
        artifacts.add(artifact);
      }
    }
  }

  return {
    matches: modes.length > 0,
    modes: uniqueStrings(modes),
    artifacts: [...artifacts].sort(),
  };
}

function workItemBindingMatchesScope(binding = null, scope = {}) {
  if (!binding) return false;
  const taskId = normalizeOptional(binding.taskId || binding.workItemId) || null;
  const graphId = normalizeOptional(binding.graphId || binding.workGraphId) || inferGraphIdFromTaskId(taskId) || null;
  if (scope.taskId && taskId !== scope.taskId) return false;
  if (scope.graphId && graphId !== scope.graphId) return false;
  return Boolean(scope.taskId || scope.graphId);
}

function receiptArtifactPaths(receipt = {}) {
  return uniqueStrings([
    ...(Array.isArray(receipt.outputArtifacts) ? receipt.outputArtifacts : []),
    ...(Array.isArray(receipt.outputHashes) ? receipt.outputHashes.map((item) => item.path) : []),
  ]).map(normalizeRelPath);
}

function readReceiptArtifactLinks(rootDir, receipt = {}) {
  if (!receipt.__file) return [];
  const linksPath = join(rootDir, ...dirname(receipt.__file).split("/"), ARTIFACT_LINKS_FILE);
  const manifest = readJsonSync(linksPath);
  return Array.isArray(manifest?.links) ? manifest.links : [];
}

function supersededReceiptMap(receipts = []) {
  const out = new Map();
  for (const receipt of receipts) {
    const originalReceiptId = receipt.supersedes?.receiptId || receipt.recovery?.originalReceiptId;
    if (!originalReceiptId) continue;
    const current = compactOptionalObject({
      receiptId: receipt.receiptId || null,
      receiptPath: receipt.__file || null,
      issuedAt: receipt.runtime?.issuedAt || receipt.completedAt || receipt.startedAt || null,
    });
    const previous = out.get(originalReceiptId);
    if (!previous || compareReceiptReplacement(current, previous) > 0) out.set(originalReceiptId, current);
  }
  return out;
}

function compareWorkItemReceiptCandidates(left, right) {
  const statusRank = { trusted: 0, migrated: 1, legacy: 2, stale: 3, superseded: 4, untrusted: 5 };
  return (statusRank[left.status] ?? 9) - (statusRank[right.status] ?? 9)
    || compareReceiptReplacement(right.runtime || {}, left.runtime || {})
    || String(left.receiptPath || "").localeCompare(String(right.receiptPath || ""))
    || String(left.receiptId || "").localeCompare(String(right.receiptId || ""));
}

function compareReceiptReplacement(left = {}, right = {}) {
  return String(left.issuedAt || "").localeCompare(String(right.issuedAt || ""))
    || String(left.receiptPath || "").localeCompare(String(right.receiptPath || ""))
    || String(left.receiptId || "").localeCompare(String(right.receiptId || ""));
}

function proofProjectionForWorkItemReceiptLookup(candidate = {}, scope = {}) {
  const trusted = ["trusted", "migrated"].includes(candidate.status);
  const missing = candidate.status === "legacy";
  const artifactPath = candidate.matchedArtifacts[0] || candidate.outputArtifacts[0] || scope.artifactPaths[0] || candidate.receiptPath || "unknown";
  return compactOptionalObject({
    schemaVersion: "ProofProjectionV1",
    artifactId: scope.taskId || scope.graphId || candidate.receiptId || "work-item-receipt-lookup",
    artifactPath,
    trustStatus: trusted ? "trusted" : missing ? "missing-proof" : "untrusted",
    provenance: trusted ? {
      source: "runtime-receipt",
      receiptId: candidate.receiptId,
      reason: "Runtime workflow receipt binds the work item lookup to receipt, ledger, and artifact-link evidence.",
    } : missing ? {
      source: "legacy-missing-proof",
      reason: "Legacy receipt candidate lacks deterministic work item binding; runtime reissue is required before trusted adoption.",
    } : {
      source: "runtime-receipt",
      receiptId: candidate.receiptId,
      reason: "Runtime receipt candidate exists but is not trusted for this work item lookup.",
    },
    receiptId: candidate.receiptId,
    ledgerHash: candidate.ledger?.entryHash || candidate.runtime?.canonicalHash || null,
    producer: compactOptionalObject({
      type: candidate.subjectType || null,
      id: candidate.agentId || candidate.subjectId || null,
    }),
    hostInvocation: candidate.hostInvocation || null,
    evidence: candidate.matchedArtifacts.map((artifact) => ({
      kind: "artifact",
      artifactPath: artifact,
      receiptId: candidate.receiptId,
    })),
    migration: candidate.migration || null,
    notes: candidate.status === "superseded"
      ? ["Receipt has been superseded by a newer runtime-issued receipt."]
      : candidate.status === "stale"
        ? candidate.driftIssues
        : candidate.status === "untrusted"
          ? candidate.trust.issues
          : [],
  });
}

function missingProofProjectionForWorkItemReceiptLookup(scope = {}) {
  return {
    schemaVersion: "ProofProjectionV1",
    artifactId: scope.taskId || scope.graphId || scope.receiptId || "work-item-receipt-lookup",
    artifactPath: scope.artifactPaths[0] || "unknown",
    trustStatus: "missing-proof",
    provenance: {
      source: "legacy-missing-proof",
      reason: "No runtime-issued workflow receipt matched the requested work item lookup scope.",
    },
    migration: {
      from: "missing-work-item-receipt-binding",
      behavior: "issue or reissue a runtime workflow receipt with work item binding before trusted use",
    },
  };
}

function workItemReceiptDiagnosticSummary(candidate = {}) {
  return compactOptionalObject({
    status: candidate.status || null,
    receiptId: candidate.receiptId || null,
    receiptPath: candidate.receiptPath || null,
    command: candidate.command || null,
    handoffId: candidate.handoffId || null,
    stage: candidate.stage || null,
    subjectType: candidate.subjectType || null,
    subjectId: candidate.subjectId || null,
    agentId: candidate.agentId || null,
    workItemBinding: candidate.workItemBinding || null,
    matchedBy: candidate.matchedBy || [],
    matchedArtifacts: candidate.matchedArtifacts || [],
    supersededBy: candidate.supersededBy || null,
    migration: candidate.migration || null,
  });
}

function workItemReceiptDriftDiagnostics(candidate = {}) {
  const diagnostics = [];
  const base = {
    receiptId: candidate.receiptId || null,
    receiptPath: candidate.receiptPath || null,
    classification: candidate.status || "unknown",
  };
  if (candidate.status === "superseded") {
    diagnostics.push({
      ...base,
      code: "superseded-receipt",
      severity: "warning",
      message: "receipt was superseded by a newer runtime-issued receipt",
      repairHint: candidate.supersededBy?.receiptPath
        ? "use the superseding receipt at " + candidate.supersededBy.receiptPath
        : "rerun work item receipt lookup and use the newest trusted replacement receipt",
    });
  }
  if (candidate.status === "migrated") {
    diagnostics.push({
      ...base,
      code: "migrated-receipt",
      severity: "info",
      message: "receipt was produced by a runtime migration or reissue path",
      repairHint: "keep the migration metadata and cite this receipt only with its runtime ledger entry",
    });
  }
  if (candidate.status === "legacy") {
    diagnostics.push({
      ...base,
      code: "legacy-receipt-binding",
      severity: "warning",
      message: "receipt matched through legacy artifact evidence rather than deterministic work item binding",
      repairHint: "reissue the receipt with --graph-id and --task-id to create deterministic work item binding",
    });
  }
  if (candidate.status === "untrusted") {
    diagnostics.push({
      ...base,
      code: "untrusted-receipt",
      severity: "error",
      message: "receipt failed runtime trust validation",
      repairHint: "run node scripts/workflow-receipt.mjs recovery-status, then reissue or rebuild the ledger using workflow-receipt repair commands",
    });
  }

  for (const issue of [...(candidate.driftIssues || []), ...(candidate.trust?.issues || [])]) {
    const code = workItemReceiptDriftIssueCode(issue);
    if (!code) continue;
    diagnostics.push({
      ...base,
      code,
      severity: "error",
      artifactPath: extractReceiptDriftIssuePath(issue),
      message: issue,
      repairHint: workItemReceiptDriftRepairHint(code, candidate),
    });
  }
  return dedupeWorkItemReceiptDiagnostics(diagnostics);
}

function workItemReceiptDriftIssueCode(issue = "") {
  const text = String(issue || "");
  if (/artifact link manifest missing|artifact link missing/i.test(text)) return "missing-artifact-link";
  if (/hash mismatch/i.test(text)) return "hash-mismatch";
  if (/output artifact missing/i.test(text)) return "missing-output-artifact";
  if (/canonical hash mismatch|signature mismatch|keyId mismatch|runtime .*missing|runtime .*invalid|ledger .*mismatch|ledger entry missing/i.test(text)) return "untrusted-receipt";
  return null;
}

function extractReceiptDriftIssuePath(issue = "") {
  const text = String(issue || "");
  const colon = /^.+?:\s*(.+)$/.exec(text);
  if (colon) return normalizeRelPath(colon[1]);
  const artifactLink = /for\s+(.+)$/i.exec(text);
  return artifactLink ? normalizeRelPath(artifactLink[1]) : null;
}

function workItemReceiptDriftRepairHint(code, candidate = {}) {
  const receiptPath = candidate.receiptPath || "<receipt-json>";
  if (code === "missing-artifact-link") {
    return "reissue the receipt to regenerate artifact-links.json: node scripts/workflow-receipt.mjs reissue --receipt " + receiptPath;
  }
  if (code === "hash-mismatch" || code === "missing-output-artifact") {
    return "treat the receipt as stale; regenerate the stable output artifact, then reissue or prune stale receipts with explicit --apply";
  }
  return "inspect trust state with node scripts/workflow-receipt.mjs recovery-status and repair using reissue, prune-stale, or rebuild-ledger";
}

function dedupeWorkItemReceiptDiagnostics(diagnostics = []) {
  const seen = new Set();
  const out = [];
  for (const item of diagnostics) {
    const key = [item.receiptId, item.code, item.artifactPath || "", item.message || ""].join("\0");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function nextWorkItemReceiptDriftRepairCommand({ lookup = {}, diagnostics = [], selectedDiagnostics = [] } = {}) {
  if (!lookup.selected) return "node scripts/workflow-receipt.mjs lookup-work-item --task-id <work-item-id> --graph-id <graph-id>";
  const active = selectedDiagnostics.length ? selectedDiagnostics : diagnostics;
  if (active.some((item) => item.code === "missing-artifact-link")) {
    return "node scripts/workflow-receipt.mjs reissue --receipt " + (lookup.selected.receiptPath || "<receipt-json>");
  }
  if (active.some((item) => item.code === "hash-mismatch" || item.code === "missing-output-artifact")) {
    return "node scripts/workflow-receipt.mjs prune-stale --apply";
  }
  if (active.some((item) => item.code === "untrusted-receipt")) {
    return "node scripts/workflow-receipt.mjs recovery-status";
  }
  if (lookup.selected.status === "superseded" && lookup.selected.supersededBy?.receiptPath) {
    return "node scripts/workflow-receipt.mjs lookup-work-item --receipt " + lookup.selected.supersededBy.receiptId;
  }
  return lookup.pass ? "none" : "node scripts/workflow-receipt.mjs reissue --receipt " + (lookup.selected.receiptPath || "<receipt-json>");
}

function normalizeCommand(value) {
  const normalized = normalizeOptional(value);
  if (!normalized) return "";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function normalizeOptional(value) {
  const normalized = String(value ?? "").trim();
  return normalized || "";
}

function arrayFrom(value) {
  if (Array.isArray(value)) return value.flatMap((item) => arrayFrom(item));
  if (value === undefined || value === null || value === false) return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function uniqueStrings(values = []) {
  return [...new Set(values.flatMap((item) => arrayFrom(item)).map(String).filter(Boolean))];
}

function compactOptionalObject(value = {}) {
  const entries = Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== "");
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function buildScopedHostInvocation(options = {}) {
  const invocationId = options.hostInvocationId || options.hostInvocationID || options.invocationId || options["host-invocation-id"];
  const source = options.hostInvocationSource || options["host-invocation-source"];
  const evidencePath = options.hostInvocationEvidence || options.hostTrace || options["host-invocation-evidence"] || options["host-trace"];
  const agentId = options.hostInvocationAgentId || options["host-invocation-agent-id"];
  if (!invocationId && !source && !evidencePath && !agentId) return null;
  return compactOptionalObject({
    source: source || null,
    invocationId: invocationId || null,
    evidencePath: evidencePath || null,
    agentId: agentId || null,
  });
}

function hostInvocationMatchesScope(proof = null, expected = null) {
  if (!expected) return true;
  if (!proof) return false;
  const normalized = {
    source: proof.source || null,
    invocationId: proof.invocationId || proof.invocation_id || proof.id || null,
    evidencePath: proof.evidencePath || proof.evidence_path || null,
    agentId: proof.agentId || proof.agent_id || null,
  };
  if (expected.source && normalized.source !== expected.source) return false;
  if (expected.invocationId && normalized.invocationId !== expected.invocationId) return false;
  if (expected.evidencePath && normalizeRelPath(normalized.evidencePath) !== normalizeRelPath(expected.evidencePath)) return false;
  if (expected.agentId && normalized.agentId !== expected.agentId) return false;
  return true;
}

function sameWorkflowArtifact(left, right) {
  const a = normalizeRelPath(left);
  const b = normalizeRelPath(right);
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

function invalidReceiptPathMatchesWorkflowScope(receipt = {}, scope = {}) {
  const file = normalizeRelPath(receipt.__file || "");
  if (!file) return false;
  const commandPath = normalizeCommand(scope.command).replace(/^\//, "");
  if (commandPath && !file.includes(`/_workflow-invocations/${commandPath}/`)) return false;
  if (scope.handoffId && !file.includes(`/${scope.handoffId}/`)) return false;
  return true;
}

function scopedWorkflowReceiptFileHint(scope = {}) {
  const commandPath = normalizeCommand(scope.command).replace(/^\//, "") || "workflow";
  if (scope.handoffId) return `.supervibe/artifacts/_workflow-invocations/${commandPath}/${scope.handoffId}`;
  if (scope.workflowRunId) return `.supervibe/artifacts/_workflow-invocations/${commandPath}/${scope.workflowRunId}`;
  return `.supervibe/artifacts/_workflow-invocations/${commandPath}`;
}

function repairCommandForReceiptIssues(issues = []) {
  if (!issues.length) return null;
  if (issues.some((item) => /ledger/i.test(`${item.code} ${item.message}`))) {
    return "node scripts/workflow-receipt.mjs rebuild-ledger --prune-stale";
  }
  if (issues.some((item) => /hash mismatch|missing/.test(String(item.message || "")))) {
    return "node scripts/workflow-receipt.mjs recovery-status";
  }
  return "node scripts/workflow-receipt.mjs recovery-status";
}

function receiptSignatureIssues(rootDir, receipt = {}, options = {}) {
  const issues = [];
  const secret = options.secret ?? readReceiptSecretSync(rootDir);
  if (receipt.runtime?.issuer !== WORKFLOW_RECEIPT_ISSUER) {
    issues.push("runtime issuer missing or invalid");
  }
  if (receipt.runtime?.algorithm !== ALGORITHM) {
    issues.push("runtime signature algorithm missing or invalid");
  }
  if (!receipt.runtime?.canonicalHash || !receipt.runtime?.signature) {
    issues.push("runtime canonicalHash/signature missing");
  }
  if (!secret) {
    issues.push("receipt runtime secret missing");
    return issues;
  }
  const canonical = canonicalReceiptForVerification(receipt);
  const expectedHash = sha256(stableStringify(canonical));
  const expectedSignature = signCanonical(canonical, secret);
  if (receipt.runtime.canonicalHash !== expectedHash) {
    issues.push("receipt canonical hash mismatch");
  }
  if (receipt.runtime.signature !== expectedSignature) {
    issues.push("receipt signature mismatch");
  }
  if (receipt.runtime.keyId !== keyIdForSecret(secret)) {
    issues.push("receipt keyId mismatch");
  }
  return issues;
}

function validateArtifactLinks(rootDir, receipt) {
  const issues = [];
  const receiptDir = receipt.__file
    ? join(rootDir, ...dirname(receipt.__file).split("/"))
    : null;
  if (!receiptDir) {
    return { pass: false, issues: ["receipt file path missing for artifact link validation"] };
  }
  const linksPath = join(receiptDir, ARTIFACT_LINKS_FILE);
  const manifest = readJsonSync(linksPath);
  if (!manifest) {
    return { pass: false, issues: [`artifact link manifest missing for receipt ${receipt.receiptId}`] };
  }
  for (const output of receipt.outputHashes || []) {
    const link = (manifest.links || []).find((candidate) => {
      return normalizeRelPath(candidate.artifactPath) === normalizeRelPath(output.path)
        && candidate.receiptId === receipt.receiptId;
    });
    const legacySharedLink = !link && (manifest.links || []).some((candidate) => {
      return normalizeRelPath(candidate.artifactPath) === normalizeRelPath(output.path)
        && candidate.sha256 === output.sha256;
    });
    if (!link && !legacySharedLink) {
      issues.push(`artifact link missing for ${output.path}`);
      continue;
    }
    if (legacySharedLink) continue;
    if (link.receiptId !== receipt.receiptId) {
      issues.push(`artifact link receipt mismatch for ${output.path}`);
    }
    if (link.sha256 !== output.sha256) {
      issues.push(`artifact link hash mismatch for ${output.path}`);
    }
  }
  return { pass: issues.length === 0, issues };
}

async function ensureReceiptSecret(rootDir, secret) {
  if (secret) return secret;
  const keyPath = defaultWorkflowReceiptKeyPath(rootDir);
  if (existsSync(keyPath)) {
    return (await readFile(keyPath, "utf8")).trim();
  }
  const generated = randomBytes(32).toString("hex");
  await mkdir(dirname(keyPath), { recursive: true });
  await writeFile(keyPath, `${generated}\n`, "utf8");
  return generated;
}

function readReceiptSecretSync(rootDir) {
  const keyPath = defaultWorkflowReceiptKeyPath(rootDir);
  if (!existsSync(keyPath)) return null;
  return readFileSync(keyPath, "utf8").trim();
}

async function upsertArtifactLinks(path, receipt, receiptPath) {
  let manifest = { schemaVersion: 1, links: [] };
  if (existsSync(path)) {
    try {
      manifest = JSON.parse(await readFile(path, "utf8"));
    } catch {
      manifest = { schemaVersion: 1, links: [] };
    }
  }
  const links = Array.isArray(manifest.links) ? manifest.links : [];
  const nextLinks = links.filter((link) => {
    return normalizeRelPath(link.receiptPath) !== normalizeRelPath(receiptPath);
  });
  for (const output of receipt.outputHashes) {
    nextLinks.push({
      artifactPath: output.path,
      receiptId: receipt.receiptId,
      receiptPath,
      sha256: output.sha256,
      ...(receipt.workItemBinding ? { workItemBinding: receipt.workItemBinding } : {}),
    });
  }
  await writeFile(path, `${JSON.stringify({ schemaVersion: 1, links: nextLinks }, null, 2)}\n`, "utf8");
}

async function upsertReceiptLedger(rootDir, entry) {
  const ledgerPath = defaultWorkflowReceiptLedgerPath(rootDir);
  const retained = readReceiptLedgerSync(rootDir)
    .filter((item) => !item.__invalidJson)
    .filter((item) => normalizeRelPath(item.receiptPath) !== normalizeRelPath(entry.receiptPath));
  const chained = rebuildLedgerEntries([...retained, { schemaVersion: 1, ...entry }]);
  const ledgerEntry = chained[chained.length - 1];
  await mkdir(dirname(ledgerPath), { recursive: true });
  await writeFile(ledgerPath, `${chained.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
  return ledgerEntry;
}

function rebuildLedgerEntries(entries = []) {
  let previousEntryHash = null;
  const chained = [];
  for (const item of entries) {
    const withChain = {
      ...item,
      schemaVersion: item.schemaVersion || 1,
      previousEntryHash,
    };
    delete withChain.entryHash;
    const entry = {
      ...withChain,
      entryHash: ledgerEntryHash(withChain),
    };
    previousEntryHash = entry.entryHash;
    chained.push(entry);
  }
  return chained;
}

async function withWorkflowReceiptLedgerLock(rootDir, callback) {
  const lockPath = defaultWorkflowReceiptLedgerLockPath(rootDir);
  await mkdir(dirname(lockPath), { recursive: true });
  const started = Date.now();
  let handle = null;
  while (!handle) {
    try {
      handle = await open(lockPath, "wx");
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (Date.now() - started > RECEIPT_LOCK_TIMEOUT_MS) {
        throw new Error(`workflow receipt ledger lock timeout: ${normalizeRelPath(relative(rootDir, lockPath))}`);
      }
      await sleep(RECEIPT_LOCK_RETRY_MS);
    }
  }

  try {
    await handle.writeFile(`${process.pid}:${new Date().toISOString()}\n`, "utf8");
    return await callback();
  } finally {
    await handle.close();
    await unlink(lockPath).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readReceiptLedgerSync(rootDir) {
  const ledgerPath = defaultWorkflowReceiptLedgerPath(rootDir);
  if (!existsSync(ledgerPath)) return [];
  return readFileSync(ledgerPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { __invalidJson: true };
      }
    });
}

function readAllWorkflowReceipts(rootDir) {
  const root = join(rootDir, ".supervibe", "artifacts");
  if (!existsSync(root)) return [];
  const files = [];
  walk(root, files);
  return files
    .filter((file) => {
      const rel = normalizeRelPath(relative(rootDir, file));
      return file.endsWith(".json")
        && !file.endsWith(ARTIFACT_LINKS_FILE)
        && rel.includes("/_workflow-invocations/")
        && !rel.includes("/_workflow-recovery/")
        && !rel.includes("/_workflow-receipt-snapshots/");
    })
    .map((file) => {
      try {
        return {
          ...JSON.parse(readFileSync(file, "utf8")),
          __file: normalizeRelPath(relative(rootDir, file)),
        };
      } catch {
        return { __file: normalizeRelPath(relative(rootDir, file)), __invalidJson: true };
      }
    });
}

function readWorkflowReceiptsByPaths(rootDir, receiptPaths = []) {
  return uniqueStrings(receiptPaths).map((receiptPath) => {
    const relPath = normalizeRelPath(receiptPath);
    const absPath = join(rootDir, ...relPath.split("/"));
    try {
      return {
        ...JSON.parse(readFileSync(absPath, "utf8")),
        __file: relPath,
      };
    } catch {
      return { __file: relPath, __invalidJson: true };
    }
  });
}

function walk(dir, files) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (statSync(full).size > 1_000_000) continue;
    files.push(full);
  }
}

function stripRuntimeFields(receipt = {}) {
  const clone = { ...receipt };
  delete clone.__file;
  delete clone.__invalidJson;
  return clone;
}

function canonicalReceiptForVerification(receipt) {
  const runtime = { ...(receipt.runtime || {}) };
  delete runtime.canonicalHash;
  delete runtime.signature;
  const canonical = {
    schemaVersion: receipt.schemaVersion,
    receiptId: receipt.receiptId,
    command: receipt.command,
    invokedBy: receipt.invokedBy,
    subjectType: receipt.subjectType,
    subjectId: receipt.subjectId,
    agentId: receipt.agentId ?? null,
    skillId: receipt.skillId ?? null,
    stage: receipt.stage,
    status: receipt.status,
    invocationReason: receipt.invocationReason,
    inputEvidence: receipt.inputEvidence || [],
    outputArtifacts: receipt.outputArtifacts || [],
    inputHashes: receipt.inputHashes || [],
    outputHashes: receipt.outputHashes || [],
    startedAt: receipt.startedAt,
    completedAt: receipt.completedAt,
    handoffId: receipt.handoffId,
    runtime,
  };
  if (Object.prototype.hasOwnProperty.call(receipt, "hostInvocation")) {
    canonical.hostInvocation = receipt.hostInvocation || null;
  }
  if (Object.prototype.hasOwnProperty.call(receipt, "evidenceSnapshot")) {
    canonical.evidenceSnapshot = receipt.evidenceSnapshot || null;
  }
  if (Object.prototype.hasOwnProperty.call(receipt, "workItemBinding")) {
    canonical.workItemBinding = receipt.workItemBinding || null;
  }
  if (Object.prototype.hasOwnProperty.call(receipt, "recovery")) {
    canonical.recovery = receipt.recovery || null;
  }
  if (Object.prototype.hasOwnProperty.call(receipt, "supersedes")) {
    canonical.supersedes = receipt.supersedes || null;
  }
  return canonical;
}

function normalizeRecoveryMetadata(value = null) {
  if (!value || typeof value !== "object") return null;
  return {
    operation: String(value.operation || "recovery"),
    originalReceiptId: value.originalReceiptId || value.original_receipt_id || null,
    originalReceiptPath: normalizeRelPath(value.originalReceiptPath || value.original_receipt_path || ""),
    reason: value.reason || null,
  };
}

function isHostAgentSubject(subjectType) {
  return ["agent", "worker", "reviewer"].includes(String(subjectType || "").toLowerCase());
}

function enrichHostInvocationProof(rootDir, proof) {
  if (!proof) return null;
  const source = proof.source || "agent-invocations-jsonl";
  const invocationId = proof.invocationId || proof.invocation_id || proof.id || null;
  const out = {
    source,
    invocationId,
    evidencePath: proof.evidencePath || proof.evidence_path || null,
    agentId: proof.agentId || proof.agent_id || null,
    taskSummaryHash: proof.taskSummaryHash || proof.task_summary_hash || null,
    traceId: proof.traceId || proof.trace_id || null,
    spanId: proof.spanId || proof.span_id || null,
  };
  if (source !== "host-trace-file" && invocationId && !out.taskSummaryHash) {
    const match = readAgentInvocationRecord(rootDir, invocationId);
    if (match) {
      out.agentId = out.agentId || match.agent_id;
      out.taskSummaryHash = sha256(match.task_summary || "");
      out.evidencePath = out.evidencePath || match.structured_output?.json || null;
    }
  }
  return compactOptionalObject(out);
}

function assertHostInvocationProofExists(rootDir, proof, expectedAgentId) {
  if (!proof?.source || !proof?.invocationId) {
    throw new Error("hostInvocation proof required for agent, worker, and reviewer receipts");
  }
  if (proof.source === "host-trace-file") {
    if (!proof.evidencePath) throw new Error("hostInvocation evidencePath required for host-trace-file receipts");
    const absPath = join(rootDir, ...String(proof.evidencePath).split(/[\\/]/));
    if (!existsSync(absPath)) throw new Error(`hostInvocation evidence file not found: ${proof.evidencePath}`);
    return;
  }
  const match = readAgentInvocationRecord(rootDir, proof.invocationId);
  if (!match) {
    throw new Error(missingHostInvocationRecoveryMessage({ proof, expectedAgentId }));
  }
  if (expectedAgentId && match.agent_id && match.agent_id !== expectedAgentId) {
    throw new Error(`hostInvocation agent mismatch: expected ${expectedAgentId}, got ${match.agent_id}`);
  }
}

function missingHostInvocationRecoveryMessage({ proof, expectedAgentId }) {
  const source = proof?.source || "agent-invocations-jsonl";
  const invocationId = proof?.invocationId || "<runtime-id>";
  const agentId = expectedAgentId || proof?.agentId || "<agent-id>";
  const host = source === "codex-spawn-agent" ? "codex" : "<host>";
  return [
    `hostInvocation ${invocationId} not found in .supervibe/memory/agent-invocations.jsonl for ${source}`,
    `Supported recovery: node scripts/agent-invocation.mjs log --agent ${agentId} --host ${host} --host-invocation-id ${invocationId} --task "<summary>" --confidence <0-10>`,
    `Atomic receipt path: add --issue-receipt --command <workflow-command> --stage <stage-id> --handoff-id <handoff-id> --output-artifacts <stable-output-path>`,
    "Do not hand-edit receipts or .supervibe/memory/agent-invocations.jsonl.",
  ].join(". ");
}

function readAgentInvocationRecord(rootDir, invocationId) {
  const logPath = join(rootDir, ".supervibe", "memory", "agent-invocations.jsonl");
  if (!existsSync(logPath)) return null;
  const lines = readFileSync(logPath, "utf8").split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    try {
      const record = JSON.parse(line);
      const id = record.invocation_id || record.invocationId;
      if (id !== invocationId) continue;
      return {
        agent_id: record.agent_id || record.agentId || record.subagent_type || record.subjectId,
        task_summary: record.task_summary || record.taskSummary || record.description || "",
        structured_output: record.structured_output || null,
      };
    } catch {
      // Invalid log entries are reported by the producer validator, not receipt issue.
    }
  }
  return null;
}

function signCanonical(canonical, secret) {
  return createHmac("sha256", secret).update(stableStringify(canonical)).digest("hex");
}

function hashEvidencePath(rootDir, path, { required }) {
  const relPath = normalizeInputPath(path, rootDir);
  let absPath = join(rootDir, ...relPath.split("/"));
  if (!existsSync(absPath)) {
    const archived = resolveArchivedWorkItemArtifact(rootDir, relPath);
    if (archived) absPath = archived.absPath;
    else {
      if (required) throw new Error(`Required artifact missing: ${relPath}`);
      return { path: relPath, exists: false, sha256: null };
    }
  }
  const content = readFileSync(absPath);
  const compactDigest = compactManifestOriginalDigest(rootDir, relPath, content);
  if (compactDigest) {
    return {
      path: relPath,
      exists: true,
      sha256: compactDigest,
      compactManifest: true,
    };
  }
  return {
    path: relPath,
    exists: true,
    sha256: sha256(content),
  };
}

function resolveArchivedWorkItemArtifact(rootDir, relPath) {
  const normalized = normalizeRelPath(relPath);
  const match = normalized.match(/^\.supervibe\/memory\/work-items\/([^/]+)\/(.+)$/);
  if (!match || normalized.includes("/.archive/")) return null;
  const [, graphId, suffix] = match;
  const archiveRoot = join(rootDir, ".supervibe", "memory", "work-items", ".archive");
  const logPath = join(archiveRoot, "_archive-log.jsonl");
  if (!existsSync(logPath)) return null;
  const entries = readFileSync(logPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    })
    .reverse();
  for (const entry of entries) {
    if (entry.type !== "work-item-graph") continue;
    if (String(entry.graphId || "") !== graphId) continue;
    if (!entry.archivePath) continue;
    const archivePath = isAbsolute(entry.archivePath) ? entry.archivePath : join(rootDir, ...normalizeRelPath(entry.archivePath).split("/"));
    const candidate = join(archivePath, ...suffix.split("/"));
    if (existsSync(candidate)) return { absPath: candidate, archivePath: normalizeRelPath(relative(rootDir, candidate)) };
  }
  return null;
}

function compactManifestOriginalDigest(rootDir, relPath, content) {
  let manifest;
  try {
    manifest = JSON.parse(Buffer.isBuffer(content) ? content.toString("utf8") : String(content || ""));
  } catch {
    return null;
  }
  if (manifest?.type !== COMPACT_MANIFEST_TYPE) return null;
  if (normalizeRelPath(manifest.originalPath) !== normalizeRelPath(relPath)) return null;
  if (manifest.compression !== "gzip") return null;
  if (!manifest.originalSha256 || !manifest.archiveSha256 || !manifest.archivePath) return null;
  const archiveRel = normalizeRelPath(manifest.archivePath);
  const archiveAbs = join(rootDir, ...archiveRel.split("/"));
  if (!existsSync(archiveAbs)) return null;
  const archived = readFileSync(archiveAbs);
  if (sha256(archived) !== manifest.archiveSha256) return null;
  let original;
  try {
    original = gunzipSync(archived);
  } catch {
    return null;
  }
  if (sha256(original) !== manifest.originalSha256) return null;
  return manifest.originalSha256;
}

function normalizePathList(paths, rootDir) {
  return [...new Set((Array.isArray(paths) ? paths : []).map((path) => normalizeInputPath(path, rootDir)))];
}

function normalizeInputPath(path, rootDir) {
  const value = String(path ?? "");
  const rel = isAbsolute(value) ? relative(rootDir, value) : value;
  return normalizeRelPath(rel);
}

function resolveReceiptDir(rootDir, path) {
  return isAbsolute(path) ? path : join(rootDir, ...normalizeRelPath(path).split("/"));
}

function sanitizeId(value) {
  return String(value ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

function receiptPrefixFromReceiptId(receiptId = "") {
  const match = String(receiptId || "").match(/^(.+)-[a-f0-9]{12}$/i);
  return match ? match[1] : "workflow";
}

function keyIdForSecret(secret) {
  return `key-${sha256(secret).slice(0, 12)}`;
}

function resolveWorkflowRunTimestamp({ runTimestamp = null, startedAt = null, completedAt = null } = {}) {
  return runTimestamp
    || process.env.SUPERVIBE_RUN_TIMESTAMP
    || completedAt
    || startedAt
    || new Date().toISOString();
}

function ledgerEntryHash(entry) {
  const copy = { ...entry };
  delete copy.entryHash;
  return sha256(stableStringify(copy));
}

function readJsonSync(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}


function hashGeneratedStatePath(rootDir, path) {
  const relPath = normalizeInputPath(path, rootDir);
  const absPath = join(rootDir, ...relPath.split("/"));
  if (!existsSync(absPath)) {
    return {
      exists: false,
      sha256: null,
      bytes: 0,
      mtimeMs: null,
    };
  }
  const bytes = readFileSync(absPath);
  const stats = statSync(absPath);
  return {
    exists: true,
    sha256: sha256(bytes),
    bytes: bytes.length,
    mtimeMs: stats.mtimeMs,
  };
}

function snapshotNameForGeneratedState(path) {
  const normalized = normalizeRelPath(path);
  const suffix = normalized.endsWith(".jsonl") ? ".jsonl" : normalized.endsWith(".db") ? ".db" : ".json";
  return normalized.replace(/[^A-Za-z0-9._-]+/g, "__") + suffix;
}

function generatedStateRestoreCommand({ snapshotPath, targetPath } = {}) {
  const script = "const fs=require('node:fs');const path=require('node:path');fs.mkdirSync(path.dirname(process.argv[2]),{recursive:true});fs.copyFileSync(process.argv[1],process.argv[2]);";
  return "node -e " + JSON.stringify(script) + " " + JSON.stringify(snapshotPath) + " " + JSON.stringify(targetPath);
}

async function withGeneratedStateRecoveryLock(rootDir, lockPath, callback) {
  const relPath = normalizeInputPath(lockPath, rootDir);
  const absPath = join(rootDir, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  const started = Date.now();
  let handle = null;
  while (!handle) {
    try {
      handle = await open(absPath, "wx");
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (Date.now() - started > RECEIPT_LOCK_TIMEOUT_MS) {
        throw new Error("generated-state recovery lock timeout: " + relPath);
      }
      await sleep(RECEIPT_LOCK_RETRY_MS);
    }
  }
  try {
    await handle.writeFile(process.pid + ":" + new Date().toISOString() + "\n", "utf8");
    return await callback();
  } finally {
    await handle.close();
    await unlink(absPath).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
}

function policyIssue(code, message, extra = {}) {
  return { code, message, ...extra };
}

function normalizeRelPath(path) {
  return String(path ?? "").split(sep).join("/").replace(/^\.\//, "");
}
