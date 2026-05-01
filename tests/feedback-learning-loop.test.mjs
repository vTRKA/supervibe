import assert from "node:assert/strict";
import test from "node:test";

import {
  createFeedbackItem,
  evaluateFeedbackLearningQueue,
  formatFeedbackLearningReport,
  runFeedbackLearningSmoke,
} from "../scripts/lib/supervibe-feedback-learning-loop.mjs";

test("feedback learning loop promotes accepted corrections into memory and eval candidates", () => {
  const report = evaluateFeedbackLearningQueue([
    createFeedbackItem({
      id: "feedback-1",
      state: "accepted",
      userCorrection: "The agent skipped codegraph before refactor.",
      failureTaxonomy: "missing-codegraph",
      severity: "high",
      recurrence: 2,
      suggestedFix: "Require graph evidence before structural edits.",
      reviewerAction: "accept",
    }),
  ]);

  assert.equal(report.pass, true, formatFeedbackLearningReport(report));
  const promoted = report.reviewed[0];
  assert.ok(promoted.memoryCandidate, "feedback item missing annotation state, memory candidate, eval candidate or reviewer action");
  assert.ok(promoted.evalCandidate, "feedback item missing annotation state, memory candidate, eval candidate or reviewer action");
  assert.ok(promoted.regressionFixture, "feedback item missing annotation state, memory candidate, eval candidate or reviewer action");
});

test("feedback learning smoke is release-gate ready", () => {
  const report = runFeedbackLearningSmoke();
  assert.equal(report.pass, true, formatFeedbackLearningReport(report));
});
