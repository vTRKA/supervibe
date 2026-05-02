import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runTaskLevelEvaluations } from "../scripts/regression-suite.mjs";

test("task-level eval harness scores final-upgrade workflows", async () => {
  const report = await runTaskLevelEvaluations({
    caseFile: "tests/fixtures/task-evals/final-upgrade-cases.json",
  });

  assert.equal(report.pass, true);
  assert.ok(report.score >= 9);
  assert.ok(report.cases.some((item) => item.id === "indexing-repair"));
  assert.ok(report.cases.some((item) => item.id === "unsafe-tool-refusal"));

  const fixture = JSON.parse(await readFile("tests/fixtures/task-evals/final-upgrade-cases.json", "utf8"));
  assert.ok(fixture.cases.length >= 5);
});
