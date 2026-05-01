import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  evaluateScenarioFlows,
  formatScenarioEvaluation,
} from "../scripts/lib/supervibe-command-state.mjs";

test("scenario evals verify user-visible outcomes, not only intent labels", async () => {
  const scenarios = JSON.parse(await readFile("tests/fixtures/scenario-evals/supervibe-user-flows.json", "utf8"));
  const evaluation = evaluateScenarioFlows(scenarios);

  assert.equal(evaluation.pass, true, formatScenarioEvaluation(evaluation));
  assert.equal(evaluation.total, scenarios.length);
  for (const result of evaluation.results) {
    assert.equal(result.state.persistedBeforeWait, true, `${result.id} state was not persisted before wait`);
    assert.equal(result.state.claimsDoneWithoutChoice, false, `${result.id} claimed done without user choice`);
  }
});
