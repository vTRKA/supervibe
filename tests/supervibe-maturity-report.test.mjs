import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMaturityDashboard,
  formatMaturityDashboard,
} from "../scripts/supervibe-maturity-report.mjs";

test("maturity dashboard summarizes coverage, source truth, visual, readiness and update self-heal", async () => {
  const report = await buildMaturityDashboard({
    rootDir: process.cwd(),
    agentSystemReport: {
      pass: true,
      score: 10,
      maxScore: 10,
      status: "10-of-10-ready",
      dimensions: [],
      blockers: [],
    },
  });
  const formatted = formatMaturityDashboard(report);

  assert.equal(report.pass, true, formatted);
  assert.match(formatted, /SUPERVIBE_MATURITY_REPORT/);
  assert.match(formatted, /USER_CASE_COVERAGE: pass/);
  assert.match(formatted, /SOURCE_OF_TRUTH: pass/);
  assert.match(formatted, /VISUAL_EXPLANATION: pass/);
  assert.match(formatted, /RAW_TASK_PREVENTION: pass/);
  assert.match(formatted, /UPDATE_SELF_HEAL: pass/);
  assert.match(formatted, /ROUTE_COVERAGE: pass/);
  assert.match(formatted, /WORKFLOW_CHAIN_AUDIT: pass/);
  assert.match(formatted, /HOST_INSTRUCTION_COEXISTENCE: pass/);
  assert.match(formatted, /ARTIFACT_READINESS: pass/);
  assert.match(formatted, /COMMAND_FRESHNESS: pass/);
  assert.match(formatted, /VERSION: \d+\.\d+\.\d+/);
});
