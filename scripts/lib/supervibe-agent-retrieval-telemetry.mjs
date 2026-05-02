import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { readInvocations } from "./agent-invocation-logger.mjs";
import { auditEvidenceLedger } from "./supervibe-evidence-ledger.mjs";
import { decideRetrievalPolicy } from "./supervibe-retrieval-decision-policy.mjs";
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
  for (const source of required) {
    if (citations[source] || hasNoEvidenceBypass(text, source)) continue;
    failures.push(`required ${source} evidence citation missing`);
  }
  for (const source of ["memory", "rag", "codegraph"]) {
    if ((subtoolUsage[source] || 0) > 0 && !citations[source]) {
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
  return buildAgentRetrievalTelemetryReport({
    invocations,
    evidenceEntries: evidenceLedger.entries || [],
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
  const byAgent = groupByAgent(invocations);
  const agents = [];
  for (const [agentId, entries] of Object.entries(byAgent)) {
    const recent = entries
      .slice()
      .sort((a, b) => Date.parse(a.ts || "") - Date.parse(b.ts || ""))
      .slice(-window);
    const sample = recent.length;
    if (!sample) continue;
    const structuralSample = recent.filter((entry) => STRUCTURAL_TASK_PATTERN.test(entry.task_summary || "")).length;
    const subtool = recent.map((entry) => normalizeSubtoolUsage(entry.subtool_usage));
    const evidenceContracts = recent.map((entry) => entry.evidence_contract).filter(Boolean);
    const evidenceGates = recent.map((entry) => entry.evidence_gate).filter(Boolean);
    const avgConfidence = average(recent.map((entry) => Number(entry.confidence_score || 0)));
    const metrics = {
      sample,
      structuralSample,
      memoryRate: rate(subtool, (usage) => usage.memory > 0),
      ragRate: rate(subtool, (usage) => usage.rag > 0),
      codegraphRate: rate(subtool, (usage) => usage.codegraph > 0),
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
  const underperformers = detectUnderperformers(invocations, {
    minInvocations: policy.minSample,
    confidenceThreshold: policy.confidence,
  });
  const evidenceFailed = evidenceEntries.filter((entry) => entry.gate && !entry.gate.pass);
  const failingAgents = agents.filter((agent) => agent.violations.length > 0);
  const strengtheningTasks = createStrengtheningTasks({ agents: failingAgents, underperformers, evidenceFailed });
  const pass = failingAgents.length === 0 && evidenceFailed.length === 0;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    pass,
    maturityScore: pass ? 10 : Math.max(0, 10 - Math.min(6, failingAgents.length + evidenceFailed.length)),
    thresholds: policy,
    summary: {
      agents: agents.length,
      invocations: invocations.length,
      evidenceEntries: evidenceEntries.length,
      failingAgents: failingAgents.length,
      evidenceFailed: evidenceFailed.length,
      strengtheningTasks: strengtheningTasks.length,
    },
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
    `FAILING_AGENTS: ${report.summary?.failingAgents || 0}`,
    `EVIDENCE_FAILED: ${report.summary?.evidenceFailed || 0}`,
    `STRENGTHENING_TASKS: ${report.summary?.strengtheningTasks || 0}`,
  ];
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
