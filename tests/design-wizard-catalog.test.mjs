import assert from "node:assert/strict";
import test from "node:test";

import {
  DESIGN_WIZARD_AXES,
  buildDesignWizardState,
  formatDesignWizardQuestion,
  parseDesignBriefPreferences,
  recordDesignWizardAnswer,
  resolveDesignViewportPolicy,
} from "../scripts/lib/design-wizard-catalog.mjs";

test("design wizard parses brief coverage and keeps missing axes in the queue", () => {
  const parsed = parseDesignBriefPreferences("Use graphite cyan, compact density, Radix, subtle motion, and 1440x900.");
  assert.equal(parsed.decisions.palette_mood.choiceId, "graphite-cyan");
  assert.equal(parsed.decisions.information_density.choiceId, "compact");
  assert.equal(parsed.decisions.component_feel.choiceId, "radix-headless");
  assert.equal(parsed.decisions.motion_intensity.choiceId, "subtle");
  assert.equal(parsed.decisions.viewport.answer, "1440x900");

  const state = buildDesignWizardState({
    brief: "Use graphite cyan, compact density, Radix, subtle motion.",
    target: "web",
    mode: "design-system-only",
  });

  assert.equal(state.coverage.score, `4/${DESIGN_WIZARD_AXES.length}`);
  assert.equal(state.gates.tokensUnlocked, false);
  assert.ok(state.questionQueue.some((question) => question.axis === "typography_personality"));
  assert.ok(state.questionQueue.every((question) => question.axis === "viewport" || (question.choices || []).length >= 3));
});

test("explicit defaults create editable guided checklist instead of silent collapse", () => {
  const state = buildDesignWizardState({
    brief: "Use safe defaults for a new design system.",
    target: "web",
    mode: "design-system-only",
    timestamp: "2026-05-03T00:00:00.000Z",
  });

  assert.equal(state.explicitDefaults, true);
  assert.equal(state.coverage.score, `${DESIGN_WIZARD_AXES.length}/${DESIGN_WIZARD_AXES.length}`);
  assert.equal(state.gates.tokensUnlocked, true);
  assert.equal(state.guidedDefaultsChecklist.length, DESIGN_WIZARD_AXES.length);
  assert.ok(state.guidedDefaultsChecklist.every((item) => {
    return item.actions.map((action) => action.id).join(",") === "accept-default,compare-alternatives,customize";
  }));
});

test("desktop viewport policy prefers actual window metadata over web defaults", () => {
  const tauri = resolveDesignViewportPolicy({
    target: "tauri",
    currentWindow: { width: 1366, height: 768 },
    deviceScaleFactor: 1.25,
  });

  assert.equal(tauri.requiresActualWindowQuestion, true);
  assert.equal(tauri.defaultViewports[0].exactWindow, true);
  assert.equal(tauri.defaultViewports[0].deviceScaleFactor, 1.25);
  assert.ok(tauri.requiredMetadata.includes("mainWindow"));
  assert.ok(tauri.requiredMetadata.includes("secondaryWindow"));
  assert.ok(tauri.choices.some((choice) => choice.id === "actual-window"));

  const web = resolveDesignViewportPolicy({ target: "web" });
  assert.deepEqual(web.defaultViewports.map((viewport) => viewport.width), [375, 1440]);
});

test("wizard answers update state and formatted questions include decision context", () => {
  const state = buildDesignWizardState({ brief: "", target: "web", mode: "design-system-only" });
  const updated = recordDesignWizardAnswer(state, {
    axis: "typography_personality",
    choiceId: "humanist",
    source: "user",
    timestamp: "2026-05-03T00:00:00.000Z",
  });
  assert.equal(updated.decisions.typography_personality.choiceId, "humanist");
  assert.ok(!updated.questionQueue.some((question) => question.axis === "typography_personality"));

  const markdown = formatDesignWizardQuestion(state.questionQueue.find((question) => question.axis === "visual_direction_tone"));
  assert.match(markdown, /Why:/);
  assert.match(markdown, /Decision unlocked:/);
  assert.match(markdown, /Free-form answer:/);
  assert.match(markdown, /Stop condition:/);
});
