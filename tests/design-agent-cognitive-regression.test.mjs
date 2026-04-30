import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const PRECEDENCE = "approved design system > project memory > codebase patterns > accessibility law > external lookup";

test("lookup cannot override approved systems or role boundaries", async () => {
  const creative = await readFile("agents/_design/creative-director.md", "utf8");
  const prototype = await readFile("agents/_design/prototype-builder.md", "utf8");
  const polish = await readFile("agents/_design/ui-polish-reviewer.md", "utf8");

  assert.match(creative, new RegExp(PRECEDENCE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(creative, /cannot override an approved brandbook or prior rejected direction/i);
  assert.match(prototype, /approved design system/i);
  assert.match(polish, /support a finding/i);
});

test("design flow asks before reusing old artifacts and requires preview feedback", async () => {
  const command = await readFile("commands/supervibe-design.md", "utf8");
  const prototypeSkill = await readFile("skills/prototype/SKILL.md", "utf8");
  const landingSkill = await readFile("skills/landing-page/SKILL.md", "utf8");
  const builder = await readFile("agents/_design/prototype-builder.md", "utf8");
  const ux = await readFile("agents/_design/ux-ui-designer.md", "utf8");

  for (const body of [command, prototypeSkill, landingSkill, builder, ux]) {
    assert.match(body, /artifact mode/i);
    assert.match(body, /continue an existing|continue existing/i);
    assert.match(body, /new from scratch|from scratch/i);
  }

  for (const body of [command, prototypeSkill, landingSkill, builder]) {
    assert.match(body, /Feedback/);
    assert.match(body, /#evolve-fb-toggle/);
    assert.match(body, /--no-feedback/);
  }

  const feedbackSkill = await readFile("skills/browser-feedback/SKILL.md", "utf8");
  const previewSkill = await readFile("skills/preview-server/SKILL.md", "utf8");
  for (const body of [feedbackSkill, previewSkill]) {
    assert.match(body, /mockups\/<slug>/);
    assert.match(body, /feedback-status\.mjs/);
  }
});

test("presentation director and deck builder keep separate responsibilities", async () => {
  const director = await readFile("agents/_design/presentation-director.md", "utf8");
  const builder = await readFile("agents/_design/presentation-deck-builder.md", "utf8");
  assert.match(director, /audience/i);
  assert.match(director, /narrative arc/i);
  assert.match(director, /copy formula/i);
  assert.match(builder, /slide layout, chart, typography, color, copy/i);
});

test("design lookup output remains compact and citation-oriented", async () => {
  const skill = await readFile("skills/design-intelligence/SKILL.md", "utf8");
  assert.match(skill, /query:/);
  assert.match(skill, /score:/);
  assert.match(skill, /fallbackReason:/);
  assert.match(skill, /Do not write every candidate suggestion/);
});

test("operational design system is the canonical token and component source", async () => {
  const files = [
    "agents/_design/creative-director.md",
    "agents/_design/prototype-builder.md",
    "agents/_design/extension-ui-designer.md",
    "agents/_design/electron-ui-designer.md",
    "agents/_design/mobile-ui-designer.md",
    "agents/_design/tauri-ui-designer.md",
    "agents/_design/ui-polish-reviewer.md",
    "agents/_design/ux-ui-designer.md",
    "skills/interaction-design-patterns/SKILL.md",
    "skills/tokens-export/SKILL.md",
    "commands/supervibe-score.md",
  ];

  for (const file of files) {
    const body = await readFile(file, "utf8");
    assert.doesNotMatch(body, /prototypes\/_brandbook\/(?:tokens\.css|components|motion\.md|system\.md)/, file);
  }

  const rule = await readFile("rules/design-system-governance.md", "utf8");
  assert.match(rule, /prototypes\/_design-system/);
  assert.match(rule, /pre-write-prototype-guard/);
});
