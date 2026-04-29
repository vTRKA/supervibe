import assert from "node:assert/strict";
import test from "node:test";
import { detectRuntimeEnvironment, runtimeEvidenceCap } from "../scripts/lib/autonomous-loop-runtime-environment.mjs";

test("runtime classifier separates production and Docker", () => {
  assert.equal(detectRuntimeEnvironment({ request: "deploy production server" }).riskClass, "high");
  assert.equal(detectRuntimeEnvironment({ request: "docker compose health check" }).riskClass, "medium");
});

test("remote mutation without approval caps confidence", () => {
  assert.equal(runtimeEvidenceCap({ remoteMutationAttemptedWithoutApproval: true }), 6);
});
