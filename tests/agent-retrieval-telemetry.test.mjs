import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAgentRetrievalTelemetryReport,
  evaluateAgentOutputEvidenceContract,
  isStrictAgentRetrievalTelemetryPass,
} from "../scripts/lib/supervibe-agent-retrieval-telemetry.mjs";

test("agent output evidence contract requires citations for non-trivial retrieval", () => {
  const failing = evaluateAgentOutputEvidenceContract({
    taskText: "refactor callers of checkout service",
    outputText: "I changed the service.",
    subtoolUsage: { memory: 1, "code-search": 1, "code-graph": 1 },
  });
  assert.equal(failing.pass, false);
  assert.ok(failing.failures.some((item) => item.includes("codegraph")));

  const passing = evaluateAgentOutputEvidenceContract({
    taskText: "refactor callers of checkout service",
    outputText: [
      "Memory IDs: checkout-service-decision.",
      "RAG: scripts/checkout.mjs:12.",
      "CodeGraph: --callers checkoutService returned graph symbols checkoutService.",
    ].join("\n"),
    subtoolUsage: { memory: 1, "code-search": 1, "code-graph": 1 },
  });
  assert.equal(passing.pass, true);
  assert.equal(passing.score, 10);
});

test("agent output evidence contract warns when aliased retrieval tools are uncited", () => {
  const result = evaluateAgentOutputEvidenceContract({
    taskText: "audit current command flow",
    outputText: "I checked it.",
    subtoolUsage: { memory: 1, "code-search": 1, "code-graph": 1 },
  });

  assert.equal(result.pass, true);
  assert.ok(result.warnings.some((item) => item.includes("memory was used")));
  assert.ok(result.warnings.some((item) => item.includes("rag was used")));
  assert.ok(result.warnings.some((item) => item.includes("codegraph was used")));
});

test("agent retrieval telemetry creates strengthening tasks for weak retrieval behavior", () => {
  const invocations = Array.from({ length: 6 }, (_, index) => ({
    ts: `2026-05-02T00:00:0${index}.000Z`,
    agent_id: "refactoring-specialist",
    task_summary: "refactor checkout callers",
    confidence_score: 8,
    subtool_usage: { memory: 0, "code-search": index % 2, "code-graph": 0 },
    evidence_contract: { pass: index === 0 },
  }));

  const report = buildAgentRetrievalTelemetryReport({
    invocations,
    evidenceEntries: [],
    thresholds: {
      minSample: 5,
      memoryRate: 0.5,
      ragRate: 0.6,
      codegraphRateForStructural: 0.7,
      evidencePassRate: 0.85,
      confidence: 8.5,
    },
  });

  assert.equal(report.pass, false);
  assert.equal(report.summary.failingAgents, 1);
  assert.ok(report.agents[0].violations.some((item) => item.includes("CodeGraph")));
  assert.equal(report.strengtheningTasks[0].agentId, "refactoring-specialist");
});

test("agent retrieval telemetry does not report 10/10 when samples are too thin", () => {
  const invocations = Array.from({ length: 4 }, (_, index) => ({
    ts: `2026-05-02T00:00:0${index}.000Z`,
    agent_id: `specialist-${index}`,
    task_summary: "audit memory rag codegraph usage",
    confidence_score: 9,
    retrieval_enforcement: { schemaVersion: 1, evidenceLedger: "written" },
    subtool_usage: { memory: 0, "code-search": 0, "code-graph": 0 },
  }));

  const report = buildAgentRetrievalTelemetryReport({
    invocations,
    evidenceEntries: [],
    thresholds: { minSample: 5 },
  });

  assert.equal(report.pass, false);
  assert.ok(report.maturityScore < 10);
  assert.ok(report.globalViolations.some((item) => item.includes("insufficient invocation sample")));
});

test("agent retrieval telemetry caps maturity for legacy-only invocations", () => {
  const invocations = Array.from({ length: 10 }, (_, index) => ({
    ts: `2026-05-02T00:00:${String(index).padStart(2, "0")}.000Z`,
    agent_id: `legacy-${index}`,
    task_summary: "audit prior agent behavior",
    confidence_score: 8,
  }));

  const report = buildAgentRetrievalTelemetryReport({
    invocations,
    evidenceEntries: [],
    thresholds: { minSample: 5 },
  });

  assert.equal(report.pass, true);
  assert.equal(report.maturityScore, 8);
  assert.equal(isStrictAgentRetrievalTelemetryPass(report), false);
  assert.equal(report.summary.invocations, 0);
  assert.equal(report.summary.legacySkipped, 10);
  assert.equal(report.sampleStatus, "ready-no-post-enforcement-samples");
  assert.ok(report.globalWarnings.some((item) => item.includes("post-enforcement retrieval telemetry samples")));
});

test("agent retrieval telemetry skips explicit not-provided enforcement samples", () => {
  const invocations = Array.from({ length: 6 }, (_, index) => ({
    ts: `2026-05-02T00:00:${String(index).padStart(2, "0")}.000Z`,
    agent_id: "quality-gate-reviewer",
    task_summary: "review quality gate without retrieval evidence",
    confidence_score: 9,
    retrieval_enforcement: { schemaVersion: 1, evidenceLedger: "not-provided" },
    retrieval_policy: { schemaVersion: 1, provided: false, reason: "not-provided" },
  }));

  const report = buildAgentRetrievalTelemetryReport({
    invocations,
    evidenceEntries: [],
    thresholds: { minSample: 5 },
  });

  assert.equal(report.summary.invocations, 0);
  assert.equal(report.summary.legacySkipped, 6);
  assert.equal(report.maturityScore, 8);
  assert.equal(isStrictAgentRetrievalTelemetryPass(report), false);
});

test("agent retrieval telemetry does not penalize sources marked optional by retrieval policy", () => {
  const invocations = Array.from({ length: 6 }, (_, index) => ({
    ts: `2026-05-02T00:00:${String(index).padStart(2, "0")}.000Z`,
    agent_id: "quality-gate-reviewer",
    task_summary: "quality gate review with receipt backed RAG",
    confidence_score: 9,
    retrieval_enforcement: { schemaVersion: 1, evidenceLedger: "trusted-workflow-receipt" },
    retrieval_policy: { memory: "optional", rag: "mandatory", codegraph: "optional" },
    subtool_usage: { memory: 0, rag: 1, codegraph: 0 },
    evidence_gate: { pass: true, score: 10 },
  }));

  const report = buildAgentRetrievalTelemetryReport({
    invocations,
    evidenceEntries: invocations.map((entry) => ({
      taskId: entry.task_summary,
      agentId: entry.agent_id,
      gate: { pass: true, score: 10 },
    })),
    thresholds: { minSample: 5 },
  });

  assert.equal(report.pass, true);
  assert.equal(report.maturityScore, 10);
  assert.equal(report.agents[0].memoryRate, 1);
  assert.equal(report.agents[0].ragRate, 1);
});

test("agent retrieval telemetry treats explicit not-needed source policy as provided", () => {
  const invocations = Array.from({ length: 6 }, (_, index) => ({
    ts: `2026-05-02T00:00:${String(index).padStart(2, "0")}.000Z`,
    agent_id: "stack-developer",
    task_summary: "metadata-only version bump receipt",
    confidence_score: 9,
    retrieval_enforcement: { schemaVersion: 1, evidenceLedger: "written", evidencePass: true },
    retrieval_policy: {
      schemaVersion: 1,
      provided: true,
      policy: { memory: "not-needed", rag: "not-needed", codegraph: "not-needed" },
    },
    subtool_usage: { memory: 0, rag: 0, codegraph: 0 },
    evidence_gate: { pass: true, score: 10 },
  }));

  const report = buildAgentRetrievalTelemetryReport({
    invocations,
    evidenceEntries: invocations.map((entry) => ({
      taskId: entry.task_summary,
      agentId: entry.agent_id,
      gate: { pass: true, score: 10 },
    })),
    thresholds: { minSample: 5 },
  });

  assert.equal(report.pass, true);
  assert.equal(report.maturityScore, 10);
  assert.equal(report.agents[0].memoryRate, 1);
  assert.equal(report.agents[0].ragRate, 1);
  assert.equal(report.agents[0].codegraphRate, 1);
});

test("agent retrieval telemetry accepts receipt-backed distributed evidence portfolios", () => {
  const invocations = Array.from({ length: 10 }, (_, index) => ({
    ts: `2026-05-02T00:00:${String(index).padStart(2, "0")}.000Z`,
    agent_id: `specialist-${index}`,
    task_summary: "audit agent-system retrieval evidence",
    confidence_score: 9,
    retrieval_enforcement: {
      schemaVersion: 1,
      evidenceLedger: "trusted-workflow-receipt",
    },
    subtool_usage: { memory: index === 0 ? 1 : 0, rag: 1, codegraph: index === 1 ? 1 : 0 },
    evidence_contract: { pass: true, score: 10 },
    evidence_gate: { pass: true, score: 10 },
  }));
  const evidenceEntries = invocations.map((entry) => ({
    taskId: entry.task_summary,
    agentId: entry.agent_id,
    gate: { pass: true, score: 10 },
  }));

  const report = buildAgentRetrievalTelemetryReport({
    invocations,
    evidenceEntries,
    thresholds: { minSample: 5 },
  });

  assert.equal(report.pass, true);
  assert.equal(report.maturityScore, 10);
  assert.equal(report.summary.agents, 10);
  assert.equal(report.globalViolations.length, 0);
});
