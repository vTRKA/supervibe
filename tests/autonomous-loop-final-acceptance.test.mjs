import assert from "node:assert/strict";
import test from "node:test";
import { evaluateFinalAcceptance } from "../scripts/lib/autonomous-loop-final-acceptance.mjs";

test("final acceptance blocks incomplete provenance and approval evidence", () => {
  const result = evaluateFinalAcceptance({
    state: { schema_version: 1, command_version: 1, rubric_version: 1 },
    preflight: { approval_lease: { scope: "local" } },
    tasks: [{ id: "t1", status: "complete" }],
    scores: [{ taskId: "t1", finalScore: 10 }],
  });
  assert.equal(result.pass, false);
  assert.ok(result.missing.includes("state plugin version"));
  assert.ok(result.missing.includes("approval lease environment"));
});

test("final acceptance passes when release evidence is complete", () => {
  const task = { id: "t1", status: "complete" };
  const result = evaluateFinalAcceptance({
    state: {
      schema_version: 1,
      command_version: 1,
      rubric_version: 1,
      plugin_version: "1.0.0",
      memory_write_policy: { redaction: true, stale_filter: true },
    },
    preflight: {
      approval_lease: {
        scope: "local-read-write",
        environment: "local",
        tools: [],
        budget: { max_loops: 1 },
        duration: "1 loop",
        expires_after_loops: 1,
        expires_at: "2026-04-29T00:00:00.000Z",
        renewal_triggers: ["risk_escalation"],
      },
    },
    tasks: [task],
    scores: [{ taskId: "t1", finalScore: 10 }],
    handoffs: [{
      taskId: "t1",
      sourceAgent: "stack-developer",
      targetAgent: "quality-gate-reviewer",
      confidenceScore: 10,
      sideEffectId: "s1",
      contextPack: { rulesLoaded: ["rules/confidence-discipline.md"], mcpPlan: { required: false, fallback: "none" } },
    }],
    sideEffects: [{
      actionId: "s1",
      expectedSideEffect: "dry-run-no-mutation",
      idempotencyKey: "idem",
      approvalLeaseId: "local-read-write",
    }],
    dispatches: [{
      taskId: "t1",
      routingSignals: { policyRisk: "low" },
      availabilityChecks: { reviewer: true },
    }],
    mcpPlans: [{ taskId: "t1", required: false, fallback: "none" }],
    retentionPolicy: { privacyMode: "summary", pruningCommand: "prune" },
    provenance: { taskIds: ["t1"], scoreTaskIds: ["t1"] },
  });
  assert.equal(result.pass, true);
  assert.equal(result.score, 10);
});
