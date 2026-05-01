import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  evaluateContextThreatCases,
  formatContextThreatModelReport,
} from "../scripts/lib/supervibe-context-threat-model.mjs";

test("context threat model blocks injection and exfiltration fixtures", async () => {
  const cases = JSON.parse(await readFile("tests/fixtures/adversarial-context-prompts.json", "utf8"));
  const report = evaluateContextThreatCases(cases);

  assert.equal(report.pass, true, formatContextThreatModelReport(report));
  assert.ok(report.results.some((result) => result.vector === "source-comment" && result.actual.blockedInstruction));
  assert.ok(report.results.some((result) => result.vector === "secret" && result.actual.redacted));
  assert.ok(report.results.some((result) => result.vector === "path-traversal" && result.actual.requiresApproval));
});
