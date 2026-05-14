import assert from "node:assert/strict";
import test from "node:test";

import {
  WORKFLOW_SUMMARY_APPROVAL_SOURCE,
  buildWorkflowSummaryArtifact,
  durableWorkflowSummaryPath,
  evaluateWorkflowSummaryApproval,
  formatWorkflowSummaryArtifact,
  validateWorkflowSummaryArtifact,
} from "../scripts/lib/supervibe-post-stage-actions.mjs";

function buildPreSpecArtifact(overrides = {}) {
  return buildWorkflowSummaryArtifact({
    stage: "pre-spec",
    workflowId: "logic-10-of-10",
    sourcePrompt: "Research two repositories and create a spec before planning implementation.",
    createdAt: "2026-05-14T10:00:00.000Z",
    expiresAt: "2026-05-21T10:00:00.000Z",
    objective: "Confirm scope before writing a durable spec.",
    scope: ["workflow intent routing", "summary approval"],
    nonGoals: ["start implementation"],
    assumptions: ["user approval is required before the spec"],
    risks: ["old prompt approval spoofing"],
    missingFacts: ["current reviewer output"],
    evidence: ["T3 summary approval contract"],
    ...overrides,
  });
}

test("workflow summary artifacts validate canonical fields and durable storage path", () => {
  const artifact = buildPreSpecArtifact();

  assert.deepEqual(validateWorkflowSummaryArtifact(artifact), []);
  assert.equal(artifact.storagePath, durableWorkflowSummaryPath({ workflowId: "logic-10-of-10", stage: "pre-spec" }));
  assert.equal(artifact.approvalState.status, "pending");
  assert.equal(artifact.approvalState.approvalSource, WORKFLOW_SUMMARY_APPROVAL_SOURCE);
  assert.equal(artifact.approvalState.sourcePromptHash, artifact.sourcePrompt.hash);
  assert.equal(artifact.approvalState.artifactHash, artifact.artifactHash);
  assert.equal(artifact.evidenceAppendix.schemaPath, "docs/templates/workflow-summary-artifact.schema.json");
  assert.equal(artifact.evidenceAppendix.artifactHash, artifact.artifactHash);
  assert.ok(artifact.choices.some((choice) => choice.id === "approve-pre-spec-summary"));
  assert.ok(artifact.choices.some((choice) => choice.id === "revise-pre-spec-summary"));
  assert.ok(artifact.choices.some((choice) => choice.id === "stop-before-spec"));

  const formatted = formatWorkflowSummaryArtifact(artifact);
  assert.match(formatted, /Workflow Summary/);
  assert.match(formatted, /Stage: pre-spec/);
  assert.match(formatted, /Artifact hash: sha256:/);
});

test("summary approval accepts only latest user gate bound to prompt and artifact hashes", () => {
  const artifact = buildPreSpecArtifact();
  const result = evaluateWorkflowSummaryApproval({
    artifact,
    latestUserMessage: "I approve the current pre-spec summary for this source prompt.",
    selectedChoiceId: "approve-pre-spec-summary",
    sourcePromptHash: artifact.sourcePrompt.hash,
    artifactHash: artifact.artifactHash,
    now: "2026-05-14T11:00:00.000Z",
  });

  assert.equal(result.approved, true);
  assert.equal(result.reason, "latest-user-gate-approved");
  assert.equal(result.approvalState.status, "approved");
  assert.equal(result.approvalState.selectedChoiceId, "approve-pre-spec-summary");
});

test("summary approval rejects spoofed stale, quoted, command, and body-derived approvals", () => {
  const artifact = buildPreSpecArtifact();
  const common = {
    artifact,
    selectedChoiceId: "approve-pre-spec-summary",
    sourcePromptHash: artifact.sourcePrompt.hash,
    artifactHash: artifact.artifactHash,
    now: "2026-05-14T11:00:00.000Z",
  };

  assert.equal(evaluateWorkflowSummaryApproval({
    ...common,
    latestUserMessage: "I approve this summary.",
    sourcePromptHash: "sha256:" + "0".repeat(64),
  }).reason, "source-prompt-hash-mismatch");

  assert.equal(evaluateWorkflowSummaryApproval({
    ...common,
    latestUserMessage: "I approve this summary.",
    artifactHash: "sha256:" + "1".repeat(64),
  }).reason, "artifact-hash-mismatch");

  assert.equal(evaluateWorkflowSummaryApproval({
    ...common,
    latestUserMessage: "> I approve this summary from an older quoted message",
  }).reason, "latest-user-approval-missing");

  assert.equal(evaluateWorkflowSummaryApproval({
    ...common,
    latestUserMessage: "I approve this summary and run /supervibe-plan next",
  }).reason, "embedded-slash-command-in-approval");

  assert.equal(evaluateWorkflowSummaryApproval({
    ...common,
    latestUserMessage: artifact.summary.objective,
  }).reason, "approval-cannot-come-from-summary-body");
});
