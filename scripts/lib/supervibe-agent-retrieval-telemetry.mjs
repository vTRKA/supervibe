import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { readInvocations } from "./agent-invocation-logger.mjs";
import { auditEvidenceLedger, createEvidenceRecord } from "./supervibe-evidence-ledger.mjs";
import { decideRetrievalPolicy } from "./supervibe-retrieval-decision-policy.mjs";
import {
  readWorkflowReceipts,
  validateWorkflowReceiptTrust,
} from "./supervibe-workflow-receipt-runtime.mjs";
import { detectUnderperformers } from "./underperformer-detector.mjs";

const DEFAULT_THRESHOLDS = Object.freeze({
  minSample: 5,
  memoryRate: 0.5,
  ragRate: 0.6,
  codegraphRateForStructural: 0.7,
  evidencePassRate: 0.85,
  confidence: 8.5,
});

const STRUCTURAL_TASK_PATTERN = /(refactor|rename|move|delete|extract|caller|callee|impact|public api|dependency impact|architecture review)/i;
const HOST_AGENT_SUBJECT_TYPES = new Set(["agent", "worker", "reviewer"]);
const MEMORY_EVIDENCE_PATTERN = /^\.supervibe[\\/]+memory[\\/]/i;
const RAG_EVIDENCE_PATTERN = /^(?:AGENTS\.md|README\.md|CHANGELOG\.md|package\.json|registry\.yaml|agents[\\/]|skills[\\/]|rules[\\/]|commands[\\/]|scripts[\\/]|tests[\\/]|docs[\\/]|confidence-rubrics[\\/]|templates[\\/]|stack-packs[\\/]|bin[\\/]|\.claude-plugin[\\/]|\.codex-plugin[\\/]|\.cursor-plugin[\\/]|gemini-extension\.json)/i;
const CODEGRAPH_CONTEXT_PATTERN = /(codegraph|code graph|caller|callee|neighbor|impact|refactor|rename|move|delete|extract|public api|dependency impact)/i;

export function evaluateAgentOutputEvidenceContract({
  taskText = "",
  outputText = "",
  subtoolUsage = {},
  evidence = {},
  retrievalPolicy = null,
} = {}) {
  const evidenceFlags = {
    memory: Boolean(evidence.memoryIds?.length),
    rag: Boolean(evidence.ragChunkIds?.length),
    codegraph: Boolean(evidence.graphSymbols?.length),
  };
  const policy = retrievalPolicy || decideRetrievalPolicy({
    taskText,
    evidence: evidenceFlags,
  });
  const text = String(outputText || "");
  const required = policy.required || [];
  const failures = [];
  const warnings = [];
  const citations = {
    memory: evidenceFlags.memory || hasMemoryCitation(text),
    rag: evidenceFlags.rag || hasRagCitation(text),
    codegraph: evidenceFlags.codegraph || hasCodeGraphCitation(text),
  };
  const usage = normalizeSubtoolUsage(subtoolUsage);
  for (const source of required) {
    if (citations[source] || hasNoEvidenceBypass(text, source)) continue;
    failures.push(`required ${source} evidence citation missing`);
  }
  for (const source of ["memory", "rag", "codegraph"]) {
    if ((usage[source] || 0) > 0 && !citations[source]) {
      warnings.push(`${source} was used but not cited in output`);
    }
  }
  return {
    pass: failures.length === 0,
    score: failures.length === 0 ? 10 : Math.max(0, 10 - failures.length * 2),
    required,
    citations,
    failures,
    warnings,
    retrievalMode: policy.mode,
    skipReason: policy.skipReason || "",
  };
}

export async function buildAgentRetrievalTelemetryReportFromProject({
  rootDir = process.cwd(),
  limit = 1000,
  window = 20,
  thresholds = {},
} = {}) {
  const invocations = await readInvocations({ limit });
  const evidenceLedger = await auditEvidenceLedger({ rootDir });
  const receiptEvidence = collectTrustedReceiptEvidence({ rootDir, invocations });
  return buildAgentRetrievalTelemetryReport({
    invocations: enrichInvocationsWithEvidence({
      invocations,
      receiptEvidenceByInvocationId: receiptEvidence.byInvocationId,
      evidenceEntries: evidenceLedger.entries || [],
    }),
    evidenceEntries: [
      ...(evidenceLedger.entries || []),
      ...receiptEvidence.entries,
    ],
    window,
    thresholds,
  });
}

export function buildAgentRetrievalTelemetryReport({
  invocations = [],
  evidenceEntries = [],
  window = 20,
  thresholds = {},
} = {}) {
  const policy = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const scoredInvocations = invocations.filter(isRetrievalTelemetryScoredInvocation);
  const legacySkipped = invocations.length - scoredInvocations.length;
  const byAgent = groupByAgent(scoredInvocations);
  const agents = [];
  for (const [agentId, entries] of Object.entries(byAgent)) {
    const recent = entries
      .slice()
      .sort((a, b) => Date.parse(a.ts || "") - Date.parse(b.ts || ""))
      .slice(-window);
    const sample = recent.length;
    if (!sample) continue;
    const structuralSample = recent.filter((entry) => STRUCTURAL_TASK_PATTERN.test(entry.task_summary || "")).length;
    const evidenceContracts = recent.map((entry) => entry.evidence_contract).filter(Boolean);
    const evidenceGates = recent.map((entry) => entry.evidence_gate).filter(Boolean);
    const avgConfidence = average(recent.map((entry) => Number(entry.confidence_score || 0)));
    const metrics = {
      sample,
      structuralSample,
      memoryRate: sourceSatisfactionRate(recent, "memory"),
      ragRate: sourceSatisfactionRate(recent, "rag"),
      codegraphRate: sourceSatisfactionRate(recent, "codegraph"),
      evidenceContractPassRate: evidenceContracts.length ? rate(evidenceContracts, (item) => item.pass) : null,
      evidenceGatePassRate: evidenceGates.length ? rate(evidenceGates, (item) => item.pass) : null,
      avgConfidence: Number(avgConfidence.toFixed(2)),
    };
    const violations = detectRetrievalViolations(agentId, metrics, policy);
    agents.push({
      agentId,
      ...metrics,
      violations,
      recommendedActions: buildRecommendedActions(agentId, violations),
    });
  }
  const underperformers = detectUnderperformers(scoredInvocations, {
    minInvocations: policy.minSample,
    confidenceThreshold: policy.confidence,
  });
  const evidenceFailed = evidenceEntries.filter((entry) => entry.gate && !entry.gate.pass);
  const failingAgents = agents.filter((agent) => agent.violations.length > 0);
  const globalViolations = detectGlobalRetrievalTelemetryViolations({
    invocations: scoredInvocations,
    agents,
    evidenceEntries,
    thresholds: policy,
  });
  const globalWarnings = detectGlobalRetrievalTelemetryWarnings({
    rawInvocations: invocations,
    scoredInvocations,
    legacySkipped,
  });
  const strengtheningTasks = createStrengtheningTasks({ agents: failingAgents, underperformers, evidenceFailed });
  const pass = globalViolations.length === 0 && failingAgents.length === 0 && evidenceFailed.length === 0;
  const maturityScore = pass
    ? globalWarnings.length
      ? 8
      : 10
    : Math.max(0, 10 - Math.min(6, globalViolations.length + failingAgents.length + evidenceFailed.length));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    pass,
    maturityScore,
    thresholds: policy,
    summary: {
      agents: agents.length,
      invocations: scoredInvocations.length,
      rawInvocations: invocations.length,
      legacySkipped,
      evidenceEntries: evidenceEntries.length,
      globalViolations: globalViolations.length,
      failingAgents: failingAgents.length,
      evidenceFailed: evidenceFailed.length,
      strengtheningTasks: strengtheningTasks.length,
    },
    globalViolations,
    globalWarnings,
    sampleStatus: scoredInvocations.length
      ? "scored-samples"
      : legacySkipped
        ? "ready-no-post-enforcement-samples"
        : "ready-no-samples",
    agents: agents.sort((a, b) => a.agentId.localeCompare(b.agentId)),
    underperformers,
    evidenceFailed,
    strengtheningTasks,
  };
}

function createStrengtheningTasks({ agents = [], underperformers = [], evidenceFailed = [] } = {}) {
  const tasks = [];
  for (const agent of agents) {
    tasks.push({
      id: `strengthen-${agent.agentId}-retrieval`,
      agentId: agent.agentId,
      reason: agent.violations.join("; "),
      action: "run /supervibe-strengthen with explicit project-memory, code-search, evidence citation, and codegraph requirements",
      priority: agent.violations.some((item) => item.includes("codegraph") || item.includes("evidence")) ? "high" : "medium",
    });
  }
  for (const item of underperformers) {
    if (tasks.some((task) => task.agentId === item.agent_id)) continue;
    tasks.push({
      id: `strengthen-${item.agent_id}-confidence`,
      agentId: item.agent_id,
      reason: `${item.reason}: ${item.value}`,
      action: "run /supervibe-strengthen and inspect recent low-confidence outcomes",
      priority: "medium",
    });
  }
  for (const entry of evidenceFailed) {
    tasks.push({
      id: `repair-evidence-${slug(entry.taskId || entry.agentId || "unknown")}`,
      agentId: entry.agentId || entry.agent_id || "unknown",
      reason: entry.gate?.failures?.join("; ") || "evidence gate failed",
      action: "attach retrieval evidence or record an explicit no-evidence bypass",
      priority: "high",
    });
  }
  return tasks.slice(0, 50);
}

export async function writeStrengtheningTasks(report, {
  rootDir = process.cwd(),
  outPath = join(rootDir, ".supervibe", "memory", "strengthening-tasks.json"),
} = {}) {
  const payload = {
    schemaVersion: 1,
    generatedAt: report.generatedAt || new Date().toISOString(),
    tasks: report.strengtheningTasks || [],
  };
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { outPath, count: payload.tasks.length };
}

export function formatAgentRetrievalTelemetryReport(report = {}) {
  const lines = [
    "SUPERVIBE_AGENT_RETRIEVAL_TELEMETRY",
    `PASS: ${Boolean(report.pass)}`,
    `MATURITY_SCORE: ${report.maturityScore ?? 0}/10`,
    `AGENTS: ${report.summary?.agents || 0}`,
    `INVOCATIONS: ${report.summary?.invocations || 0}`,
    `RAW_INVOCATIONS: ${report.summary?.rawInvocations ?? report.summary?.invocations ?? 0}`,
    `LEGACY_SKIPPED: ${report.summary?.legacySkipped || 0}`,
    `SAMPLE_STATUS: ${report.sampleStatus || "unknown"}`,
    `GLOBAL_VIOLATIONS: ${report.summary?.globalViolations || 0}`,
    `FAILING_AGENTS: ${report.summary?.failingAgents || 0}`,
    `EVIDENCE_FAILED: ${report.summary?.evidenceFailed || 0}`,
    `STRENGTHENING_TASKS: ${report.summary?.strengtheningTasks || 0}`,
  ];
  for (const violation of report.globalViolations || []) {
    lines.push(`WARN: ${violation}`);
  }
  for (const warning of report.globalWarnings || []) {
    lines.push(`WARN: ${warning}`);
  }
  for (const agent of report.agents || []) {
    const status = agent.violations?.length ? "WARN" : "OK";
    lines.push(`${status}: ${agent.agentId} sample=${agent.sample} mem=${pct(agent.memoryRate)} rag=${pct(agent.ragRate)} graph=${pct(agent.codegraphRate)} evidence=${pct(agent.evidenceContractPassRate)} confidence=${agent.avgConfidence}`);
    for (const violation of agent.violations || []) lines.push(`  - ${violation}`);
  }
  for (const task of report.strengtheningTasks || []) {
    lines.push(`TASK: ${task.id} agent=${task.agentId} priority=${task.priority} reason=${task.reason}`);
  }
  return lines.join("\n");
}

export function isStrictAgentRetrievalTelemetryPass(report = {}) {
  return report.pass === true && Number(report.maturityScore || 0) >= 10;
}

function detectGlobalRetrievalTelemetryViolations({
  invocations = [],
  agents = [],
  evidenceEntries = [],
  thresholds,
} = {}) {
  const violations = [];
  if (invocations.length < thresholds.minSample) {
    if (invocations.length === 0) return violations;
    violations.push(`insufficient invocation sample ${invocations.length} < ${thresholds.minSample}`);
  }
  if (invocations.length > 0 && agents.length > 0 && agents.every((agent) => agent.sample < thresholds.minSample)) {
    if (!hasPortfolioEvidencePass({ invocations, evidenceEntries, thresholds })) {
      violations.push(`no agent has enough retrieval samples for a trusted health score; need at least ${thresholds.minSample} per evaluated agent or a receipt-backed distributed evidence portfolio`);
    }
  }
  if (invocations.length >= thresholds.minSample && evidenceEntries.length === 0) {
    violations.push("missing evidence ledger entries for retrieval quality scoring");
  }
  return violations;
}

function detectGlobalRetrievalTelemetryWarnings({
  rawInvocations = [],
  scoredInvocations = [],
  legacySkipped = 0,
} = {}) {
  const warnings = [];
  if (rawInvocations.length > 0 && scoredInvocations.length === 0 && legacySkipped > 0) {
    warnings.push("post-enforcement retrieval telemetry samples are not available yet; readiness is green, but maturity score is capped until new scored agent invocations exist");
  }
  return warnings;
}

function isRetrievalTelemetryScoredInvocation(entry = {}) {
  const usage = normalizeSubtoolUsage(entry.subtool_usage);
  if (usage.memory > 0 || usage.rag > 0 || usage.codegraph > 0) return true;
  if (hasProvidedRetrievalEnforcement(entry.retrieval_enforcement)) return true;
  if (entry.evidence_gate || entry.evidence_contract) return true;
  if (hasProvidedRetrievalPolicy(entry.retrievalPolicy || entry.retrieval_policy)) return true;
  return false;
}

function collectTrustedReceiptEvidence({ rootDir = process.cwd(), invocations = [] } = {}) {
  const invocationIds = new Set(invocations.map((entry) => entry.invocation_id || entry.invocationId).filter(Boolean));
  const byInvocationId = new Map();
  const entries = [];
  for (const receipt of readWorkflowReceipts(rootDir)) {
    if (receipt.__invalidJson) continue;
    if (!HOST_AGENT_SUBJECT_TYPES.has(String(receipt.subjectType || "").toLowerCase())) continue;
    if (receipt.status !== "completed") continue;
    const invocationId = receipt.hostInvocation?.invocationId || receipt.hostInvocation?.invocation_id;
    if (!invocationId || !invocationIds.has(invocationId)) continue;
    const trust = validateWorkflowReceiptTrust(rootDir, receipt);
    if (!trust.pass) continue;
    const evidence = createEvidenceRecord(buildReceiptEvidenceRecord(receipt));
    const enrichedEvidence = {
      ...evidence,
      source: "trusted-workflow-receipt",
      receiptId: receipt.receiptId || null,
      receiptPath: receipt.__file || null,
    };
    entries.push(enrichedEvidence);
    const current = byInvocationId.get(invocationId);
    if (!current || scoreReceiptEvidence(enrichedEvidence) > scoreReceiptEvidence(current.evidence)) {
      byInvocationId.set(invocationId, { receipt, evidence: enrichedEvidence });
    }
  }
  return { byInvocationId, entries };
}

function enrichInvocationsWithEvidence({
  invocations = [],
  receiptEvidenceByInvocationId = new Map(),
  evidenceEntries = [],
} = {}) {
  const ledgerEvidenceByInvocationKey = collectLedgerEvidenceByInvocationKey(evidenceEntries);
  return invocations.map((entry) => {
    const invocationId = entry.invocation_id || entry.invocationId;
    const receiptMatch = receiptEvidenceByInvocationId.get(invocationId);
    const ledgerMatch = ledgerEvidenceByInvocationKey.get(invocationEvidenceKey(entry));
    let enriched = entry;
    if (ledgerMatch && hasRetrievalEvidence(ledgerMatch)) {
      enriched = mergeInvocationEvidence(enriched, ledgerMatch, {
        evidenceLedger: "evidence-ledger",
        ledgerTaskId: ledgerMatch.taskId || null,
      });
    }
    if (receiptMatch && hasRetrievalEvidence(receiptMatch.evidence)) {
      enriched = mergeInvocationEvidence(enriched, receiptMatch.evidence, {
        evidenceLedger: "trusted-workflow-receipt",
        receiptId: receiptMatch.receipt.receiptId || null,
        receiptPath: receiptMatch.receipt.__file || null,
      });
    }
    return enriched;
  });
}

function collectLedgerEvidenceByInvocationKey(evidenceEntries = []) {
  const out = new Map();
  for (const entry of evidenceEntries || []) {
    const key = invocationEvidenceKey({
      agent_id: entry.agentId || entry.agent_id,
      task_summary: entry.taskId || entry.task_id,
    });
    if (!key) continue;
    const current = out.get(key);
    const normalized = createEvidenceRecord(entry);
    if (!current || scoreReceiptEvidence(normalized) > scoreReceiptEvidence(current)) {
      out.set(key, normalized);
    }
  }
  return out;
}

function mergeInvocationEvidence(entry = {}, evidence = {}, enforcement = {}) {
  const existingEnforcement = entry.retrieval_enforcement || {};
  const existingGate = entry.evidence_gate || entry.evidence_contract || null;
  const evidenceGate = evidence.gate || null;
  return {
    ...entry,
    subtool_usage: mergeSubtoolUsage(entry.subtool_usage, {
      memory: evidence.memoryIds?.length ? 1 : 0,
      rag: evidence.ragChunkIds?.length ? 1 : 0,
      codegraph: evidence.graphSymbols?.length ? 1 : 0,
    }),
    retrieval_policy: mergeRetrievalPolicy(entry.retrievalPolicy || entry.retrieval_policy, evidence.retrievalPolicy),
    evidence_contract: chooseBestGate(existingGate, evidenceGate),
    evidence_gate: chooseBestGate(entry.evidence_gate, evidenceGate),
    retrieval_enforcement: {
      ...existingEnforcement,
      schemaVersion: existingEnforcement.schemaVersion || existingEnforcement.version || 1,
      ...enforcement,
    },
  };
}

function buildReceiptEvidenceRecord(receipt = {}) {
  const inputEvidence = normalizeReceiptEvidencePaths(receipt.inputEvidence || []);
  const memoryIds = inputEvidence.filter((path) => MEMORY_EVIDENCE_PATTERN.test(path));
  const ragChunkIds = inputEvidence.filter((path) => RAG_EVIDENCE_PATTERN.test(path)).map(toRagChunkId);
  const hasCodeGraphContext = CODEGRAPH_CONTEXT_PATTERN.test([
    receipt.stage,
    receipt.invocationReason,
    receipt.subjectId,
  ].filter(Boolean).join(" "));
  return {
    taskId: receipt.stage || receipt.receiptId || "workflow-receipt",
    agentId: receipt.agentId || receipt.subjectId || "unknown",
    invocationId: receipt.hostInvocation?.invocationId || null,
    retrievalPolicy: {
      memory: memoryIds.length ? "mandatory" : "optional",
      rag: ragChunkIds.length ? "mandatory" : "optional",
      codegraph: "optional",
      reason: "trusted workflow receipt inputEvidence for legacy host-agent invocation",
    },
    memoryIds,
    ragChunkIds,
    graphSymbols: hasCodeGraphContext ? [`receipt:${receipt.stage || receipt.receiptId || "workflow"}`] : [],
    citations: inputEvidence.map((path) => ({
      id: path,
      source: "workflow-receipt-input",
      path,
    })),
    verificationCommands: ["node scripts/validate-agent-producer-receipts.mjs --strict-host-agents --min-agent-invocations 10"],
    redactionStatus: "not-needed",
  };
}

function hasProvidedRetrievalEnforcement(enforcement = {}) {
  if (!enforcement || typeof enforcement !== "object") return false;
  if (!(enforcement.schemaVersion || enforcement.version)) return false;
  if (String(enforcement.evidenceLedger || "").toLowerCase() === "not-provided") return false;
  if (enforcement.evidencePass === false) return false;
  return Boolean(
    enforcement.evidenceLedger
    || enforcement.ledgerPath
    || enforcement.receiptId
    || enforcement.receiptPath
  );
}

function hasProvidedRetrievalPolicy(policy = {}) {
  if (!policy || typeof policy !== "object") return false;
  if (Array.isArray(policy.required) && policy.required.length) return true;
  const nested = policy.policy && typeof policy.policy === "object" ? policy.policy : {};
  const hasMandatorySource = ["memory", "rag", "codegraph"].some((source) => (
    isMandatoryPolicyValue(policy[source])
    || isMandatoryPolicyValue(policy.sources?.[source])
    || isMandatoryPolicyValue(nested[source])
    || isMandatoryPolicyValue(nested.sources?.[source])
  ));
  if (hasMandatorySource) return true;
  if (policy.provided === false) return false;
  if (policy.provided === true) return true;
  if (hasExplicitSourcePolicy(policy) || hasExplicitSourcePolicy(nested)) return true;
  return false;
}

function hasExplicitSourcePolicy(policy = {}) {
  return ["memory", "rag", "codegraph"].some((source) => (
    policy[source] !== undefined
    || policy.sources?.[source] !== undefined
  ));
}

function sourceSatisfactionRate(entries = [], source) {
  const evaluated = entries.filter((entry) => shouldEvaluateSource(entry, source));
  if (!evaluated.length) return 1;
  return rate(evaluated, (entry) => sourceSatisfied(entry, source));
}

function sourceSatisfied(entry = {}, source) {
  if (normalizeSubtoolUsage(entry.subtool_usage)[source] > 0) return true;
  const evidence = entry.evidence || {};
  if (source === "memory" && evidence.memoryIds?.length) return true;
  if (source === "rag" && evidence.ragChunkIds?.length) return true;
  if (source === "codegraph" && evidence.graphSymbols?.length) return true;
  return false;
}

function shouldEvaluateSource(entry = {}, source) {
  const usage = normalizeSubtoolUsage(entry.subtool_usage);
  if (usage[source] > 0) return true;
  const policy = entry.retrievalPolicy || entry.retrieval_policy || {};
  if (Array.isArray(policy.required) && policy.required.includes(source)) return true;
  if (isMandatoryPolicyValue(policy[source]) || isMandatoryPolicyValue(policy.sources?.[source])) return true;
  const nested = policy.policy && typeof policy.policy === "object" ? policy.policy : {};
  if (Array.isArray(nested.required) && nested.required.includes(source)) return true;
  if (isMandatoryPolicyValue(nested[source]) || isMandatoryPolicyValue(nested.sources?.[source])) return true;
  if (source === "codegraph" && STRUCTURAL_TASK_PATTERN.test(entry.task_summary || "")) return true;
  return !hasProvidedRetrievalPolicy(policy);
}

function isMandatoryPolicyValue(value) {
  return /^(mandatory|required|true)$/i.test(String(value || ""));
}

function invocationEvidenceKey(entry = {}) {
  const agentId = entry.agent_id || entry.agentId;
  const taskSummary = entry.task_summary || entry.taskSummary;
  if (!agentId || !taskSummary) return "";
  return `${slug(agentId)}::${slug(taskSummary)}`;
}

function mergeRetrievalPolicy(existing = {}, addition = {}) {
  const current = existing && typeof existing === "object" ? existing : {};
  const extra = addition && typeof addition === "object" ? addition : {};
  return {
    ...current,
    ...extra,
    memory: strongestPolicyValue(current.memory || current.sources?.memory, extra.memory || extra.sources?.memory),
    rag: strongestPolicyValue(current.rag || current.sources?.rag, extra.rag || extra.sources?.rag),
    codegraph: strongestPolicyValue(current.codegraph || current.sources?.codegraph, extra.codegraph || extra.sources?.codegraph),
    reason: extra.reason || current.reason || "retrieval evidence merged from trusted runtime artifacts",
  };
}

function strongestPolicyValue(left, right) {
  if (isMandatoryPolicyValue(left) || isMandatoryPolicyValue(right)) return "mandatory";
  if (left || right) return String(right || left);
  return "optional";
}

function chooseBestGate(left, right) {
  if (!left) return right || null;
  if (!right) return left;
  return Number(right.score || 0) >= Number(left.score || 0) ? right : left;
}

function hasPortfolioEvidencePass({ invocations = [], evidenceEntries = [], thresholds = DEFAULT_THRESHOLDS } = {}) {
  const contractPassRate = rate(invocations.map((entry) => entry.evidence_contract).filter(Boolean), (item) => item.pass);
  const gatePassRate = rate(invocations.map((entry) => entry.evidence_gate).filter(Boolean), (item) => item.pass);
  const ledgerPassRate = rate(evidenceEntries.map((entry) => entry.gate).filter(Boolean), (item) => item.pass);
  const enoughEvidence = evidenceEntries.length >= Math.min(invocations.length, thresholds.minSample);
  return enoughEvidence
    && Math.max(contractPassRate, gatePassRate, ledgerPassRate) >= thresholds.evidencePassRate;
}

function normalizeReceiptEvidencePaths(paths = []) {
  return unique(paths).map((path) => String(path).replace(/\\/g, "/").replace(/^\.\//, ""));
}

function toRagChunkId(path) {
  return /:\d+(?:-\d+)?$/.test(path) ? path : `${path}:1`;
}

function mergeSubtoolUsage(existing = {}, addition = {}) {
  const normalized = normalizeSubtoolUsage(existing);
  return {
    ...existing,
    memory: Math.max(normalized.memory, Number(addition.memory || 0)),
    rag: Math.max(normalized.rag, Number(addition.rag || 0)),
    codegraph: Math.max(normalized.codegraph, Number(addition.codegraph || 0)),
  };
}

function scoreReceiptEvidence(evidence = {}) {
  return Number(evidence.gate?.score || 0)
    + Number(evidence.memoryIds?.length || 0)
    + Number(evidence.ragChunkIds?.length || 0)
    + Number(evidence.graphSymbols?.length || 0);
}

function hasRetrievalEvidence(evidence = {}) {
  return Boolean(
    evidence.memoryIds?.length
    || evidence.ragChunkIds?.length
    || evidence.graphSymbols?.length
  );
}

function detectRetrievalViolations(agentId, metrics, thresholds) {
  const violations = [];
  if (metrics.sample < thresholds.minSample) return violations;
  if (metrics.memoryRate < thresholds.memoryRate) violations.push(`low memory retrieval rate ${pct(metrics.memoryRate)} < ${pct(thresholds.memoryRate)}`);
  if (metrics.ragRate < thresholds.ragRate) violations.push(`low RAG retrieval rate ${pct(metrics.ragRate)} < ${pct(thresholds.ragRate)}`);
  if (metrics.structuralSample > 0 && metrics.codegraphRate < thresholds.codegraphRateForStructural) {
    violations.push(`low structural CodeGraph rate ${pct(metrics.codegraphRate)} < ${pct(thresholds.codegraphRateForStructural)}`);
  }
  if (metrics.evidenceContractPassRate !== null && metrics.evidenceContractPassRate < thresholds.evidencePassRate) {
    violations.push(`low evidence contract pass rate ${pct(metrics.evidenceContractPassRate)} < ${pct(thresholds.evidencePassRate)}`);
  }
  if (metrics.evidenceGatePassRate !== null && metrics.evidenceGatePassRate < thresholds.evidencePassRate) {
    violations.push(`low evidence ledger pass rate ${pct(metrics.evidenceGatePassRate)} < ${pct(thresholds.evidencePassRate)}`);
  }
  if (metrics.avgConfidence > 0 && metrics.avgConfidence < thresholds.confidence) {
    violations.push(`low confidence ${metrics.avgConfidence} < ${thresholds.confidence}`);
  }
  return violations;
}

function buildRecommendedActions(agentId, violations = []) {
  return violations.map((violation) => ({
    agentId,
    violation,
    command: `/supervibe-strengthen ${agentId}`,
  }));
}

function groupByAgent(invocations = []) {
  const out = {};
  for (const entry of invocations) {
    const agentId = entry.agent_id || entry.agentId;
    if (!agentId) continue;
    if (!out[agentId]) out[agentId] = [];
    out[agentId].push(entry);
  }
  return out;
}

function normalizeSubtoolUsage(usage = {}) {
  return {
    memory: Number(usage.memory || 0),
    rag: Number(usage["code-search"] || usage.rag || 0),
    codegraph: Number(usage["code-graph"] || usage.codegraph || 0),
  };
}

function rate(items, predicate) {
  if (!items.length) return 0;
  return items.filter(predicate).length / items.length;
}

function average(values = []) {
  const numeric = values.filter((value) => Number.isFinite(value));
  return numeric.length ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length : 0;
}

function pct(value) {
  if (value === null || value === undefined) return "n/a";
  return `${Math.round(Number(value) * 100)}%`;
}

function hasMemoryCitation(text) {
  return /(memory ids?|project memory|search-memory\.mjs|\.supervibe[\\/]+memory|Freshness:)/i.test(text);
}

function hasRagCitation(text) {
  return /(rag chunks?|Code RAG|search-code\.mjs|[\w./-]+\.(?:mjs|js|ts|tsx|jsx|md|rs|py):\d+)/i.test(text);
}

function hasCodeGraphCitation(text) {
  return /(codegraph|code graph|graph symbols?|--callers|--callees|--neighbors|impact radius|Graph Quality Gates)/i.test(text);
}

function hasNoEvidenceBypass(text, source) {
  const generic = /(retrieval|search|rag|codegraph|memory).{0,40}(returned|gave|found).{0,20}no (evidence|matches|results)|no prior memory|No matches/i;
  return generic.test(text) || new RegExp(`${source}.{0,30}no (evidence|matches|results)`, "i").test(text);
}

function slug(value = "") {
  return String(value || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "unknown";
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))];
}
