import assert from "node:assert/strict";
import test from "node:test";
import { buildContextPlan, contextConfidenceCap } from "../scripts/lib/autonomous-loop-context-planner.mjs";

test("context planner records retrieval-first evidence", () => {
  const pack = buildContextPlan({ id: "t1", goal: "refactor public api", category: "refactor", acceptanceCriteria: [] }, {
    memoryEntries: [{ id: "m1" }],
    codeRagChunks: [{ file: "x" }],
    codeGraphEvidence: [{ edge: "a->b" }],
  });
  assert.equal(contextConfidenceCap({ goal: "refactor", category: "refactor" }, pack), 10);
});
