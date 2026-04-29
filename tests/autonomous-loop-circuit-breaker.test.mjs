import assert from "node:assert/strict";
import test from "node:test";
import { shouldOpenCircuit } from "../scripts/lib/autonomous-loop-circuit-breaker.mjs";

test("circuit opens after three no-progress loops", () => {
  const result = shouldOpenCircuit([{ progress: false }, { progress: false }, { progress: false }]);
  assert.equal(result.open, true);
  assert.equal(result.reason, "no_progress_for_3_loops");
});
