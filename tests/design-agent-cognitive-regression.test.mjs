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
