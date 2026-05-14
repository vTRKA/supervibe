import assert from "node:assert/strict";
import test from "node:test";

import { buildStageDecisionCard } from "../scripts/lib/supervibe-post-stage-actions.mjs";
import {
  validateNextActionContract,
  validateWorkflowResponseUx,
} from "../scripts/validate-next-action-contract.mjs";

test("workflow response UX accepts a human-first decision card with choices and resume state", () => {
  const card = buildStageDecisionCard({
    workflow: "verify-review-ship",
    currentStage: "review",
    artifact: ".supervibe/artifacts/reviews/workflow.md",
    recommendation: "Ship after review evidence is accepted.",
    question: "Step 3/4: ship the reviewed workflow?",
    resumeCursor: "verify-review-ship:review:ship-gate",
    nextCommand: "/supervibe-ship --from-review .supervibe/artifacts/reviews/workflow.md",
    choices: [
      { id: "ship", label: "Ship reviewed workflow", recommended: true },
      { id: "revise", label: "Revise before ship" },
    ],
  });

  const result = validateWorkflowResponseUx(card);

  assert.equal(result.pass, true);
  assert.deepEqual(result.issues, []);
});

test("workflow response UX rejects raw NEXT_STEP_HANDOFF as the visible response", () => {
  const result = validateWorkflowResponseUx(`NEXT_STEP_HANDOFF
Current phase: plan
Next command: /supervibe-plan --review plan.md
END_NEXT_STEP_HANDOFF`);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "workflow-response-raw-handoff-primary-ux"));
});

test("workflow response UX rejects missing next choices", () => {
  const result = validateWorkflowResponseUx({
    primaryUx: "Decision Card\nStage: plan\nRecommendation: Review the plan.\nQuestion: Step 1/1: run review?\nResume: plan:review",
    resumeCursor: "plan:review",
  });

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "next-action-choices-missing"));
});

test("next action contract rejects raw handoff leakage before a human question", () => {
  const result = validateNextActionContract({
    primaryUx: "NEXT_STEP_HANDOFF\nCurrent phase: plan\nEND_NEXT_STEP_HANDOFF\n\nStep 1/1: run review?",
    resumeCursor: "plan:review",
    choices: [
      { id: "run_review", label: "Run review" },
      { id: "stop", label: "Stop" },
    ],
  });

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "next-action-raw-handoff-primary-ux"));
});
