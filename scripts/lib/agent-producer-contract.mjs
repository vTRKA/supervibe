import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, sep } from "node:path";

import {
  readWorkflowReceipts,
  validateWorkflowReceiptTrust,
} from "./supervibe-workflow-receipt-runtime.mjs";

export const AGENT_INVOCATION_LOG_RELATIVE_PATH = ".supervibe/memory/agent-invocations.jsonl";
const HOST_AGENT_SUBJECT_TYPES = Object.freeze(["agent", "worker", "reviewer"]);
const HOST_INVOCATION_SOURCES = Object.freeze([
  "agent-invocations-jsonl",
  "claude-code-task-hook",
  "codex-spawn-agent",
  "gemini-agent-run",
  "opencode-agent-run",
  "cursor-agent-run",
  "host-trace-file",
]);

export function createAgentInvocationId({
  agentId,
  taskSummary,
  ts = new Date().toISOString(),
  sessionId = "",
} = {}) {
  const seed = `${agentId || "unknown"}:${sessionId || ""}:${ts}:${taskSummary || ""}`;
  return `agent-${sha256(seed).slice(0, 16)}`;
}

function taskSummaryHash(taskSummary = "") {
  return sha256(String(taskSummary || ""));
}

function isHostAgentReceipt(receipt = {}) {
  const subjectType = String(receipt.subjectType || "").toLowerCase();
  return HOST_AGENT_SUBJECT_TYPES.includes(subjectType);
}

function isProducerReceipt(receipt = {}) {
  const subjectType = String(receipt.subjectType || "").toLowerCase();
  return subjectType === "skill" || HOST_AGENT_SUBJECT_TYPES.includes(subjectType);
}

function isSkillProducerReceipt(receipt = {}) {
  return String(receipt.subjectType || "").toLowerCase() === "skill";
}

function isRecoveryReceipt(receipt = {}) {
  return Boolean(receipt?.recovery || receipt?.runtime?.recovery);
}

function producerSignature(receipt = {}) {
  const outputs = Array.isArray(receipt.outputArtifacts)
    ? receipt.outputArtifacts.map(normalizeRelPath).sort()
    : [];
  return [
    normalizeCommand(receipt.command),
    String(receipt.subjectType || "").toLowerCase(),
    receipt.subjectId || receipt.agentId || receipt.skillId || "",
    receipt.stage || "",
    outputs.join("|"),
  ].join("::");
}

function readAgentInvocationLog(rootDir = process.cwd()) {
  const logPath = join(rootDir, ...AGENT_INVOCATION_LOG_RELATIVE_PATH.split("/"));
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        const parsed = JSON.parse(line);
        return normalizeAgentInvocationRecord(parsed, index);
      } catch {
        return { __invalidJson: true, __line: index + 1 };
      }
    });
}

function normalizeHostInvocationProof(rootDir = process.cwd(), proof = null) {
  if (!proof) return null;
  const source = proof.source || "agent-invocations-jsonl";
  const invocationId = proof.invocationId || proof.invocation_id || proof.id || null;
  const evidencePath = proof.evidencePath || proof.evidence_path || null;
  const out = {
    source,
    invocationId,
    evidencePath,
    agentId: proof.agentId || proof.agent_id || null,
    taskSummaryHash: proof.taskSummaryHash || proof.task_summary_hash || null,
    traceId: proof.traceId || proof.trace_id || null,
    spanId: proof.spanId || proof.span_id || null,
  };
  if (invocationId && !out.taskSummaryHash) {
    const match = readAgentInvocationLog(rootDir).find((entry) => entry.invocation_id === invocationId);
    if (match && !match.__invalidJson) {
      out.agentId = out.agentId || match.agent_id;
      out.taskSummaryHash = taskSummaryHash(match.task_summary || "");
      out.evidencePath = out.evidencePath || match.structured_output?.json || null;
    }
  }
  return out;
}

export function validateHostInvocationProof(rootDir = process.cwd(), receipt = {}, options = {}) {
  if (!isHostAgentReceipt(receipt)) return [];

  const issues = [];
  const expectedAgentId = receipt.agentId || receipt.subjectId;
  const proof = normalizeHostInvocationProof(rootDir, receipt.hostInvocation);
  if (!proof?.source || !proof?.invocationId) {
    issues.push({
      code: "missing-host-agent-invocation",
      file: receipt.__file || "workflow receipt",
      message: `${receipt.__file || receipt.receiptId}: agent-like receipt for ${expectedAgentId} requires hostInvocation.source and hostInvocation.invocationId`,
    });
    return issues;
  }
  if (!HOST_INVOCATION_SOURCES.includes(proof.source)) {
    issues.push({
      code: "unknown-host-invocation-source",
      file: receipt.__file || "workflow receipt",
      message: `${receipt.__file || receipt.receiptId}: unsupported hostInvocation.source ${proof.source}`,
    });
    return issues;
  }

  if (proof.source === "host-trace-file") {
    issues.push(...validateHostTraceFile(rootDir, receipt, proof));
    return issues;
  }

  const invocationLog = options.agentInvocationLog || readAgentInvocationLog(rootDir);
  const match = invocationLog.find((entry) => entry.invocation_id === proof.invocationId);
  if (!match) {
    issues.push({
      code: "missing-host-agent-invocation",
      file: receipt.__file || "workflow receipt",
      message: `${receipt.__file || receipt.receiptId}: host invocation ${proof.invocationId} not found in ${AGENT_INVOCATION_LOG_RELATIVE_PATH}`,
    });
    return issues;
  }
  if (match.__invalidJson) {
    issues.push({
      code: "invalid-host-agent-invocation",
      file: AGENT_INVOCATION_LOG_RELATIVE_PATH,
      message: `${AGENT_INVOCATION_LOG_RELATIVE_PATH}:${match.__line}: invalid JSON for host invocation ${proof.invocationId}`,
    });
    return issues;
  }
  if (match.agent_id !== expectedAgentId) {
    issues.push({
      code: "host-agent-mismatch",
      file: receipt.__file || "workflow receipt",
      message: `${receipt.__file || receipt.receiptId}: receipt agent ${expectedAgentId} does not match host invocation agent ${match.agent_id}`,
    });
  }
  if (proof.taskSummaryHash && proof.taskSummaryHash !== taskSummaryHash(match.task_summary || "")) {
    issues.push({
      code: "host-invocation-hash-mismatch",
      file: receipt.__file || "workflow receipt",
      message: `${receipt.__file || receipt.receiptId}: host invocation task summary hash mismatch for ${proof.invocationId}`,
    });
  }
  if (match.confidence_score === undefined || typeof Number(match.confidence_score) !== "number" || Number.isNaN(Number(match.confidence_score))) {
    issues.push({
      code: "invalid-host-agent-invocation",
      file: AGENT_INVOCATION_LOG_RELATIVE_PATH,
      message: `${AGENT_INVOCATION_LOG_RELATIVE_PATH}: host invocation ${proof.invocationId} missing numeric confidence_score`,
    });
  }
  return issues;
}

export function validateAgentProducerReceipts(rootDir = process.cwd(), options = {}) {
  const receipts = readWorkflowReceipts(rootDir);
  const expectations = expectedProducerReceiptsForDurableOutputs(rootDir);
  const invocationLog = options.agentInvocationLog || readAgentInvocationLog(rootDir);
  const issues = [];
  const trustedHostAgentReceiptIds = new Set();
  const receiptBoundInvocationIds = new Set();
  const trustedNonRecoveryProducerSignatures = new Set();

  for (const receipt of receipts) {
    if (receipt.__invalidJson || !isProducerReceipt(receipt) || isRecoveryReceipt(receipt)) continue;
    const trust = validateWorkflowReceiptTrust(rootDir, receipt, options);
    const hostIssues = isHostAgentReceipt(receipt)
      ? validateHostInvocationProof(rootDir, receipt, { ...options, agentInvocationLog: invocationLog })
      : [];
    if (trust.issues.length === 0 && hostIssues.length === 0) {
      trustedNonRecoveryProducerSignatures.add(producerSignature(receipt));
    }
  }

  for (const receipt of receipts) {
    if (receipt.__invalidJson) continue;
    if (!isProducerReceipt(receipt)) continue;
    if (isRecoveryReceipt(receipt)) {
      if (trustedNonRecoveryProducerSignatures.has(producerSignature(receipt))) continue;
      issues.push({
        code: "recovery-receipt-not-producer-proof",
        file: receipt.__file || "workflow receipt",
        message: `${receipt.__file || receipt.receiptId}: recovery/reissue receipt is repair evidence only and cannot prove a producer ran before durable output`,
      });
      continue;
    }
    const trust = validateWorkflowReceiptTrust(rootDir, receipt, options);
    for (const message of trust.issues) {
      issues.push({
        code: /artifact link manifest missing|artifact link missing/i.test(message)
          ? "missing-agent-producer-artifact-link"
          : "untrusted-agent-producer-receipt",
        file: receipt.__file,
        message: `${receipt.__file}: ${message}`,
      });
    }
    if (isHostAgentReceipt(receipt)) {
      const hostIssues = validateHostInvocationProof(rootDir, receipt, { ...options, agentInvocationLog: invocationLog });
      issues.push(...hostIssues);
      if (receipt.status === "completed" && trust.issues.length === 0 && hostIssues.length === 0) {
        trustedHostAgentReceiptIds.add(receipt.receiptId || receipt.__file);
        const proof = normalizeHostInvocationProof(rootDir, receipt.hostInvocation);
        if (proof?.invocationId) receiptBoundInvocationIds.add(proof.invocationId);
      }
    }
  }

  for (const expectation of expectations) {
    const matching = receipts.filter((receipt) => receiptMatchesProducerExpectation(receipt, expectation));
    if (matching.length === 0) {
      issues.push({
        code: "missing-agent-producer-receipt",
        file: expectation.outputArtifact,
        message: `${expectation.outputArtifact}: missing completed ${expectation.subjectType} ${expectation.subjectId} receipt for ${expectation.command}`,
      });
      continue;
    }
    for (const receipt of matching) {
      if (isHostAgentReceipt(receipt)) {
        issues.push(...validateHostInvocationProof(rootDir, receipt, { ...options, agentInvocationLog: invocationLog }));
      }
    }
  }

  const hostAgentReceipts = receipts.filter(isHostAgentReceipt).length;
  const trustedHostAgentReceipts = trustedHostAgentReceiptIds.size;
  const validAgentInvocations = invocationLog.filter((entry) => !entry.__invalidJson).length;
  const receiptBoundAgentInvocations = receiptBoundInvocationIds.size;
  const minHostAgentReceipts = numberOrZero(options.minHostAgentReceipts ?? (options.requireHostAgentReceipts ? 1 : 0));
  const minAgentInvocations = numberOrZero(options.minAgentInvocations ?? 0);
  if (minHostAgentReceipts > 0 && trustedHostAgentReceipts < minHostAgentReceipts) {
    issues.push({
      code: "insufficient-host-agent-receipts",
      file: ".supervibe/artifacts/_workflow-invocations",
      message: `trusted host-agent receipt coverage ${trustedHostAgentReceipts}/${minHostAgentReceipts}; run real host agents and log them with scripts/agent-invocation.mjs --issue-receipt`,
    });
  }
  if (minAgentInvocations > 0 && receiptBoundAgentInvocations < minAgentInvocations) {
    issues.push({
      code: "insufficient-agent-telemetry",
      file: AGENT_INVOCATION_LOG_RELATIVE_PATH,
      message: `receipt-bound agent invocation telemetry ${receiptBoundAgentInvocations}/${minAgentInvocations}; complete real agent stages before claiming maturity`,
    });
  }

  return {
    pass: issues.length === 0,
    checked: receipts.length + expectations.length,
    receipts: receipts.length,
    producerReceipts: receipts.filter(isProducerReceipt).length,
    hostAgentReceipts,
    trustedHostAgentReceipts,
    skillReceipts: receipts.filter(isSkillProducerReceipt).length,
    agentReceipts: trustedHostAgentReceipts,
    agentInvocations: receiptBoundAgentInvocations,
    loggedAgentInvocations: validAgentInvocations,
    expectations: expectations.length,
    issues: dedupeIssues(issues),
  };
}

export function validateScopedAgentProducerReceipts(rootDir = process.cwd(), options = {}) {
  const command = normalizeCommand(options.command);
  const handoffId = normalizeOptional(options.handoffId || options.handoff);
  const workflowRunId = normalizeOptional(options.workflowRunId || options.workflow_run_id);
  const requiredSubjectIds = unique(options.requiredSubjectIds || options.requiredAgentIds || []);
  const requiredSubjectTypes = new Set((options.requiredSubjectTypes || HOST_AGENT_SUBJECT_TYPES).map((item) => String(item).toLowerCase()));
  const stageIds = new Set(unique(options.stageIds || options.stages || []));
  const outputArtifacts = unique(options.outputArtifacts || []).map(normalizeRelPath);
  const receipts = readWorkflowReceipts(rootDir).filter((receipt) => receiptMatchesScope(receipt, {
    command,
    handoffId,
    workflowRunId,
    requiredSubjectIds,
    requiredSubjectTypes,
    stageIds,
    outputArtifacts,
  }));
  const invocationLog = options.agentInvocationLog || readAgentInvocationLog(rootDir);
  const issues = [];
  const trustedHostAgentReceiptIds = new Set();
  const receiptBoundInvocationIds = new Set();
  const trustedSubjects = new Set();
  const scopedSkillReceipts = [];

  for (const receipt of receipts) {
    if (receipt.__invalidJson) {
      issues.push({
        code: "invalid-scoped-agent-producer-receipt",
        file: receipt.__file || "workflow receipt",
        message: `${receipt.__file || "workflow receipt"}: invalid JSON in scoped producer receipt`,
      });
      continue;
    }
    if (!isProducerReceipt(receipt)) continue;
    if (isSkillProducerReceipt(receipt)) scopedSkillReceipts.push(receipt);
    if (isRecoveryReceipt(receipt)) {
      issues.push({
        code: "recovery-receipt-not-producer-proof",
        file: receipt.__file || "workflow receipt",
        message: `${receipt.__file || receipt.receiptId}: recovery/reissue receipt is repair evidence only and cannot satisfy an active producer stage`,
      });
      continue;
    }

    const trust = validateWorkflowReceiptTrust(rootDir, receipt, options);
    for (const message of trust.issues) {
      issues.push({
        code: /artifact link manifest missing|artifact link missing/i.test(message)
          ? "missing-scoped-agent-producer-artifact-link"
          : "untrusted-scoped-agent-producer-receipt",
        file: receipt.__file,
        message: `${receipt.__file}: ${message}`,
      });
    }

    const hostIssues = isHostAgentReceipt(receipt)
      ? validateHostInvocationProof(rootDir, receipt, { ...options, agentInvocationLog: invocationLog })
      : [];
    issues.push(...hostIssues);

    if (receipt.status === "completed" && trust.issues.length === 0 && hostIssues.length === 0) {
      const subjectId = receipt.subjectId || receipt.agentId || receipt.skillId;
      if (subjectId) trustedSubjects.add(subjectId);
      if (isHostAgentReceipt(receipt)) {
        trustedHostAgentReceiptIds.add(receipt.receiptId || receipt.__file);
        const proof = normalizeHostInvocationProof(rootDir, receipt.hostInvocation);
        if (proof?.invocationId) receiptBoundInvocationIds.add(proof.invocationId);
      }
    }
  }

  for (const subjectId of requiredSubjectIds) {
    if (trustedSubjects.has(subjectId)) continue;
    issues.push({
      code: "missing-scoped-agent-producer-receipt",
      file: scopedReceiptFileHint({ command, handoffId, workflowRunId }),
      expectedAgentId: subjectId,
      message: `${subjectId}: missing trusted scoped runtime receipt for ${command || "requested command"}${handoffId ? ` handoff ${handoffId}` : ""}`,
    });
  }
  if (requiredSubjectIds.length > 0 && scopedSkillReceipts.length > 0 && trustedHostAgentReceiptIds.size === 0) {
    issues.push({
      code: "skill-only-required-agent-workflow",
      file: scopedReceiptFileHint({ command, handoffId, workflowRunId }),
      message: `skill-only receipts cannot complete ${command || "active workflow"} when required agent/reviewer/worker subjects are pending: ${requiredSubjectIds.join(", ")}`,
    });
  }

  const minHostAgentReceipts = numberOrZero(options.minHostAgentReceipts ?? (requiredSubjectIds.length || (options.requireHostAgentReceipts ? 1 : 0)));
  const minAgentInvocations = numberOrZero(options.minAgentInvocations ?? (requiredSubjectIds.length || 0));
  if (minHostAgentReceipts > 0 && trustedHostAgentReceiptIds.size < minHostAgentReceipts) {
    issues.push({
      code: "insufficient-scoped-host-agent-receipts",
      file: scopedReceiptFileHint({ command, handoffId, workflowRunId }),
      message: `trusted scoped host-agent receipt coverage ${trustedHostAgentReceiptIds.size}/${minHostAgentReceipts}; run the required host agents for this command/handoff and issue runtime receipts`,
    });
  }
  if (minAgentInvocations > 0 && receiptBoundInvocationIds.size < minAgentInvocations) {
    issues.push({
      code: "insufficient-scoped-agent-telemetry",
      file: AGENT_INVOCATION_LOG_RELATIVE_PATH,
      message: `scoped receipt-bound agent invocation telemetry ${receiptBoundInvocationIds.size}/${minAgentInvocations}; every required agent must have hostInvocation proof for this command/handoff`,
    });
  }

  return {
    pass: issues.length === 0,
    checked: receipts.length + requiredSubjectIds.length,
    receipts: receipts.length,
    producerReceipts: receipts.filter(isProducerReceipt).length,
    hostAgentReceipts: receipts.filter(isHostAgentReceipt).length,
    trustedHostAgentReceipts: trustedHostAgentReceiptIds.size,
    agentReceipts: trustedHostAgentReceiptIds.size,
    agentInvocations: receiptBoundInvocationIds.size,
    loggedAgentInvocations: invocationLog.filter((entry) => !entry.__invalidJson).length,
    minHostAgentReceipts,
    minAgentInvocations,
    requiredSubjects: requiredSubjectIds,
    missingSubjects: requiredSubjectIds.filter((subjectId) => !trustedSubjects.has(subjectId)),
    scope: {
      command,
      handoffId,
      workflowRunId,
      stageIds: [...stageIds],
      outputArtifacts,
    },
    issues: dedupeIssues(issues),
  };
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

export function expectedProducerReceiptsForDurableOutputs(rootDir = process.cwd(), options = {}) {
  const expected = [];
  const prototypeSlug = normalizeOptional(options.prototypeSlug || options.slug);
  const requireDesignReviewStages = options.requireDesignReviewStages === true;
  const designArtifactDirs = listDesignArtifactDirs(rootDir)
    .filter((item) => !prototypeSlug || item.slug === prototypeSlug);
  const activeDesignWorkStarted = designArtifactDirs
    .some((item) => designArtifactWorkStarted(rootDir, item));
  const add = ({ command, outputArtifact, subjectType, subjectId, stageId, required = false }) => {
    if (required || existsSync(join(rootDir, ...outputArtifact.split("/")))) {
      expected.push({ command, outputArtifact, subjectType, subjectId, stageId });
    }
  };

  add({
    command: "/supervibe-design",
    outputArtifact: ".supervibe/artifacts/brandbook/direction.md",
    subjectType: "agent",
    subjectId: "creative-director",
    stageId: "stage-1-brand-direction",
    required: requireDesignReviewStages && activeDesignWorkStarted,
  });
  add({
    command: "/supervibe-design",
    outputArtifact: ".supervibe/artifacts/prototypes/_design-system/tokens.css",
    subjectType: "skill",
    subjectId: "supervibe:brandbook",
    stageId: "stage-2-design-system",
  });
  add({
    command: "/supervibe-design",
    outputArtifact: ".supervibe/artifacts/prototypes/_design-system/manifest.json",
    subjectType: "skill",
    subjectId: "supervibe:brandbook",
    stageId: "stage-2-design-system",
  });
  add({
    command: "/supervibe-design",
    outputArtifact: ".supervibe/artifacts/prototypes/_design-system/design-flow-state.json",
    subjectType: "skill",
    subjectId: "supervibe:brandbook",
    stageId: "stage-2-design-system",
  });
  add({
    command: "/supervibe-design",
    outputArtifact: ".supervibe/artifacts/prototypes/_design-system/styleboard.html",
    subjectType: "skill",
    subjectId: "supervibe:brandbook",
    stageId: "stage-2-design-system",
  });

  for (const designArtifact of designArtifactDirs) {
    const { rootName, slug } = designArtifact;
    const base = `.supervibe/artifacts/${rootName}/${slug}`;
    const workStarted = designArtifactWorkStarted(rootDir, designArtifact);
    const requiredReviewStage = requireDesignReviewStages && workStarted;
    const requiredFoundationStage = requireDesignReviewStages && workStarted;
    const requiredTauriStage = requiredFoundationStage && designArtifactRequiresTauriUi(rootDir, rootName, slug);
    add({ command: "/supervibe-design", outputArtifact: `${base}/spec.md`, subjectType: "agent", subjectId: "ux-ui-designer", stageId: "stage-3-screen-spec", required: requiredFoundationStage });
    if (requiredTauriStage) {
      add({ command: "/supervibe-design", outputArtifact: `${base}/decisions/tauri-ui-review.md`, subjectType: "agent", subjectId: "tauri-ui-designer", stageId: "stage-3-tauri-ui-review", required: true });
    }
    add({ command: "/supervibe-design", outputArtifact: `${base}/decisions/media-capability-detection.md`, subjectType: "skill", subjectId: "supervibe:design-intelligence", stageId: "stage-4-media-capability-detection" });
    add({ command: "/supervibe-design", outputArtifact: `${base}/decisions/prototype-capability-plan.md`, subjectType: "agent", subjectId: "prototype-builder", stageId: "stage-4-prototype-capability-plan" });
    add({ command: "/supervibe-design", outputArtifact: `${base}/decisions/interaction-design-patterns.md`, subjectType: "skill", subjectId: "supervibe:interaction-design-patterns", stageId: "stage-4-interaction-patterns" });
    add({ command: "/supervibe-design", outputArtifact: `${base}/content/copy.md`, subjectType: "agent", subjectId: "copywriter", stageId: "stage-4-copy", required: requiredFoundationStage });
    add({ command: "/supervibe-design", outputArtifact: `${base}/index.html`, subjectType: "agent", subjectId: "prototype-builder", stageId: "stage-5-prototype-build" });
    add({ command: "/supervibe-design", outputArtifact: `${base}/variant-manifest.json`, subjectType: "agent", subjectId: "creative-director", stageId: "stage-1-brand-direction" });
    add({ command: "/supervibe-design", outputArtifact: `${base}/diversity-report.json`, subjectType: "reviewer", subjectId: "ui-polish-reviewer", stageId: "stage-6-polish-review" });
    for (const variant of listVariantArtifacts(rootDir, designArtifact)) {
      add({ command: "/supervibe-design", outputArtifact: variant.artifactPath, subjectType: "agent", subjectId: "prototype-builder", stageId: "stage-5-prototype-build" });
      if (variant.reviewArtifacts?.polish) {
        add({ command: "/supervibe-design", outputArtifact: variant.reviewArtifacts.polish, subjectType: "reviewer", subjectId: "ui-polish-reviewer", stageId: "stage-6-polish-review" });
      }
      if (variant.reviewArtifacts?.a11y) {
        add({ command: "/supervibe-design", outputArtifact: variant.reviewArtifacts.a11y, subjectType: "reviewer", subjectId: "accessibility-reviewer", stageId: "stage-6-a11y-review" });
      }
    }
    add({ command: "/supervibe-design", outputArtifact: `${base}/_reviews/polish.md`, subjectType: "reviewer", subjectId: "ui-polish-reviewer", stageId: "stage-6-polish-review", required: requiredReviewStage });
    add({ command: "/supervibe-design", outputArtifact: `${base}/_reviews/a11y.md`, subjectType: "reviewer", subjectId: "accessibility-reviewer", stageId: "stage-6-a11y-review", required: requiredReviewStage });
    add({ command: "/supervibe-design", outputArtifact: `${base}/_reviews/quality-gate.json`, subjectType: "reviewer", subjectId: "quality-gate-reviewer", stageId: "stage-7-quality-gate", required: requiredReviewStage });
    add({ command: "/supervibe-design", outputArtifact: `${base}/_reviews/seo.md`, subjectType: "reviewer", subjectId: "seo-specialist", stageId: "stage-6-seo-review" });
  }

  return expected;
}

function validateHostTraceFile(rootDir, receipt, proof) {
  const expectedAgentId = receipt.agentId || receipt.subjectId;
  const issues = [];
  if (!proof.evidencePath) {
    return [{
      code: "missing-host-trace-file",
      file: receipt.__file || "workflow receipt",
      message: `${receipt.__file || receipt.receiptId}: host-trace-file proof requires hostInvocation.evidencePath`,
    }];
  }
  const absPath = join(rootDir, ...normalizeRelPath(proof.evidencePath).split("/"));
  if (!existsSync(absPath)) {
    return [{
      code: "missing-host-trace-file",
      file: proof.evidencePath,
      message: `${proof.evidencePath}: host trace file not found`,
    }];
  }
  let trace;
  try {
    trace = JSON.parse(readFileSync(absPath, "utf8"));
  } catch {
    return [{
      code: "invalid-host-trace-file",
      file: proof.evidencePath,
      message: `${proof.evidencePath}: host trace file is not valid JSON`,
    }];
  }
  const traceAgentId = trace.agentId || trace.agent_id || trace.subagent_type || trace.subjectId;
  if (traceAgentId !== expectedAgentId) {
    issues.push({
      code: "host-agent-mismatch",
      file: proof.evidencePath,
      message: `${proof.evidencePath}: host trace agent ${traceAgentId || "missing"} does not match receipt agent ${expectedAgentId}`,
    });
  }
  const status = String(trace.status || trace.outcome || trace.result || "").toLowerCase();
  if (!["completed", "complete", "success", "succeeded", "ok", "passed"].includes(status)) {
    issues.push({
      code: "incomplete-host-agent-invocation",
      file: proof.evidencePath,
      message: `${proof.evidencePath}: host trace status must be completed/success, got ${status || "missing"}`,
    });
  }
  return issues;
}

function normalizeAgentInvocationRecord(record = {}, index = 0) {
  const agentId = record.agent_id || record.agentId || record.subagent_type || record.subjectId;
  const taskSummary = record.task_summary || record.taskSummary || record.description || "";
  const ts = record.ts || record.timestamp || new Date(0).toISOString();
  return {
    ...record,
    invocation_id: record.invocation_id || record.invocationId || createAgentInvocationId({
      agentId,
      taskSummary,
      ts,
      sessionId: record.session_id || record.sessionId || "",
    }),
    agent_id: agentId,
    task_summary: taskSummary,
    ts,
    structured_output: record.structured_output || null,
    __line: index + 1,
  };
}

function receiptMatchesProducerExpectation(receipt = {}, expectation = {}) {
  if (receipt.__invalidJson || receipt.status !== "completed") return false;
  if (isRecoveryReceipt(receipt)) return false;
  if (receipt.command !== expectation.command) return false;
  if (receipt.subjectType !== expectation.subjectType) return false;
  if (receipt.stage !== expectation.stageId) return false;
  const id = receipt.subjectId || receipt.agentId || receipt.skillId;
  if (id !== expectation.subjectId) return false;
  const outputs = Array.isArray(receipt.outputArtifacts) ? receipt.outputArtifacts : [];
  return outputs.some((output) => sameArtifact(output, expectation.outputArtifact));
}

function listDesignArtifactDirs(rootDir) {
  return ["prototypes", "mockups"].flatMap((rootName) => listDesignDirs(rootDir, rootName)
    .map((slug) => ({ rootName, slug })));
}

function designArtifactWorkStarted(rootDir, designArtifact) {
  const rootName = typeof designArtifact === "string" ? "prototypes" : designArtifact.rootName;
  const slug = typeof designArtifact === "string" ? designArtifact : designArtifact.slug;
  const base = join(rootDir, ".supervibe", "artifacts", rootName, slug);
  return existsSync(join(base, "index.html"))
    || existsSync(join(base, "variant-manifest.json"))
    || listVariantArtifacts(rootDir, { rootName, slug }).length > 0;
}

function listDesignDirs(rootDir, rootName) {
  const root = join(rootDir, ".supervibe", "artifacts", rootName);
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("_"))
    .sort();
}

function designArtifactRequiresTauriUi(rootDir, rootName, slug) {
  const configPath = join(rootDir, ".supervibe", "artifacts", rootName, slug, "config.json");
  if (!existsSync(configPath)) return false;
  try {
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    const value = [
      config.target,
      config.platform,
      config.app,
      config.appShell,
      config.shell,
      config.mode,
      slug,
    ].filter(Boolean).join(" ").toLowerCase();
    return /\btauri\b|\bdesktop(?:-app)?\b|electron|native desktop/i.test(value);
  } catch {
    return false;
  }
}

function listVariantArtifacts(rootDir, designArtifact) {
  const rootName = typeof designArtifact === "string" ? "prototypes" : designArtifact.rootName;
  const slug = typeof designArtifact === "string" ? designArtifact : designArtifact.slug;
  const relPath = `.supervibe/artifacts/${rootName}/${slug}/variant-manifest.json`;
  const manifestPath = join(rootDir, ...relPath.split("/"));
  if (!existsSync(manifestPath)) return [];
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    return (Array.isArray(manifest.variants) ? manifest.variants : [])
      .map((variant) => ({
        artifactPath: normalizeRelPath(variant.artifactPath),
        reviewArtifacts: {
          polish: normalizeRelPath(variant.reviewArtifacts?.polish),
          a11y: normalizeRelPath(variant.reviewArtifacts?.a11y),
        },
      }))
      .filter((variant) => variant.artifactPath);
  } catch {
    return [];
  }
}

function sameArtifact(left, right) {
  const a = normalizeRelPath(left);
  const b = normalizeRelPath(right);
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

function normalizeRelPath(path) {
  return String(path ?? "").split(sep).join("/").replace(/^\.\//, "");
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

function receiptMatchesScope(receipt = {}, scope = {}) {
  if (receipt.__invalidJson) return invalidReceiptPathMatchesScope(receipt, scope);
  if (!isProducerReceipt(receipt)) return false;
  if (scope.command && receipt.command !== scope.command) return false;
  if (scope.handoffId && receipt.handoffId !== scope.handoffId) return false;
  if (scope.workflowRunId && receipt.workflowRunId !== scope.workflowRunId && receipt.workflow_run_id !== scope.workflowRunId) return false;
  if (scope.requiredSubjectIds?.length) {
    const subjectId = receipt.subjectId || receipt.agentId || receipt.skillId;
    if (!scope.requiredSubjectIds.includes(subjectId) && !isSkillProducerReceipt(receipt)) return false;
  }
  if (
    scope.requiredSubjectTypes?.size
    && !scope.requiredSubjectTypes.has(String(receipt.subjectType || "").toLowerCase())
    && !(scope.requiredSubjectIds?.length && isSkillProducerReceipt(receipt))
  ) return false;
  if (scope.stageIds?.size && !scope.stageIds.has(receipt.stage)) return false;
  if (scope.outputArtifacts?.length) {
    const outputs = Array.isArray(receipt.outputArtifacts) ? receipt.outputArtifacts : [];
    if (!outputs.some((output) => scope.outputArtifacts.some((artifact) => sameArtifact(output, artifact)))) return false;
  }
  return true;
}

function invalidReceiptPathMatchesScope(receipt = {}, scope = {}) {
  const file = normalizeRelPath(receipt.__file || "");
  if (!file) return false;
  const commandPath = normalizeCommand(scope.command).replace(/^\//, "");
  if (commandPath && !file.includes(`_workflow-invocations/${commandPath}/`)) return false;
  if (scope.handoffId && !file.includes(`/${scope.handoffId}/`)) return false;
  if (scope.workflowRunId && !file.includes(`/${scope.workflowRunId}/`)) return false;
  return true;
}

function scopedReceiptFileHint({ command = "", handoffId = "", workflowRunId = "" } = {}) {
  const commandPath = normalizeCommand(command).replace(/^\//, "") || "workflow";
  if (handoffId) return `.supervibe/artifacts/_workflow-invocations/${commandPath}/${handoffId}`;
  if (workflowRunId) return `.supervibe/artifacts/_workflow-invocations/${commandPath}/${workflowRunId}`;
  return `.supervibe/artifacts/_workflow-invocations/${commandPath}`;
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function dedupeIssues(issues = []) {
  const seen = new Set();
  const out = [];
  for (const issue of issues) {
    const key = `${issue.code}:${issue.file}:${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}
