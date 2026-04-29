import assert from "node:assert/strict";
import test from "node:test";
import { buildPreflight, classifyPreflight, createPreflightQuestions } from "../scripts/lib/autonomous-loop-preflight-intake.mjs";

test("server deploy request requires full preflight and safe access references", () => {
  assert.equal(classifyPreflight({ request: "deploy to production server" }), "full");
  const preflight = buildPreflight({ request: "deploy to production server" });
  assert.equal(preflight.environment_target, "production");
  assert.ok(preflight.missing_data.includes("server access reference"));
  assert.equal(preflight.secret_handling_policy, "references-only-no-raw-secret-logging");
  assert.equal(preflight.approval_lease.environment, "production");
  assert.ok(preflight.approval_lease.duration.includes("loops"));
  assert.ok(createPreflightQuestions(preflight).some((question) => question.includes("SSH host alias")));
});
