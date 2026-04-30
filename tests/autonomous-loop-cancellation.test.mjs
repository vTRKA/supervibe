import assert from "node:assert/strict";
import test from "node:test";
import { applyCancellation, canTerminateProcess, createCancellationToken } from "../scripts/lib/autonomous-loop-cancellation.mjs";

test("cancellation leaves user-owned processes untouched", () => {
  assert.equal(canTerminateProcess({ startedByLoop: false, trackedInSideEffectLedger: false }), false);
  assert.equal(canTerminateProcess({ startedByLoop: true, trackedInSideEffectLedger: true }), true);
});

test("cancellation marks incomplete tasks cancelled", () => {
  const state = applyCancellation({ run_id: "loop-x", tasks: [{ id: "a", status: "pending" }] }, createCancellationToken("loop-x"));
  assert.equal(state.tasks[0].status, "cancelled");
});

test("cancellation preserves open gates without approving or closing them", () => {
  const state = applyCancellation({
    run_id: "loop-x",
    tasks: [{ id: "a", status: "pending" }],
    gates: [{ gateId: "gate-1", status: "blocked", type: "human" }],
  }, createCancellationToken("loop-x"));

  assert.equal(state.gates[0].status, "blocked");
  assert.equal(state.gates[0].approvedBy, undefined);
});
