import assert from "node:assert/strict";
import test from "node:test";
import { budgetRemaining, budgetStatus, createBudget } from "../scripts/lib/autonomous-loop-budget.mjs";

test("budget stops loop over max loops", () => {
  const budget = createBudget({ maxLoops: 1 });
  assert.equal(budgetStatus(budget, { loops: 2 }).status, "budget_stopped");
  assert.equal(budgetRemaining(budget, { loops: 1 }).loops, 0);
});
