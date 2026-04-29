import assert from "node:assert/strict";
import test from "node:test";
import { createSideEffect, reconcileSideEffects } from "../scripts/lib/autonomous-loop-side-effect-ledger.mjs";

test("side-effect ledger requires reconciliation for unknown started actions", () => {
  const entry = createSideEffect({ status: "started" });
  assert.equal(reconcileSideEffects([entry]).status, "side_effect_reconciliation_required");
});
