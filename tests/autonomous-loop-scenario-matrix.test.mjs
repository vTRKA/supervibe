import assert from "node:assert/strict";
import test from "node:test";
import { buildScenarioMatrix, hasScenarioCoverage } from "../scripts/lib/autonomous-loop-scenario-matrix.mjs";

test("scenario matrix covers common autonomous loop requests", () => {
  assert.equal(hasScenarioCoverage(buildScenarioMatrix()).ok, true);
});
