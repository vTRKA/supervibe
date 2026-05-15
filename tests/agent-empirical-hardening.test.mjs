import assert from "node:assert/strict";
import test from "node:test";

import {
  CRITICAL_AGENT_IDS,
  FOUNDATIONAL_AGENT_SKILLS,
  REQUIRED_STACK_SCENARIO_COUNT,
  buildAgentCapabilityHeatmap,
  buildPerAgentEvalPacks,
  evaluateAgentFreshness,
  formatAgentEmpiricalHardeningReport,
  loadAgentEmpiricalRecords,
  scoreAgentEmpiricalQuality,
  validateAgentEmpiricalHardening,
} from "../scripts/lib/supervibe-agent-empirical-hardening.mjs";

test("all agents have generated per-agent eval packs and score heatmap rows", () => {
  const records = loadAgentEmpiricalRecords(process.cwd());
  const packs = buildPerAgentEvalPacks({ rootDir: process.cwd() });
  const heatmap = buildAgentCapabilityHeatmap({ rootDir: process.cwd() });

  assert.equal(records.agents.length, 96);
  assert.equal(packs.length, records.agents.length);
  assert.equal(heatmap.length, records.agents.length);
  assert.ok(packs.every((pack) => pack.cases.length >= 3));
  assert.ok(heatmap.every((row) => row.score >= 9), JSON.stringify(heatmap.filter((row) => row.score < 9), null, 2));
  assert.ok(heatmap.some((row) => row.agentId === "fastify-developer" && row.grade === "excellent"));
});

test("critical agents are declared as playbook-gated", () => {
  assert.ok(CRITICAL_AGENT_IDS.includes("supervibe-orchestrator"));
  assert.ok(CRITICAL_AGENT_IDS.includes("quality-gate-reviewer"));
  assert.ok(CRITICAL_AGENT_IDS.includes("fastify-developer"));
  assert.equal(new Set(CRITICAL_AGENT_IDS).size, CRITICAL_AGENT_IDS.length);
});

test("agent quality scoring uses foundational skills and freshness signals", () => {
  const records = loadAgentEmpiricalRecords(process.cwd());
  const fastify = records.agents.find((agent) => agent.id === "fastify-developer");
  const freshness = evaluateAgentFreshness(fastify);
  const score = scoreAgentEmpiricalQuality(fastify, { freshness });

  assert.ok(FOUNDATIONAL_AGENT_SKILLS.has("supervibe:project-memory"));
  assert.equal(freshness.pass, true, freshness.issues.join("\n"));
  assert.ok(score >= 9);
});

test("empirical hardening validator covers evals, heatmap, stack fixtures, and Russian corpus", () => {
  const report = validateAgentEmpiricalHardening({ rootDir: process.cwd() });

  assert.equal(report.pass, true, formatAgentEmpiricalHardeningReport(report));
  assert.equal(report.checkedAgents, 96);
  assert.equal(report.evalPacks, 96);
  assert.ok(report.evalCases >= 288);
  assert.equal(report.heatmapRows, 96);
  assert.ok(report.stackScenarios >= REQUIRED_STACK_SCENARIO_COUNT);
  assert.ok(report.russianCases >= 8);
  assert.ok(report.minimumScore >= 9);
});
