import assert from "node:assert/strict";
import test from "node:test";
import {
  createQualityScorecard,
  formatQualityScorecard,
  QUALITY_SCORE_DIMENSIONS,
  summarizeQualityScorecards,
} from "../scripts/lib/autonomous-loop-quality-scorecard.mjs";
import { evaluateFinalAcceptance } from "../scripts/lib/autonomous-loop-final-acceptance.mjs";

test("quality scorecard calculates dimensions, metrics, and regression type", () => {
  const caseDef = {
    id: "worktree-run",
    category: "worktree",
    requiredEvidence: ["worktree_session", "verification_matrix"],
    inputArtifacts: {
      state: {
        tasks: [{ id: "t1", goal: "Small task", status: "complete" }],
        worktree_sessions: [{ sessionId: "s1" }],
        verification_matrix: [{ taskId: "t1", status: "pass" }],
      },
    },
    expected: { qualityMinScore: 7 },
  };
  const card = createQualityScorecard({
    caseDef,
    snapshot: { runId: "run1", readyFrontCount: 0, blockedCount: 0, nextAction: "archive worktree session" },
    comparison: { pass: true, diffs: [] },
    state: caseDef.inputArtifacts.state,
  });

  assert.ok(QUALITY_SCORE_DIMENSIONS.includes("worktreeIsolation"));
  assert.equal(card.pass, true);
  assert.equal(card.regressionType, "none");
  assert.match(formatQualityScorecard(card), /SCORE:/);
  assert.equal(summarizeQualityScorecards([card]).fail, 0);
});

test("quality gate distinguishes product regression and final acceptance can require eval report", () => {
  const card = createQualityScorecard({
    caseDef: { id: "case", category: "plan", inputArtifacts: { state: { tasks: [] } }, expected: { qualityMinScore: 7 } },
    snapshot: { runId: "run1", readyFrontCount: 0, blockedCount: 0, nextAction: "inspect" },
    comparison: { pass: false, diffs: [{ field: "status" }] },
  });
  const acceptance = evaluateFinalAcceptance({
    state: { schema_version: 1, command_version: 1, rubric_version: 1, plugin_version: "1.8.1", release_gate: { eval_replay_required: true } },
    preflight: { approval_lease: { scope: "local", environment: "test", budget: "none", duration: "none", expires_after_loops: 1, expires_at: "never", renewal_triggers: ["none"], tools: [] } },
    tasks: [],
    scores: [],
    retentionPolicy: { privacyMode: "local", pruningCommand: "prune" },
    provenance: { taskIds: ["t"], scoreTaskIds: ["t"] },
    evalReport: { pass: false, summary: { topRegressions: ["case"] } },
  });

  assert.equal(card.regressionType, "product-regression");
  assert.ok(acceptance.missing.some((item) => /autonomous loop replay eval/.test(item)));
});
