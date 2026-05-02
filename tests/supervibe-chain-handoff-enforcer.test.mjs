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
    assert.equal(handoff.command, "/supervibe-plan");
    assert.equal(handoff.nextQuestion, "Шаг 1/1: написать план реализации по утвержденной спецификации?");
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
  });

  it("keeps the full chain in the expected order", () => {
    assert.deepEqual(
      getHandoffChain().map((item) => item.phase),
      ["brainstorm", "plan", "plan_review_passed", "atomized", "execution_preflight"],
    );
  });
});
