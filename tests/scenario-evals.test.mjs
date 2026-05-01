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
    if (result.route.intent === "genesis_setup") {
      const prompt = result.state.lastPostDeliveryPrompt;
      const labels = (prompt?.choices || []).map((choice) => choice.label);

      assert.equal(prompt?.context, "genesis_setup", `${result.id} did not use genesis dialogue context`);
      assert.doesNotMatch(prompt?.prompt || "", /what should happen next|что делаем дальше/i, `${result.id} used a generic next-step prompt`);
      assert.ok(
        labels.includes("Apply scaffold") || labels.includes("Применить scaffold"),
        `${result.id} did not expose a scaffold-specific apply action: ${labels.join(", ")}`
      );
    }
  }
});
