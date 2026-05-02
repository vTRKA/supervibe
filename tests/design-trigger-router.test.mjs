import assert from "node:assert/strict";
import test from "node:test";
import { getTriggerIntentCorpus } from "../scripts/lib/supervibe-trigger-intent-corpus.mjs";
import { routeTriggerRequest } from "../scripts/lib/supervibe-trigger-router.mjs";

test("design triggers route through existing command surfaces only", () => {
  const allowed = new Set([
    "/supervibe-design",
    "/supervibe-design --target mobile-native",
    "/supervibe-design --chart-ux",
    "/supervibe-design --presentation",
    "/supervibe-design --brand-collateral",
    "/supervibe-design --handoff",
    "/supervibe-design --extend-system",
    "/supervibe-audit --design",
  ]);

  for (const entry of getTriggerIntentCorpus().filter((item) => item.intent.startsWith("design_") || [
    "mobile_ui",
    "chart_ux",
    "presentation_deck",
    "brand_collateral",
    "stack_ui_guidance",
  ].includes(item.intent))) {
    assert.equal(allowed.has(entry.command), true, entry.command);
    assert.equal(entry.command.startsWith("/supervibe-design") || entry.command.startsWith("/supervibe-audit"), true);
  }
});

test("routes Russian and English design intents without adding lookup commands", () => {
  const design = routeTriggerRequest("сделай дизайн профессиональным", {
    artifacts: { request: true, confirmedMutation: true },
  });
  assert.equal(design.intent, "design_new");
  assert.equal(design.command, "/supervibe-design");
  assert.equal(design.skill, "supervibe:prototype");

  const audit = routeTriggerRequest("run a design audit", {
    artifacts: { designArtifact: ".supervibe/artifacts/prototypes/app/index.html" },
  });
  assert.equal(audit.intent, "design_review");
  assert.equal(audit.command, "/supervibe-audit --design");

  const handoff = routeTriggerRequest("prepare shadcn ui handoff", {
    artifacts: { designSystemApproved: true, designArtifact: true, confirmedMutation: true },
  });
  assert.equal(handoff.intent, "stack_ui_guidance");
  assert.equal(handoff.command, "/supervibe-design --handoff");
  assert.deepEqual(handoff.missingArtifacts, []);
});

test("fuzzy design routing covers mobile, chart, and presentation requests", () => {
  assert.equal(routeTriggerRequest("сделай мобильный ui для онбординга", { artifacts: { request: true } }).intent, "mobile_ui");
  assert.equal(routeTriggerRequest("improve chart ux accessibility", { artifacts: { request: true } }).intent, "chart_ux");
  assert.equal(routeTriggerRequest("build presentation deck design", { artifacts: { request: true } }).intent, "presentation_deck");
});
