import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  diagnoseTriggerRequest,
  formatTriggerDiagnostic,
} from "../scripts/lib/supervibe-trigger-diagnostics.mjs";

describe("supervibe trigger diagnostics", () => {
  it("explains matched triggers and missing artifact context", () => {
    const report = diagnoseTriggerRequest("сделал план, проверь его");

    assert.equal(report.route.intent, "plan_review");
    assert.equal(report.pass, false);
    assert.equal(report.evidence.missingArtifacts.includes("plan-path-or-plan-content"), true);
    assert.equal(report.likelyCause, "The trigger matched, but required artifact context is missing.");
  });

  it("formats a compact diagnostic with command and next question", () => {
    const report = diagnoseTriggerRequest("я сделал брейншторм", {
      artifacts: { brainstormSummary: true },
    });
    const text = formatTriggerDiagnostic(report);

    assert.match(text, /Intent: brainstorm_to_plan/);
    assert.match(text, /Command: \/supervibe-plan/);
    assert.match(text, /Следующий шаг - написать план/);
  });
});
