import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildCommandQuestionSurface,
  goldenAntiTemplateQuestions,
  QUESTION_SURFACE_SCHEMA_VERSION,
  validateAllCommandQuestionSurfaces,
  validateQuestionSurface,
  validateStaticQuestionSurfaceBypasses,
} from "../scripts/lib/question-surface-contract.mjs";
import { validateAgenticQuestion } from "../scripts/lib/supervibe-dialogue-contract.mjs";
import { routeTriggerRequest } from "../scripts/lib/supervibe-trigger-router.mjs";

test("command question surfaces are valid for every command profile and locale", () => {
  const result = validateAllCommandQuestionSurfaces();

  assert.equal(result.pass, true, JSON.stringify(result.issues, null, 2));
  assert.ok(result.checked >= 38);
});

test("question surface schema version is explicit", () => {
  assert.equal(QUESTION_SURFACE_SCHEMA_VERSION, 1);
});

test("command question surface adapts prompt and options to command subject", () => {
  const design = buildCommandQuestionSurface("/supervibe-design", {
    intent: "slash_command",
    command: "/supervibe-design",
    source: "test",
    reason: "agent chat workspace brief",
  }, {
    locale: "en",
    request: "agent chat workspace with approvals",
  });
  const audit = buildCommandQuestionSurface("/supervibe-audit", {
    intent: "slash_command",
    command: "/supervibe-audit",
    source: "test",
    reason: "memory health check",
  }, {
    locale: "en",
    request: "memory health and codegraph drift",
  });

  assert.deepEqual(validateQuestionSurface(design, { surface: "design command" }), []);
  assert.deepEqual(validateQuestionSurface(audit, { surface: "audit command" }), []);
  assert.notEqual(design.prompt, audit.prompt);
  assert.notDeepEqual(design.choices.map((choice) => choice.label), audit.choices.map((choice) => choice.label));
  assert.match(design.prompt, /design workflow/);
  assert.ok(design.choices.some((choice) => /design workflow/i.test(choice.label)));
});

test("trigger routes expose questionSurface as the visible question path", () => {
  const route = routeTriggerRequest("/supervibe-design agent chat workspace", {
    pluginRoot: process.cwd(),
    projectRoot: process.cwd(),
    artifacts: { confirmedMutation: true },
  });

  assert.equal(route.questionSurface.commandId, "/supervibe-design");
  assert.equal(route.visibleQuestionPrompt, route.questionSurface.prompt);
  assert.deepEqual(validateQuestionSurface(route.questionSurface, { surface: "routed design command" }), []);
  assert.ok(route.questionChoices.every((choice) => choice.label !== choice.id));
});

test("golden anti-template questions stay rejected", () => {
  for (const bad of goldenAntiTemplateQuestions()) {
    const issues = validateAgenticQuestion(bad, { surface: bad.id, minChoices: 3 });
    assert.notEqual(issues.length, 0, bad.id);
  }
});

test("static bypass scanner catches raw choices and ignores valid runtime files", async () => {
  const current = validateStaticQuestionSurfaceBypasses(process.cwd());
  assert.equal(current.pass, true, JSON.stringify(current.issues, null, 2));

  const root = await mkdtemp(join(tmpdir(), "question-surface-bypass-"));
  try {
    await mkdir(join(root, "scripts", "lib"), { recursive: true });
    const file = join(root, "scripts", "lib", "bad-question.mjs");
    await writeFile(file, [
      "export const badQuestion = {",
      "  prompt: 'Step 1/1: choose the next step for this delivery.',",
      "  choices: ['approve', 'refine', 'stop'],",
      "};",
      "",
    ].join("\n"), "utf8");
    const fixture = validateStaticQuestionSurfaceBypasses(root);
    assert.equal(fixture.pass, false);
    assert.ok(fixture.issues.some((issue) => issue.code === "raw-string-choice-array"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
