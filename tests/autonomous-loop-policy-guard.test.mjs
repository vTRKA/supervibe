import assert from "node:assert/strict";
import test from "node:test";
import { approvalLeaseAllows, classifyPolicyRisk, guardAction } from "../scripts/lib/autonomous-loop-policy-guard.mjs";

test("production deployment requires approval", () => {
  const action = { type: "production deploy", environment: "production" };
  assert.equal(classifyPolicyRisk(action), "high");
  assert.equal(guardAction(action).allowed, false);
  assert.equal(approvalLeaseAllows({ environment: "staging" }, action), false);
});

test("disallowed bypass request is blocked", () => {
  assert.equal(guardAction({ description: "rate-limit bypass" }).status, "policy_stopped");
});

test("negative safety checklist mentioning bypass is allowed", () => {
  assert.equal(guardAction({ description: "The command never documents provider bypass behavior." }).status, "allowed");
});
