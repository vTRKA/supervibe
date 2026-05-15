import assert from "node:assert/strict";
import test from "node:test";

import {
  WORKFLOW_SUMMARY_ARTIFACT_ROOT,
  WORKFLOW_SUMMARY_ARTIFACT_SCHEMA_VERSION,
  buildStageDecisionCard,
  buildWorkflowSummaryArtifact,
  evaluateWorkflowSummaryApproval,
  evaluateWorkflowSummaryFreshness,
  formatStageDecisionCard,
  formatWorkflowSummaryArtifact,
  hashWorkflowSummaryArtifact,
  validateWorkflowSummaryArtifact,
  workflowSummaryStageChoices,
} from "../scripts/lib/supervibe-post-stage-actions.mjs";
import {
  WORKFLOW_SUMMARY_APPROVAL_SOURCE as CONTRACT_APPROVAL_SOURCE,
  WORKFLOW_SUMMARY_ARTIFACT_ROOT as CONTRACT_ARTIFACT_ROOT,
  WORKFLOW_SUMMARY_ARTIFACT_SCHEMA_PATH,
  WORKFLOW_SUMMARY_ARTIFACT_SCHEMA_VERSION as CONTRACT_SCHEMA_VERSION,
  WORKFLOW_SUMMARY_CONFIDENCE_CAPS,
  WORKFLOW_SUMMARY_HASH_ALGORITHM,
  WORKFLOW_SUMMARY_PRE_STAGES,
  WORKFLOW_SUMMARY_RECEIPT_CATEGORIES,
  workflowSummaryArtifactFilePattern,
  workflowSummaryStageConfig,
  workflowSummaryStageChoices as contractWorkflowSummaryStageChoices,
  workflowSummaryStageFromIntent,
} from "../scripts/lib/workflow-summary-contract.mjs";

test("post-stage action cards put the human decision before machine handoff state", () => {
  const card = buildStageDecisionCard({
    workflow: "verify-review-ship",
    currentStage: "plan",
    artifact: ".supervibe/artifacts/plans/workflow.md",
    recommendation: "Run the plan review loop before atomization.",
    why: "Execution remains blocked until reviewer coverage and next-decision evidence exist.",
    question: "Step 2/4: run the plan review loop?",
    resumeCursor: "verify-review-ship:plan:review-gate",
    nextCommand: "/supervibe-plan --review .supervibe/artifacts/plans/workflow.md",
    choices: [
      { id: "run_review", label: "Run plan review", recommended: true },
      { id: "revise_plan", label: "Revise plan first" },
      { id: "stop", label: "Keep plan draft and stop" },
    ],
  });

  assert.match(card.primaryUx, /^Decision Card\nStage: plan/m);
  assert.match(card.primaryUx, /Recommendation: Run the plan review loop before atomization\./);
  assert.match(card.primaryUx, /Step 2\/4: run the plan review loop\?/);
  assert.match(card.primaryUx, /1\. Run plan review \(recommended\)/);
  assert.match(card.primaryUx, /Resume: verify-review-ship:plan:review-gate/);
  assert.doesNotMatch(card.primaryUx, /NEXT_STEP_HANDOFF/);
  assert.match(card.machineHandoff, /^NEXT_STEP_HANDOFF/m);
});

test("formatted post-stage action output remains readable and deterministic", () => {
  const output = formatStageDecisionCard({
    workflow: "brainstorm",
    currentStage: "spec",
    artifact: ".supervibe/artifacts/specs/example.md",
    recommendation: "Approve the spec and write the implementation plan.",
    question: "Step 1/3: writing the implementation plan?",
    resumeCursor: "brainstorm:spec:plan-gate",
    nextCommand: "/supervibe-plan --from-brainstorm .supervibe/artifacts/specs/example.md",
    choices: [
      { id: "write_plan", label: "Approve spec and write plan", recommended: true },
      { id: "revise_spec", label: "Revise idea/spec" },
    ],
  });

  assert.match(output, /^Decision Card\n/m);
  assert.match(output, /\nChoices:\n1\. Approve spec and write plan \(recommended\)\n2\. Revise idea\/spec\n/);
  assert.ok(output.indexOf("Decision Card") < output.indexOf("Machine Handoff"));
  assert.ok(output.indexOf("Machine Handoff") < output.indexOf("NEXT_STEP_HANDOFF"));
});


test("workflow summary artifacts support post-spec and post-plan visual contracts", () => {
  for (const stage of ["post-spec", "post-plan"]) {
    const artifact = buildWorkflowSummaryArtifact({
      stage,
      workflowId: "summary-contract-test",
      createdAt: "2026-05-15T00:00:00.000Z",
      sourcePrompt: "Create source-bound post summary",
      sourceArtifact: {
        kind: stage === "post-spec" ? "spec" : "plan",
        path: stage === "post-spec" ? ".supervibe/artifacts/specs/example.md" : ".supervibe/artifacts/plans/example.md",
        hash: "sha256:" + "a".repeat(64),
        hashAlgorithm: "sha256",
        capturedAt: "2026-05-15T00:00:00.000Z",
      },
      addedAndWhy: ["Added durable post-stage explanation because the next stage depends on it."],
      deferredAndWhy: ["Deferred execution until approval."],
      validationResult: "source artifact validated before summary",
    });

    assert.deepEqual(validateWorkflowSummaryArtifact(artifact), []);
    assert.equal(artifact.visualSummary.summaryTable.length >= 2, true);
    assert.equal(artifact.visualSummary.asciiMap.length >= 2, true);
    assert.match(formatWorkflowSummaryArtifact(artifact), /| Field | Value |/);
    assert.match(formatWorkflowSummaryArtifact(artifact), /Lifecycle Map/);
    assert.equal(workflowSummaryStageChoices(stage).length >= 3, true);
  }
});

test("post-stage summaries reject stale or unbound source artifacts", () => {
  const artifact = buildWorkflowSummaryArtifact({
    stage: "post-plan",
    workflowId: "summary-contract-test",
    sourcePrompt: "Create source-bound post plan summary",
  });

  const issues = validateWorkflowSummaryArtifact(artifact).join("\n");
  assert.match(issues, /WSA_SOURCE_ARTIFACT_HASH/);
  assert.match(issues, /WSA_STALE_BLOCKS_POST_STAGE/);
});


test("workflow summary freshness detects changed source hashes", () => {
  const artifact = buildWorkflowSummaryArtifact({
    stage: "post-plan",
    workflowId: "summary-freshness-test",
    createdAt: "2026-05-15T00:00:00.000Z",
    sourcePrompt: "Create source-bound post plan summary",
    sourceArtifact: {
      kind: "plan",
      path: ".supervibe/artifacts/plans/example.md",
      hash: "sha256:" + "b".repeat(64),
    },
    addedAndWhy: ["Added a durable summary because review depends on the saved plan."],
    validationResult: "plan validator passed before summary",
  });

  assert.equal(evaluateWorkflowSummaryFreshness({ artifact }).status, "current");
  const stale = evaluateWorkflowSummaryFreshness({ artifact, currentSourceHash: "sha256:" + "c".repeat(64) });
  assert.equal(stale.status, "stale");
  assert.equal(stale.current, false);
});

test("workflow summary approval rejects stale pre-stage summaries", () => {
  const artifact = buildWorkflowSummaryArtifact({
    stage: "pre-plan",
    workflowId: "summary-approval-test",
    createdAt: "2026-05-15T00:00:00.000Z",
    sourcePrompt: "Create pre-plan summary",
    staleState: { status: "stale", reason: "source changed", checkedAt: "2026-05-15T00:00:00.000Z" },
  });

  const result = evaluateWorkflowSummaryApproval({
    artifact,
    approval: {
      source: "latest-user-gate",
      selectedChoiceId: "approve-pre-plan-summary",
      sourcePromptHash: artifact.sourcePrompt.hash,
      artifactHash: artifact.artifactHash,
      userMessage: "Approved",
    },
    now: "2026-05-15T00:01:00.000Z",
  });

  assert.equal(result.approved, false);
  assert.equal(result.reason, "summary-source-artifact-stale");
});


test("workflow summary contract exports stay connected to runtime artifacts", () => {
  const artifact = buildWorkflowSummaryArtifact({
    stage: "pre-spec",
    workflowId: "summary-export-contract",
    sourcePrompt: "Verify exported workflow summary contract constants",
  });

  assert.equal(WORKFLOW_SUMMARY_ARTIFACT_SCHEMA_VERSION, CONTRACT_SCHEMA_VERSION);
  assert.equal(WORKFLOW_SUMMARY_ARTIFACT_ROOT, CONTRACT_ARTIFACT_ROOT);
  assert.equal(WORKFLOW_SUMMARY_ARTIFACT_SCHEMA_PATH, "docs/templates/workflow-summary-artifact.schema.json");
  assert.equal(CONTRACT_APPROVAL_SOURCE, "latest-user-gate");
  assert.equal(WORKFLOW_SUMMARY_HASH_ALGORITHM, "sha256");
  assert.deepEqual(WORKFLOW_SUMMARY_PRE_STAGES, ["pre-spec", "pre-plan"]);
  assert.ok(WORKFLOW_SUMMARY_RECEIPT_CATEGORIES.includes("approval-gate"));
  assert.equal(WORKFLOW_SUMMARY_CONFIDENCE_CAPS.missingFinalValidation, 7);
  assert.equal(workflowSummaryStageConfig("before-spec").fileName, "pre-spec-summary.json");
  assert.match(workflowSummaryArtifactFilePattern(), /post-plan-summary/);
  assert.equal(workflowSummaryStageFromIntent("post_plan_summary_gate"), "post-plan");
  assert.equal(contractWorkflowSummaryStageChoices("post-spec").length >= 3, true);
  assert.equal(hashWorkflowSummaryArtifact(artifact), artifact.artifactHash);
});
