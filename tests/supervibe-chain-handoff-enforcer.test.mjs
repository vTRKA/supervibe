import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertRequiredHandoff,
  formatHandoff,
  getHandoffChain,
  getRequiredHandoff,
} from "../scripts/lib/supervibe-chain-handoff-enforcer.mjs";

describe("supervibe chain handoff enforcer", () => {
  it("requires brainstorm output to hand off to planning", () => {
    const handoff = getRequiredHandoff("brainstorm");
    assert.equal(handoff.command, "/supervibe-plan --from-brainstorm");
    assert.equal(handoff.nextQuestion, "Шаг 1/1: написать план реализации по утвержденной спецификации?");
    assert.ok(handoff.questionChoices.every((choice) => choice.label && choice.label !== choice.id && choice.tradeoff));
    assert.ok(handoff.questionChoices.some((choice) => /approved-spec-or-brainstorm-summary/.test(choice.label)));
  });

  it("detects missing review loop handoff after plan output", () => {
    const result = assertRequiredHandoff("plan", "Plan saved at .supervibe/artifacts/plans/example.md\nNext: execute");

    assert.equal(result.pass, false);
    assert.deepEqual(
      result.missing.map((item) => item.code),
      ["artifact", "command", "skill", "next-question"],
    );
  });

  it("passes when the required next command, skill, artifact, and question are present", () => {
    const output = formatHandoff("plan_review_passed");
    const result = assertRequiredHandoff("plan_review_passed", output);

    assert.equal(result.pass, true);
    assert.match(output, /Next command: \/supervibe-loop --atomize-plan <plan-path> --plan-review-passed/);
  });

  it("formats loop completion as a human-first decision card", () => {
    const output = formatHandoff("loop_completion");

    assert.match(output, /^Decision Card\nStage: loop_completion/m);
    assert.match(output, /Run \/supervibe-verify/);
    assert.match(output, /Run \/supervibe-review/);
    assert.match(output, /Continue loop/);
    assert.match(output, /Revise goals/);
    assert.match(output, /Stop with gaps/);
    assert.doesNotMatch(output, /Run \/supervibe-ship/);
    assert.ok(output.indexOf("Decision Card") < output.indexOf("NEXT_STEP_HANDOFF"));
  });

  it("allows ship choice only after review has passed", () => {
    const reviewPassedOutput = formatHandoff("review_passed");
    const verifyPassedOutput = formatHandoff("verify_passed");

    assert.match(reviewPassedOutput, /Run \/supervibe-ship/);
    assert.doesNotMatch(verifyPassedOutput, /Run \/supervibe-ship/);
    assert.match(verifyPassedOutput, /Continue loop/);
  });

  it("keeps the full chain in the expected order", () => {
    assert.deepEqual(
      getHandoffChain().map((item) => item.phase),
      ["brainstorm", "plan", "plan_review_passed", "atomized", "execution_preflight", "loop_completion", "verify_passed", "review_passed"],
    );
  });
});
