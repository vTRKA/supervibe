import assert from "node:assert/strict";
import test from "node:test";

import {
  parseLoopCliArgs,
  resolveWorkflowEvidenceModeFromArgs,
} from "../scripts/lib/supervibe-loop-cli-args.mjs";

test("loop CLI args normalize from-plan fast-start", () => {
  const args = parseLoopCliArgs(["--from-plan", "plan.md", "--start", "--dispatch"]);
  assert.equal(args["from-plan"], "plan.md");
  assert.equal(args["atomize-plan"], "plan.md");
  assert.equal(args["user-approved-plan"], true);
  assert.equal(args["fast-session"], true);
  assert.equal(args.dispatch, true);
});

test("loop CLI args preserve release-proof override", () => {
  const args = parseLoopCliArgs(["--from-plan", "plan.md", "--start", "--release-proof"]);
  assert.equal(args["fast-session"], undefined);
  assert.equal(resolveWorkflowEvidenceModeFromArgs(args, { planReviewPassed: false }), "release-proof");
});


test("plan-review-passed start stays fast-session unless release-proof is requested", () => {
  const args = parseLoopCliArgs(["--from-plan", "plan.md", "--start", "--plan-review-passed"]);
  assert.equal(args["fast-session"], true);
  assert.equal(resolveWorkflowEvidenceModeFromArgs(args, { planReviewPassed: true }), "fast-session");
});
