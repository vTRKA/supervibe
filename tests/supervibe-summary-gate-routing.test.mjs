import assert from "node:assert/strict";
import test from "node:test";

import { routeTriggerRequest } from "../scripts/lib/supervibe-trigger-router.mjs";

test("routes pre-spec summary requests to a durable approval gate", () => {
  const route = routeTriggerRequest("show a pre-spec summary before writing the requirements spec", {
    artifacts: { workflowId: "2026-05-14-supervibe-logic-10-of-10" },
  });

  assert.equal(route.intent, "pre_spec_summary_gate");
  assert.equal(route.command, "/supervibe-brainstorm --summary-gate --stage pre-spec");
  assert.equal(route.skill, "supervibe:brainstorming");
  assert.equal(route.summaryApprovalContract.stage, "pre-spec");
  assert.equal(route.summaryApprovalContract.storagePath, ".supervibe/artifacts/summaries/2026-05-14-supervibe-logic-10-of-10/pre-spec-summary.json");
  assert.equal(route.summaryApprovalContract.schemaPath, "docs/templates/workflow-summary-artifact.schema.json");
  assert.equal(route.summaryApprovalContract.approvalSource, "latest-user-gate");
  assert.equal(route.summaryApprovalContract.approveChoiceId, "approve-pre-spec-summary");
  assert.ok(route.summaryApprovalContract.rejectSources.includes("quoted-prior-text"));
  assert.ok(route.summaryApprovalContract.rejectSources.includes("old-prompt-content"));
  assert.ok(route.summaryApprovalContract.rejectSources.includes("embedded-slash-command"));
  assert.ok(route.summaryApprovalContract.rejectSources.includes("summary-body-text"));
  assert.ok(route.requiredSafety.includes("summary-before-spec-approval"));
  assert.ok(route.requiredSafety.includes("latest-user-summary-approval"));
  assert.ok(route.questionChoices.some((choice) => choice.id === "approve-pre-spec-summary"));
  assert.deepEqual(route.missingArtifacts, []);
});

test("routes pre-plan summary requests to a scope-bound approval gate", () => {
  const route = routeTriggerRequest("show the pre-plan summary before creating the implementation plan", {
    artifacts: {
      workflowId: "2026-05-14-supervibe-logic-10-of-10",
      approvedScope: true,
    },
  });

  assert.equal(route.intent, "pre_plan_summary_gate");
  assert.equal(route.command, "/supervibe-plan --summary-gate --stage pre-plan");
  assert.equal(route.skill, "supervibe:writing-plans");
  assert.equal(route.summaryApprovalContract.stage, "pre-plan");
  assert.equal(route.summaryApprovalContract.storagePath, ".supervibe/artifacts/summaries/2026-05-14-supervibe-logic-10-of-10/pre-plan-summary.json");
  assert.equal(route.summaryApprovalContract.approvalState, "pending");
  assert.equal(route.summaryApprovalContract.approveChoiceId, "approve-pre-plan-summary");
  assert.ok(route.requiredSafety.includes("summary-before-plan-approval"));
  assert.ok(route.requiredSafety.includes("source-prompt-hash-bound"));
  assert.ok(route.requiredSafety.includes("summary-artifact-hash-bound"));
  assert.ok(route.questionEvidence.some((item) => item.includes("summaryStoragePath=")));
  assert.deepEqual(route.missingArtifacts, []);
});

test("pre-plan summary gate exposes a blocker when approved scope or spec evidence is missing", () => {
  const route = routeTriggerRequest("show pre-plan summary before planning", {
    artifacts: { workflowId: "logic-10-of-10" },
  });

  assert.equal(route.intent, "pre_plan_summary_gate");
  assert.ok(route.missingArtifacts.includes("approved-scope-or-spec"));
  assert.equal(route.summaryApprovalContract.approveChoiceId, "approve-pre-plan-summary");
});
