import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("design pipeline requires preference coverage before candidate tokens", async () => {
  const design = await readFile("commands/supervibe-design.md", "utf8");
  const brandbook = await readFile("skills/brandbook/SKILL.md", "utf8");

  assert.match(design, /Preference Coverage Matrix Gate/);
  assert.match(design, /visual direction and tone/);
  assert.match(design, /reference borrow\/avoid/);
  assert.match(design, /Do not create candidate tokens/i);
  assert.match(design, /\.supervibe\/artifacts\/brandbook\/preferences\.json/);
  assert.match(design, /\.supervibe\/artifacts\/brandbook\/direction\.md.*mandatory/i);
  assert.ok(design.indexOf("Preference Coverage Matrix Gate") < design.indexOf("### Stage 2"));

  assert.match(brandbook, /Preference Coverage Matrix Gate/);
  assert.match(brandbook, /Preference Coverage Matrix/);
  assert.match(brandbook, /\.supervibe\/artifacts\/brandbook\/preferences\.json/);
  assert.match(brandbook, /Do not accept blanket approval/i);
});

test("design feedback loop keeps chat feedback canonical and browser feedback stateful", async () => {
  const design = await readFile("commands/supervibe-design.md", "utf8");
  const browserFeedback = await readFile("skills/browser-feedback/SKILL.md", "utf8");

  assert.match(design, /chat-level feedback prompt is canonical/i);
  assert.match(design, /browser feedback overlay is supplemental/i);
  assert.match(design, /Wait for explicit choice/);
  assert.match(browserFeedback, /resurfaces unresolved entries/i);
});

test("design instruction surfaces do not contain nested brandbook artifact roots", async () => {
  const files = [
    "commands/supervibe-design.md",
    "commands/supervibe-score.md",
    "skills/brandbook/SKILL.md",
    "skills/landing-page/SKILL.md",
    "agents/_design/copywriter.md",
    "agents/_design/creative-director.md",
    "agents/_design/ux-ui-designer.md",
  ];

  for (const file of files) {
    const text = await readFile(file, "utf8");
    assert.doesNotMatch(text, /prototypes\/_\.supervibe\/artifacts\/brandbook/, file);
    assert.doesNotMatch(text, /prototypes\/_\.supervibe\/artifacts\/brand\//, file);
  }
});
