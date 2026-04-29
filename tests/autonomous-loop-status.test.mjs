import assert from "node:assert/strict";
import test from "node:test";
import { createState, formatStatus } from "../scripts/lib/autonomous-loop-status.mjs";

test("status output follows explicit contract", () => {
  const text = formatStatus(createState({ runId: "loop-x", status: "COMPLETE" }));
  assert.match(text, /SUPERVIBE_LOOP_STATUS/);
  assert.match(text, /STATUS: COMPLETE/);
});
