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
  const issues = [];

  for (const receipt of receipts) {
    if (receipt.__invalidJson) continue;
    if (!isHostAgentReceipt(receipt)) continue;
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
    issues.push(...validateHostInvocationProof(rootDir, receipt, options));
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
        issues.push(...validateHostInvocationProof(rootDir, receipt, options));
      }
    }
  }

  return {
    pass: issues.length === 0,
    checked: receipts.length + expectations.length,
    receipts: receipts.length,
    agentReceipts: receipts.filter(isHostAgentReceipt).length,
    expectations: expectations.length,
    issues: dedupeIssues(issues),
  };
}

export function expectedProducerReceiptsForDurableOutputs(rootDir = process.cwd()) {
  const expected = [];
  const add = ({ command, outputArtifact, subjectType, subjectId, stageId }) => {
    if (existsSync(join(rootDir, ...outputArtifact.split("/")))) {
      expected.push({ command, outputArtifact, subjectType, subjectId, stageId });
    }
  };

  add({
    command: "/supervibe-design",
    outputArtifact: ".supervibe/artifacts/brandbook/direction.md",
    subjectType: "agent",
    subjectId: "creative-director",
    stageId: "stage-1-brand-direction",
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

  for (const prototype of listPrototypeDirs(rootDir)) {
    const base = `.supervibe/artifacts/prototypes/${prototype}`;
    add({ command: "/supervibe-design", outputArtifact: `${base}/spec.md`, subjectType: "agent", subjectId: "ux-ui-designer", stageId: "stage-3-screen-spec" });
    add({ command: "/supervibe-design", outputArtifact: `${base}/content/copy.md`, subjectType: "agent", subjectId: "copywriter", stageId: "stage-4-copy" });
    add({ command: "/supervibe-design", outputArtifact: `${base}/index.html`, subjectType: "agent", subjectId: "prototype-builder", stageId: "stage-5-prototype-build" });
    add({ command: "/supervibe-design", outputArtifact: `${base}/_reviews/polish.md`, subjectType: "reviewer", subjectId: "ui-polish-reviewer", stageId: "stage-6-polish-review" });
    add({ command: "/supervibe-design", outputArtifact: `${base}/_reviews/a11y.md`, subjectType: "reviewer", subjectId: "accessibility-reviewer", stageId: "stage-6-a11y-review" });
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
    __line: index + 1,
  };
}

function receiptMatchesProducerExpectation(receipt = {}, expectation = {}) {
  if (receipt.__invalidJson || receipt.status !== "completed") return false;
  if (receipt.command !== expectation.command) return false;
  if (receipt.subjectType !== expectation.subjectType) return false;
  const id = receipt.subjectId || receipt.agentId || receipt.skillId;
  if (id !== expectation.subjectId) return false;
  const outputs = Array.isArray(receipt.outputArtifacts) ? receipt.outputArtifacts : [];
  return outputs.some((output) => sameArtifact(output, expectation.outputArtifact));
}

function listPrototypeDirs(rootDir) {
  const root = join(rootDir, ".supervibe", "artifacts", "prototypes");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("_"))
    .sort();
}

function sameArtifact(left, right) {
  const a = normalizeRelPath(left);
  const b = normalizeRelPath(right);
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

function normalizeRelPath(path) {
  return String(path ?? "").split(sep).join("/").replace(/^\.\//, "");
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
