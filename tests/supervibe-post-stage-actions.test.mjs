import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStageDecisionCard,
  formatStageDecisionCard,
} from "../scripts/lib/supervibe-post-stage-actions.mjs";

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
