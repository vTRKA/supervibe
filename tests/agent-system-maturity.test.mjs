import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  AGENT_SYSTEM_MATURITY_DIMENSIONS,
  buildAgentSystemMaturityReport,
  formatAgentSystemMaturityReport,
  scoreAgentSystemMaturity,
} from "../scripts/lib/agent-system-maturity.mjs";

const ROOT = process.cwd();

const PASSING_VALIDATORS = Object.freeze({
  commandContracts: { pass: true },
  dynamicQuestions: { pass: true },
  ruleContentQuality: { pass: true },
  agentContentQuality: { pass: true },
  skillContentQuality: { pass: true },
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
      agents: 97,
      skills: 56,
      commands: 19,
      rules: 31,
      testFiles: 331,
    },
    validators: PASSING_VALIDATORS,
    indexGate: {
      ready: true,
      sourceReady: true,
      warnings: "",
      retrievalEnforcementPass: true,
      missingOrStale: 0,
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

test("agent-system maturity blocks active 10/10 when command readiness is blocked", () => {
  const report = scoreAgentSystemMaturity({
    roster: {
      agents: 97,
      skills: 56,
      commands: 19,
      rules: 31,
      testFiles: 331,
    },
    validators: {
      ...PASSING_VALIDATORS,
      activeCommandReadiness: {
        pass: false,
        command: "/supervibe-design",
        executionMode: "agent-required-blocked",
        callableAgentsReady: false,
        missingCallableAgents: ["creative-director", "prototype-builder"],
      },
    },
    indexGate: {
      ready: true,
      sourceReady: true,
      warnings: "",
      retrievalEnforcementPass: true,
      retrievalTelemetryMaturityScore: 10,
      retrievalTelemetryStrictPass: true,
      missingOrStale: 0,
      evidence: "source=325/325, failed=none, warnings=none, retrievalEnforcement=true, retrievalTelemetry=10/10",
    },
    docs: {
      hasNegativeQuestionEval: true,
      hasTenOutOfTenBacklog: true,
      hasMaturityScriptDocs: true,
    },
  });

  assert.equal(report.pass, false);
  assert.ok(report.score < 10);
  assert.ok(report.blockers.some((blocker) => blocker.id === "command-orchestration"));
  assert.match(formatAgentSystemMaturityReport(report), /activeCommand=\/supervibe-design/);
  assert.match(formatAgentSystemMaturityReport(report), /missingCallable=creative-director\|prototype-builder/);
});

test("agent-system maturity keeps baseline 10/10 when active command readiness is not requested", () => {
  const report = scoreAgentSystemMaturity({
    roster: {
      agents: 97,
      skills: 56,
      commands: 19,
      rules: 31,
      testFiles: 331,
    },
    validators: PASSING_VALIDATORS,
    indexGate: {
      ready: true,
      sourceReady: true,
      warnings: "",
      retrievalEnforcementPass: true,
      retrievalTelemetryMaturityScore: 10,
      retrievalTelemetryStrictPass: true,
      missingOrStale: 0,
      evidence: "source=325/325, failed=none, warnings=none, retrievalEnforcement=true, retrievalTelemetry=10/10",
    },
    docs: {
      hasNegativeQuestionEval: true,
      hasTenOutOfTenBacklog: true,
      hasMaturityScriptDocs: true,
    },
  });

  assert.equal(report.pass, true);
  assert.equal(report.score, 10);
});

test("agent-system active command readiness uses plugin root for consumer projects", async () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-agent-maturity-consumer-"));
  try {
    writeFileSync(join(root, "AGENTS.md"), "# Consumer host\n", "utf8");

    const report = await buildAgentSystemMaturityReport(root, {
      activeCommand: "/supervibe-design",
      host: "codex",
      slug: "agent-chat",
      handoffId: "agent-chat-run",
      pluginRoot: ROOT,
    });
    const commandOrchestration = report.dimensions.find((item) => item.id === "command-orchestration");

    assert.equal(commandOrchestration.pass, false);
    assert.match(commandOrchestration.evidence, /activeCommand=\/supervibe-design/);
    assert.match(commandOrchestration.evidence, /missingCallable=.*creative-director/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("agent-system maturity score blocks 10/10 when host telemetry is missing", () => {
  const report = scoreAgentSystemMaturity({
    roster: {
      agents: 97,
      skills: 56,
      commands: 19,
      rules: 31,
      testFiles: 331,
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
      retrievalEnforcementPass: true,
      missingOrStale: 0,
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
      agents: 97,
      skills: 56,
      commands: 19,
      rules: 31,
      testFiles: 331,
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
      retrievalEnforcementPass: true,
      missingOrStale: 0,
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

test("agent-system maturity blocks 10/10 when invocation distribution hides missing specialists", () => {
  const report = scoreAgentSystemMaturity({
    roster: {
      agents: 97,
      skills: 56,
      commands: 19,
      rules: 31,
      testFiles: 331,
    },
    validators: {
      ...PASSING_VALIDATORS,
      agentReceipts: {
        pass: true,
        hostAgentReceipts: 12,
        agentInvocations: 12,
        invocationsByAgent: {
          "supervibe-orchestrator": 11,
          "creative-director": 1,
        },
        missingSubjects: ["prototype-builder", "accessibility-reviewer"],
      },
    },
    indexGate: {
      ready: true,
      sourceReady: true,
      warnings: "",
      retrievalEnforcementPass: true,
      retrievalTelemetryMaturityScore: 10,
      retrievalTelemetryStrictPass: true,
      missingOrStale: 0,
      evidence: "source=325/325, failed=none, warnings=none, retrievalEnforcement=true, retrievalTelemetry=10/10",
    },
    docs: {
      hasNegativeQuestionEval: true,
      hasTenOutOfTenBacklog: true,
      hasMaturityScriptDocs: true,
    },
  });

  assert.equal(report.pass, false);
  assert.ok(report.blockers.some((blocker) => blocker.id === "host-agent-telemetry"));
  assert.match(formatAgentSystemMaturityReport(report), /distributionWarning=supervibe-orchestrator:11\/12/);
  assert.match(formatAgentSystemMaturityReport(report), /missing=prototype-builder\|accessibility-reviewer/);
});

test("agent-system maturity reports distribution skew without blocking when no specialists are missing", () => {
  const report = scoreAgentSystemMaturity({
    roster: {
      agents: 97,
      skills: 56,
      commands: 19,
      rules: 31,
      testFiles: 331,
    },
    validators: {
      ...PASSING_VALIDATORS,
      agentReceipts: {
        pass: true,
        hostAgentReceipts: 12,
        agentInvocations: 12,
        invocationsByAgent: {
          "supervibe-orchestrator": 11,
          "quality-gate-reviewer": 1,
        },
      },
    },
    indexGate: {
      ready: true,
      sourceReady: true,
      warnings: "",
      retrievalEnforcementPass: true,
      retrievalTelemetryMaturityScore: 10,
      retrievalTelemetryStrictPass: true,
      missingOrStale: 0,
      evidence: "source=325/325, failed=none, warnings=none, retrievalEnforcement=true, retrievalTelemetry=10/10",
    },
    docs: {
      hasNegativeQuestionEval: true,
      hasTenOutOfTenBacklog: true,
      hasMaturityScriptDocs: true,
    },
  });

  assert.equal(report.pass, true);
  assert.equal(report.score, 10);
  assert.match(formatAgentSystemMaturityReport(report), /distributionWarning=supervibe-orchestrator:11\/12/);
});

test("agent-system maturity blocks 10/10 when retrieval enforcement hook is missing", () => {
  const report = scoreAgentSystemMaturity({
    roster: {
      agents: 97,
      skills: 56,
      commands: 19,
      rules: 31,
      testFiles: 331,
    },
    validators: PASSING_VALIDATORS,
    indexGate: {
      ready: true,
      sourceReady: true,
      warnings: "",
      retrievalEnforcementPass: false,
      missingOrStale: 0,
      evidence: "source=325/325, failed=none, warnings=none, retrievalEnforcement=false",
    },
    docs: {
      hasNegativeQuestionEval: true,
      hasTenOutOfTenBacklog: true,
      hasMaturityScriptDocs: true,
    },
  });

  assert.equal(report.pass, false);
  assert.ok(report.blockers.some((blocker) => blocker.id === "code-graph-readiness"));
});

test("agent-system maturity blocks 10/10 when retrieval telemetry is not strict 10/10", () => {
  const report = scoreAgentSystemMaturity({
    roster: {
      agents: 97,
      skills: 56,
      commands: 19,
      rules: 31,
      testFiles: 331,
    },
    validators: PASSING_VALIDATORS,
    indexGate: {
      ready: true,
      sourceReady: true,
      warnings: "",
      retrievalEnforcementPass: true,
      retrievalTelemetryMaturityScore: 8,
      retrievalTelemetryStrictPass: false,
      missingOrStale: 0,
      evidence: "source=325/325, failed=none, warnings=none, retrievalEnforcement=true, retrievalTelemetry=8/10",
    },
    docs: {
      hasNegativeQuestionEval: true,
      hasTenOutOfTenBacklog: true,
      hasMaturityScriptDocs: true,
    },
  });

  assert.equal(report.pass, false);
  assert.ok(report.blockers.some((blocker) => blocker.id === "code-graph-readiness"));
  assert.match(formatAgentSystemMaturityReport(report), /retrievalTelemetry=8\/10/);
});

test("agent-system maturity does not double-count retrieval sample gap as CodeGraph failure", () => {
  const report = scoreAgentSystemMaturity({
    roster: {
      agents: 97,
      skills: 56,
      commands: 19,
      rules: 31,
      testFiles: 331,
    },
    validators: {
      ...PASSING_VALIDATORS,
      agentReceipts: {
        pass: false,
        hostAgentReceipts: 2,
        agentInvocations: 2,
      },
    },
    indexGate: {
      ready: true,
      sourceReady: true,
      warnings: "",
      retrievalEnforcementPass: true,
      retrievalTelemetryMaturityScore: 9,
      retrievalTelemetryStrictPass: false,
      retrievalTelemetryGlobalViolations: ["insufficient invocation sample 2 < 5"],
      missingOrStale: 0,
      evidence: "source=325/325, failed=none, warnings=none, retrievalEnforcement=true, retrievalTelemetry=9/10",
    },
    docs: {
      hasNegativeQuestionEval: true,
      hasTenOutOfTenBacklog: true,
      hasMaturityScriptDocs: true,
    },
  });

  assert.equal(report.pass, false);
  assert.ok(report.blockers.some((blocker) => blocker.id === "host-agent-telemetry"));
  assert.equal(report.blockers.some((blocker) => blocker.id === "code-graph-readiness"), false);
});

test("agent-system maturity blocks 10/10 when list-missing reports stale graph rows", () => {
  const report = scoreAgentSystemMaturity({
    roster: {
      agents: 97,
      skills: 56,
      commands: 19,
      rules: 31,
      testFiles: 331,
    },
    validators: PASSING_VALIDATORS,
    indexGate: {
      ready: true,
      sourceReady: true,
      warnings: "",
      retrievalEnforcementPass: true,
      retrievalTelemetryMaturityScore: 10,
      retrievalTelemetryStrictPass: true,
      missingOrStale: 1,
      evidence: "source=325/325, failed=none, warnings=none, missingOrStale=1, retrievalEnforcement=true, retrievalTelemetry=10/10",
    },
    docs: {
      hasNegativeQuestionEval: true,
      hasTenOutOfTenBacklog: true,
      hasMaturityScriptDocs: true,
    },
  });

  assert.equal(report.pass, false);
  assert.ok(report.blockers.some((blocker) => blocker.id === "code-graph-readiness"));
  assert.match(formatAgentSystemMaturityReport(report), /missingOrStale=1/);
  assert.match(formatAgentSystemMaturityReport(report), /--list-missing reports MISSING_OR_STALE: 0/);
});

test("agent-system maturity blocks 10/10 when route replay has command regressions", () => {
  const report = scoreAgentSystemMaturity({
    roster: {
      agents: 97,
      skills: 56,
      commands: 19,
      rules: 31,
      testFiles: 331,
    },
    validators: PASSING_VALIDATORS,
    indexGate: {
      ready: true,
      sourceReady: true,
      warnings: "",
      retrievalEnforcementPass: true,
      retrievalTelemetryMaturityScore: 10,
      retrievalTelemetryStrictPass: true,
      missingOrStale: 0,
      evidence: "source=325/325, failed=none, warnings=none, retrievalEnforcement=true, retrievalTelemetry=10/10",
    },
    docs: {
      hasNegativeQuestionEval: true,
      hasTenOutOfTenBacklog: true,
      hasMaturityScriptDocs: true,
      routeReplayPass: false,
      routeReplayEvidence: "workflow=8/8, semantic=30/30, command=2/3, failed=command:ru-review-loop-plan",
    },
  });

  assert.equal(report.pass, false);
  assert.ok(report.blockers.some((blocker) => blocker.id === "eval-coverage"));
  assert.match(formatAgentSystemMaturityReport(report), /command=2\/3/);
});

test("agent-system maturity blocks 10/10 when rules rely on filler content", () => {
  const report = scoreAgentSystemMaturity({
    roster: {
      agents: 97,
      skills: 56,
      commands: 19,
      rules: 31,
      testFiles: 331,
    },
    validators: {
      ...PASSING_VALIDATORS,
      ruleContentQuality: { pass: false },
    },
    indexGate: {
      ready: true,
      sourceReady: true,
      warnings: "",
      retrievalEnforcementPass: true,
      retrievalTelemetryMaturityScore: 10,
      retrievalTelemetryStrictPass: true,
      missingOrStale: 0,
      evidence: "source=325/325, failed=none, warnings=none, retrievalEnforcement=true, retrievalTelemetry=10/10",
    },
    docs: {
      hasNegativeQuestionEval: true,
      hasTenOutOfTenBacklog: true,
      hasMaturityScriptDocs: true,
    },
  });

  assert.equal(report.pass, false);
  assert.ok(report.blockers.some((blocker) => blocker.id === "backlog-and-docs"));
  assert.match(formatAgentSystemMaturityReport(report), /rule content quality=false/);
});

test("agent-system maturity blocks 10/10 when agent content quality is weak", () => {
  const report = scoreAgentSystemMaturity({
    roster: {
      agents: 97,
      skills: 56,
      commands: 19,
      rules: 31,
      testFiles: 331,
    },
    validators: {
      ...PASSING_VALIDATORS,
      agentContentQuality: { pass: false },
    },
    indexGate: {
      ready: true,
      sourceReady: true,
      warnings: "",
      retrievalEnforcementPass: true,
      retrievalTelemetryMaturityScore: 10,
      retrievalTelemetryStrictPass: true,
      missingOrStale: 0,
      evidence: "source=325/325, failed=none, warnings=none, retrievalEnforcement=true, retrievalTelemetry=10/10",
    },
    docs: {
      hasNegativeQuestionEval: true,
      hasTenOutOfTenBacklog: true,
      hasMaturityScriptDocs: true,
    },
  });

  assert.equal(report.pass, false);
  assert.ok(report.blockers.some((blocker) => blocker.id === "backlog-and-docs"));
  assert.match(formatAgentSystemMaturityReport(report), /agent content quality=false/);
});

test("agent-system maturity blocks 10/10 when skill content quality is weak", () => {
  const report = scoreAgentSystemMaturity({
    roster: {
      agents: 97,
      skills: 56,
      commands: 19,
      rules: 31,
      testFiles: 331,
    },
    validators: {
      ...PASSING_VALIDATORS,
      skillContentQuality: { pass: false },
    },
    indexGate: {
      ready: true,
      sourceReady: true,
      warnings: "",
      retrievalEnforcementPass: true,
      retrievalTelemetryMaturityScore: 10,
      retrievalTelemetryStrictPass: true,
      missingOrStale: 0,
      evidence: "source=325/325, failed=none, warnings=none, retrievalEnforcement=true, retrievalTelemetry=10/10",
    },
    docs: {
      hasNegativeQuestionEval: true,
      hasTenOutOfTenBacklog: true,
      hasMaturityScriptDocs: true,
    },
  });

  assert.equal(report.pass, false);
  assert.ok(report.blockers.some((blocker) => blocker.id === "backlog-and-docs"));
  assert.match(formatAgentSystemMaturityReport(report), /skill content quality=false/);
});
