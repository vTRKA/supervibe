import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAgentTechReadinessReport,
  formatAgentTechReadinessReport,
} from "../scripts/lib/supervibe-agent-tech-readiness.mjs";

test("agent technology readiness covers the seven researched recommendations", async () => {
  const report = await buildAgentTechReadinessReport({
    rootDir: process.cwd(),
    repoMapMaxFiles: 60,
  });

  assert.equal(report.pass, true, formatAgentTechReadinessReport(report));
  assert.equal(report.recommendations.length, 7);
  assert.ok(report.recommendations.every((item) => item.status === "implemented" || item.status === "deferred-with-gate"));
  assert.ok(report.recommendations.some((item) => item.id === "runtime-trace-spine"));
  assert.ok(report.recommendations.some((item) => item.id === "context-mcp-v1"));
  assert.ok(report.recommendations.some((item) => item.id === "scip-import-readiness"));
  assert.match(formatAgentTechReadinessReport(report), /SUPERVIBE_AGENT_TECH_READINESS/);
});
