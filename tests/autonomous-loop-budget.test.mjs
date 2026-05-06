import assert from "node:assert/strict";
import test from "node:test";
import { budgetRemaining, budgetStatus, createBudget } from "../scripts/lib/autonomous-loop-budget.mjs";

test("default loop budget is goal-until-complete without implicit loop or time limits", () => {
  const budget = createBudget();
  assert.equal(budget.maxLoops, null);
  assert.equal(budget.maxRuntimeMinutes, null);
  assert.equal(budgetStatus(budget, { loops: 10_000, runtimeMinutes: 10_000 }).status, "within_budget");
  assert.equal(budgetRemaining(budget, { loops: 10_000 }).loops, null);
});

test("budget stops loop over max loops", () => {
  const budget = createBudget({ maxLoops: 1 });
  assert.equal(budgetStatus(budget, { loops: 2 }).status, "budget_stopped");
  assert.equal(budgetRemaining(budget, { loops: 1 }).loops, 0);
});
