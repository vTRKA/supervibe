import assert from "node:assert/strict";
import test from "node:test";
import {
  PRESET_NAMES,
  formatPresetSummary,
  selectReviewerPreset,
  selectWorkerPreset,
  validatePresetHandoff,
} from "../scripts/lib/supervibe-worker-reviewer-presets.mjs";

test("worker presets define context, write scope, evidence, and forbidden behavior", () => {
  const preset = selectWorkerPreset({ category: "integration", targetFiles: ["src/api.ts"] });

  assert.equal(preset.name, "integration worker");
  assert.ok(PRESET_NAMES.includes("security reviewer"));
  assert.ok(preset.contextPacketShape.includes("task"));
  assert.ok(preset.requiredEvidence.includes("integration evidence or blocked access gate"));
  assert.ok(preset.forbiddenBehavior.includes("provider bypass"));
  assert.match(formatPresetSummary(preset), /integration worker/);
});

test("reviewer presets cannot review their own worker output", () => {
  const reviewer = selectReviewerPreset({
    task: { category: "security", policyRiskLevel: "high" },
    workerAgentId: "security-auditor",
  });

  assert.equal(reviewer.name, "security reviewer");
  assert.notEqual(reviewer.agentId, "security-auditor");
  assert.equal(reviewer.independent, true);
});

test("preset handoff validates required review package shape", () => {
  const preset = selectWorkerPreset({ category: "documentation" });
  const valid = validatePresetHandoff({
    preset,
    handoff: {
      summary: "Updated docs",
      filesTouched: ["README.md"],
      verificationEvidence: ["npm run check"],
      confidenceScore: 10,
    },
  });
  const invalid = validatePresetHandoff({ preset, handoff: { summary: "missing" } });

  assert.equal(valid.ok, true);
  assert.equal(invalid.ok, false);
  assert.ok(invalid.missing.includes("filesTouched"));
});
