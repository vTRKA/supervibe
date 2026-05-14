import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWorkflowSummaryArtifact,
  formatWorkflowSummaryArtifact,
  validateWorkflowSummaryArtifact,
} from "../scripts/lib/supervibe-post-stage-actions.mjs";

test("pre-plan human summary carries scope, constraints, assumptions, choices, and evidence", () => {
  const artifact = buildWorkflowSummaryArtifact({
    stage: "pre-plan",
    workflowId: "2026-05-14-supervibe-logic-10-of-10",
    sourcePrompt: "Create a reviewed implementation plan for workflow logic hardening.",
    createdAt: "2026-05-14T12:00:00.000Z",
    expiresAt: "2026-05-21T12:00:00.000Z",
    objective: "Prepare the implementation plan without execution.",
    approvedScope: ["summary gates", "plan approval contract"],
    constraints: ["do not execute plan work", "do not touch command docs"],
    planningAssumptions: ["reviewers approve before atomization"],
    evidence: ["temporary plan Task T3", "write-set restriction"],
  });

  assert.deepEqual(validateWorkflowSummaryArtifact(artifact), []);
  assert.equal(artifact.storagePath, ".supervibe/artifacts/summaries/2026-05-14-supervibe-logic-10-of-10/pre-plan-summary.json");
  assert.equal(artifact.approvalState.status, "pending");
  assert.equal(artifact.approvalState.approvalSource, "latest-user-gate");
  assert.ok(artifact.approvalState.allowedChoiceIds.includes("approve-pre-plan-summary"));
  assert.ok(artifact.choices.some((choice) => choice.id === "approve-pre-plan-summary"));
  assert.ok(artifact.evidenceAppendix.items.includes("temporary plan Task T3"));

  const text = formatWorkflowSummaryArtifact(artifact);
  assert.match(text, /Workflow Summary/);
  assert.match(text, /Stage: pre-plan/);
  assert.match(text, /Storage path: \.supervibe\/artifacts\/summaries\/2026-05-14-supervibe-logic-10-of-10\/pre-plan-summary\.json/);
  assert.match(text, /Source prompt hash: sha256:/);
  assert.match(text, /Artifact hash: sha256:/);
  assert.match(text, /Approval state: pending/);
  assert.match(text, /Approved scope:/);
  assert.match(text, /Constraints:/);
  assert.match(text, /Planning assumptions:/);
  assert.match(text, /approve-pre-plan-summary/);
  assert.match(text, /Evidence appendix:/);
});
