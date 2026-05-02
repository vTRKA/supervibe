import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAgentRetrievalTelemetryReport,
  evaluateAgentOutputEvidenceContract,
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
