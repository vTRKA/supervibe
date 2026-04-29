import assert from "node:assert/strict";
import test from "node:test";
import { createRetentionPolicy, redactSensitiveContent, retentionConfidenceCap } from "../scripts/lib/autonomous-loop-artifact-retention.mjs";

test("artifact retention redacts secrets and caps leaks", () => {
  assert.match(redactSensitiveContent("api_key=secret-value"), /\[REDACTED\]/);
  assert.equal(retentionConfidenceCap({ policy: createRetentionPolicy(), secretPersisted: true }), 5);
});
