import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_SYSTEM_MATURITY_DIMENSIONS,
  formatAgentSystemMaturityReport,
  scoreAgentSystemMaturity,
} from "../scripts/lib/agent-system-maturity.mjs";

const PASSING_VALIDATORS = Object.freeze({
  commandContracts: { pass: true },
  dynamicQuestions: { pass: true },
  continuation: { pass: true },
  workflowReceipts: { pass: true, receipts: 12 },
  agentReceipts: {
    pass: true,
    hostAgentReceipts: 4,
    agentInvocations: 12,
  },
});

test("agent-system maturity score reaches 10 only with telemetry, graph, evals, and docs", () => {
  assert.equal(AGENT_SYSTEM_MATURITY_DIMENSIONS.reduce((sum, item) => sum + item.max, 0), 10);

  const report = scoreAgentSystemMaturity({
    roster: {
      agents: 89,
      skills: 55,
      commands: 19,
      rules: 30,
      testFiles: 287,
    },
    validators: PASSING_VALIDATORS,
    indexGate: {
      ready: true,
      sourceReady: true,
      warnings: "",
      evidence: "source=325/325, failed=none, warnings=none",
    },
    docs: {
      hasNegativeQuestionEval: true,
      hasTenOutOfTenBacklog: true,
      hasMaturityScriptDocs: true,
    },
  });

  assert.equal(report.pass, true);
  assert.equal(report.score, 10);
  assert.equal(report.blockers.length, 0);
});

test("agent-system maturity score blocks 10/10 when host telemetry is missing", () => {
  const report = scoreAgentSystemMaturity({
    roster: {
      agents: 89,
      skills: 55,
      commands: 19,
      rules: 30,
      testFiles: 287,
    },
    validators: {
      ...PASSING_VALIDATORS,
      agentReceipts: {
        pass: false,
        hostAgentReceipts: 0,
        agentInvocations: 0,
      },
    },
    indexGate: {
      ready: true,
      sourceReady: true,
      warnings: "",
      evidence: "source=325/325, failed=none, warnings=none",
    },
    docs: {
      hasNegativeQuestionEval: true,
      hasTenOutOfTenBacklog: true,
      hasMaturityScriptDocs: true,
    },
  });

  assert.equal(report.pass, false);
  assert.ok(report.score < 10);
  assert.ok(report.blockers.some((blocker) => blocker.id === "host-agent-telemetry"));
  assert.match(formatAgentSystemMaturityReport(report), /NEXT_ACTION: Complete real host-agent stages/);
});

test("agent-system maturity score blocks 10/10 when strict producer validation fails despite telemetry counts", () => {
  const report = scoreAgentSystemMaturity({
    roster: {
      agents: 89,
      skills: 55,
      commands: 19,
      rules: 30,
      testFiles: 287,
    },
    validators: {
      ...PASSING_VALIDATORS,
      agentReceipts: {
        pass: false,
        hostAgentReceipts: 4,
        agentInvocations: 12,
      },
    },
    indexGate: {
      ready: true,
      sourceReady: true,
      warnings: "",
      evidence: "source=325/325, failed=none, warnings=none",
    },
    docs: {
      hasNegativeQuestionEval: true,
      hasTenOutOfTenBacklog: true,
      hasMaturityScriptDocs: true,
    },
  });

  assert.equal(report.pass, false);
  assert.ok(report.score < 10);
  assert.ok(report.blockers.some((blocker) => blocker.id === "host-agent-telemetry"));
  assert.match(formatAgentSystemMaturityReport(report), /strictPass=false/);
});
