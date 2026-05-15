import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAN_GRAPH_TASK_FINAL_ONLY_VERIFICATION_POLICY,
  buildWorkflowReadinessModel,
  evaluateFinalOnlyVerificationPolicy,
  formatWorkflowReadinessModel,
} from "../scripts/lib/supervibe-workflow-readiness-model.mjs";

test("workflow readiness reports one canonical next action by priority", () => {
  const model = buildWorkflowReadinessModel({
    receipts: { pass: true, summary: "receipt trust clean" },
    indexHealth: { pass: false, status: "failed", summary: "content-stale", repairCommand: "repair index" },
    graphProof: { pass: false, summary: "missing graph proof", nextAction: "repair graph" },
    commandAgentPlan: { pass: true, summary: "plan ok" },
    cleanupDebt: { count: 0, diagnosticCount: 0 },
    maturity: { pass: false, score: 8, maxScore: 10 },
  });

  assert.equal(model.pass, false);
  assert.equal(model.primaryBlocker, "indexHealth");
  assert.equal(model.primaryAction, "repair index");
  assert.deepEqual(Object.keys(model.nextAction), ["status", "why", "blocks", "command", "safe_to_run", "requires_user_approval"]);
  assert.equal(model.nextAction.status, "blocked");
  assert.equal(model.nextAction.blocks[0].id, "indexHealth");
  assert.equal(model.nextAction.blocks[0].blocker_class, "stale-index");
  assert.equal(model.nextAction.command, "repair index");
  assert.equal(model.nextAction.safe_to_run, true);
  assert.equal(model.nextAction.requires_user_approval, false);
  assert.equal(model.finalOnlyVerification, true);
  assert.equal(model.verificationPolicy.pass, true);
  assert.deepEqual(model.verificationPolicy.details.policy.appliesTo, ["plan", "graph", "task"]);
  assert.equal(model.diagnostics.some((probe) => probe.id === "graphProof"), true);
});

test("workflow readiness formatter exposes canonical action and probes", () => {
  const model = buildWorkflowReadinessModel({
    receipts: { pass: true, summary: "receipt trust clean" },
    indexHealth: { pass: true, summary: "ready" },
    graphProof: { pass: true, score: 10 },
    commandAgentPlan: { pass: true, summary: "plan ok" },
    cleanupDebt: { count: 0, diagnosticCount: 0 },
    maturity: { pass: true, score: 10, maxScore: 10 },
  });
  const output = formatWorkflowReadinessModel(model);

  assert.equal(model.pass, true);
  assert.match(output, /SUPERVIBE_WORKFLOW_READINESS/);
  assert.match(output, /PRIMARY_BLOCKER: none/);
  assert.match(output, /NEXT_ACTION: continue with the approved workflow/);
  assert.match(output, /NEXT_ACTION_STATUS: ready/);
  assert.match(output, /NEXT_ACTION_BLOCKS: none/);
  assert.match(output, /NEXT_ACTION_COMMAND: continue with the approved workflow/);
  assert.match(output, /NEXT_ACTION_SAFE_TO_RUN: true/);
  assert.match(output, /NEXT_ACTION_REQUIRES_USER_APPROVAL: false/);
  assert.ok(output.includes('NEXT_ACTION_JSON: {"status":"ready","why":"all readiness probes passed","blocks":[],"command":"continue with the approved workflow","safe_to_run":true,"requires_user_approval":false}'));
  assert.match(output, /FINAL_ONLY_VERIFICATION: true/);
  assert.match(output, /FINAL_ONLY_WORKFLOW_TYPES: plan,graph,task/);
  assert.match(output, /DEVELOPMENT_TESTS_ALLOWED: false/);
  assert.match(output, /DEVELOPMENT_VALIDATORS_ALLOWED: false/);
  assert.match(output, /RELEASE_FINAL_VALIDATION_REQUIRED: true/);
  assert.match(output, /PROBE: verificationPolicy pass=true/);
  assert.match(output, /PROBE: maturity pass=true/);
});

test("workflow readiness blocks development test scheduling for plan graph task work", () => {
  const weakenedPolicy = {
    ...PLAN_GRAPH_TASK_FINAL_ONLY_VERIFICATION_POLICY,
    development: {
      ...PLAN_GRAPH_TASK_FINAL_ONLY_VERIFICATION_POLICY.development,
      testsAllowed: true,
    },
  };
  const policyProbe = evaluateFinalOnlyVerificationPolicy(weakenedPolicy);
  const model = buildWorkflowReadinessModel({
    receipts: { pass: true, summary: "receipt trust clean" },
    indexHealth: { pass: true, summary: "ready" },
    graphProof: { pass: true, score: 10 },
    commandAgentPlan: { pass: true, summary: "plan ok" },
    cleanupDebt: { count: 0, diagnosticCount: 0 },
    verificationPolicy: weakenedPolicy,
    maturity: { pass: true, score: 10, maxScore: 10 },
  });

  assert.equal(policyProbe.pass, false);
  assert.deepEqual(policyProbe.details.failures, ["development.testsAllowed"]);
  assert.equal(model.pass, false);
  assert.equal(model.primaryBlocker, "verificationPolicy");
  assert.equal(model.nextAction.blocks[0].blocker_class, "broken-state");
  assert.equal(model.nextAction.safe_to_run, false);
  assert.equal(model.finalOnlyVerification, false);
  assert.match(model.primaryAction, /final-only release verification/);
});

test("workflow readiness canonical action lets broken state outrank earlier probe order", () => {
  const model = buildWorkflowReadinessModel({
    receipts: { pass: true, summary: "receipt trust clean" },
    indexHealth: { pass: false, status: "failed", summary: "content-stale", repairCommand: "repair index" },
    graphProof: { pass: true, score: 10 },
    commandAgentPlan: { pass: false, summary: "missing command-agent plan", nextAction: "repair runtime plan" },
    cleanupDebt: { count: 0, diagnosticCount: 0 },
    maturity: { pass: true, score: 10, maxScore: 10 },
  });

  assert.equal(model.primaryBlocker, "commandAgentPlan");
  assert.equal(model.nextAction.command, "repair runtime plan");
  assert.equal(model.nextAction.blocks[0].blocker_class, "broken-state");
  assert.equal(model.nextAction.blocks[1].blocker_class, "stale-index");
  assert.equal(model.nextAction.safe_to_run, false);
});
