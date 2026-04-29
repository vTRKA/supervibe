import assert from "node:assert/strict";
import test from "node:test";
import { enforceTokenBudget } from "../scripts/lib/autonomous-loop-token-economy.mjs";

test("token budget stops oversized context", () => {
  assert.equal(enforceTokenBudget({ approximateTokenCost: 9000 }, 8000).status, "token_budget_stopped");
});
