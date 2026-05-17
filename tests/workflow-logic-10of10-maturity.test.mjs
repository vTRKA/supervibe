import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  WORKFLOW_LOGIC_10OF10_DIMENSIONS,
  WORKFLOW_LOGIC_GATE_PROFILES,
  buildWorkflowLogicTenOfTenReport,
  formatWorkflowLogicTenOfTenReport,
  scoreWorkflowLogicTenOfTen,
} from "../scripts/validate-workflow-logic-10of10.mjs";

function passingEvidence(overrides = {}) {
  return {
    memory: { pass: true, summary: "entries=5/1, relevantHighConfidence=2/1" },
    rag: { pass: true, summary: "source=455/455, missingOrStale=0" },
    codegraph: { pass: true, summary: "ready=true, missingOrStale=0" },
    receipts: { pass: true, summary: "trustedReceipts=3/1, trustedHostAgentReceipts=2/1" },
    graphProof: { pass: true, summary: "taskGraph=10/10, sourceSnapshot=true, strictEvidence=true" },
    agentLease: { pass: true, summary: "sourceChecks=6/6, staleActiveClaims=0" },
    routing: { pass: true, summary: "commandAgent=true, routing=true, commandShortcuts=true, readyTaskDispatch=true" },
    review: { pass: true, summary: "reviewGate=true, artifacts=1, validator=true" },
    gateProfile: { pass: true, summary: "profile=development, finalOnlyPolicy=true" },
    ...overrides,
  };
}

test("workflow-logic maturity dimensions sum to exactly 10", () => {
  const max = WORKFLOW_LOGIC_10OF10_DIMENSIONS.reduce((sum, dimension) => sum + dimension.max, 0);
  assert.equal(max, 10);
  assert.equal(WORKFLOW_LOGIC_GATE_PROFILES.development.fullSuiteAllowed, false);
  assert.equal(WORKFLOW_LOGIC_GATE_PROFILES.development.targetedOnly, false);
  assert.equal(WORKFLOW_LOGIC_GATE_PROFILES.development.finalOnlyVerification, true);
  assert.equal(WORKFLOW_LOGIC_GATE_PROFILES.development.developmentTestsAllowed, false);
  assert.equal(WORKFLOW_LOGIC_GATE_PROFILES.development.developmentValidatorsAllowed, false);
  assert.equal(WORKFLOW_LOGIC_GATE_PROFILES.release.fullSuiteAllowed, true);
  assert.equal(WORKFLOW_LOGIC_GATE_PROFILES.release.releaseFinalValidationRequired, true);
});

test("development profile reaches 10 only when all required evidence passes", () => {
  const report = scoreWorkflowLogicTenOfTen({
    profile: "development",
    evidence: passingEvidence(),
  });

  assert.equal(report.pass, true);
  assert.equal(report.score, 10);
  assert.equal(report.strictTenOfTenReady, true);
  assert.equal(report.gateProfile.scope, "task-local");
  assert.equal(report.gateProfile.targetedOnly, false);
  assert.equal(report.gateProfile.fullSuiteAllowed, false);
  assert.equal(report.gateProfile.finalOnlyVerification, true);
  assert.deepEqual(report.gateProfile.finalOnlyWorkflowTypes, ["plan", "graph", "task"]);
  assert.equal(report.gateProfile.developmentTestsAllowed, false);
  assert.equal(report.gateProfile.developmentValidatorsAllowed, false);
  assert.equal(report.gateProfile.releaseFinalValidationRequired, false);
  assert.match(report.dimensions.find((dimension) => dimension.id === "gate-profile").evidence, /developmentTestsAllowed=false/);
  assert.deepEqual(report.blockers, []);
});

test("missing required evidence blocks a 10/10 claim", () => {
  const report = scoreWorkflowLogicTenOfTen({
    profile: "development",
    evidence: passingEvidence({
      codegraph: {
        pass: false,
        summary: "ready=false, missingOrStale=4",
      },
    }),
  });

  assert.equal(report.pass, false);
  assert.equal(report.strictTenOfTenReady, false);
  assert.equal(report.score, 8.75);
  assert.equal(report.blockers.length, 1);
  assert.equal(report.blockers[0].id, "codegraph");
  assert.match(report.blockers[0].nextAction, /Refresh CodeGraph/);
});

test("release profile exposes release-only proof requirements and blocks missing full-check evidence", () => {
  const report = scoreWorkflowLogicTenOfTen({
    profile: "release",
    evidence: passingEvidence({
      gateProfile: {
        pass: false,
        summary: "profile=release, finalOnlyPolicy=true, releaseFullCheckEvidence=0",
      },
    }),
  });

  assert.equal(report.pass, false);
  assert.equal(report.gateProfile.scope, "phase-or-release-gate");
  assert.equal(report.gateProfile.fullSuiteAllowed, true);
  assert.equal(report.gateProfile.releaseFullCheckRequired, true);
  assert.equal(report.gateProfile.activeGraphRequired, true);
  assert.equal(report.gateProfile.requireActiveReview, true);
  assert.equal(report.gateProfile.finalOnlyVerification, true);
  assert.equal(report.gateProfile.developmentTestsAllowed, false);
  assert.equal(report.gateProfile.developmentValidatorsAllowed, false);
  assert.equal(report.gateProfile.releaseFinalValidationRequired, true);
  assert.ok(report.blockers.some((blocker) => blocker.id === "gate-profile"));
});

test("release graph proof reads current active graph dimension", async () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-workflow-logic-graph-proof-"));
  try {
    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: {} }), "utf8");
    const report = await buildWorkflowLogicTenOfTenReport(root, { profile: "release" });
    const graphProof = report.dimensions.find((dimension) => dimension.id === "graph-proof");

    assert.equal(graphProof.details.currentGraph.id, "current-active-graph");
    assert.equal(graphProof.details.currentGraph.pass, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("terminal formatter reports profile, score, required evidence, dimensions, and blockers", () => {
  const report = scoreWorkflowLogicTenOfTen({
    profile: "release",
    evidence: passingEvidence({
      memory: { pass: false, summary: "entries=0/5, relevantHighConfidence=0/1" },
    }),
  });
  const formatted = formatWorkflowLogicTenOfTenReport(report);

  assert.match(formatted, /SUPERVIBE_WORKFLOW_LOGIC_10OF10/);
  assert.match(formatted, /PROFILE: release/);
  assert.match(formatted, /PASS: false/);
  assert.match(formatted, /SCORE: 9\/10/);
  assert.match(formatted, /REQUIRED_EVIDENCE: memory,rag,codegraph,receipts,graph-proof,agent-lease,routing,review,verification-policy/);
  assert.match(formatted, /FULL_SUITE_ALLOWED: true/);
  assert.match(formatted, /FINAL_ONLY_VERIFICATION: true/);
  assert.match(formatted, /FINAL_ONLY_WORKFLOW_TYPES: plan,graph,task/);
  assert.match(formatted, /DEVELOPMENT_TESTS_ALLOWED: false/);
  assert.match(formatted, /DEVELOPMENT_VALIDATORS_ALLOWED: false/);
  assert.match(formatted, /RELEASE_FINAL_VALIDATION_REQUIRED: true/);
  assert.match(formatted, /VERIFICATION_POLICY: plan-graph-task-final-only-release-verification/);
  assert.match(formatted, /ACTIVE_GRAPH_REQUIRED: true/);
  assert.match(formatted, /- memory: 0\/1 pass=false/);
  assert.match(formatted, /BLOCKER: memory - entries=0\/5/);
});
