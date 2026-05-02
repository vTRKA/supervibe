import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

test("design intelligence does not add slash commands or package command aliases", async () => {
  const commands = (await readdir("commands")).filter((file) => file.endsWith(".md"));
  assert.equal(commands.includes("supervibe-design-intelligence.md"), false);
  assert.equal(commands.includes("supervibe-design-lookup.md"), false);

  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const scriptNames = Object.keys(packageJson.scripts ?? {});
  assert.equal(scriptNames.some((name) => /design:intelligence|design:lookup/.test(name)), false);
});

test("existing command docs document enhanced design behavior", async () => {
  const design = await readFile("commands/supervibe-design.md", "utf8");
  const audit = await readFile("commands/supervibe-audit.md", "utf8");
  assert.match(design, /Design Intelligence Integration/);
  assert.match(audit, /\/supervibe-audit --design/);
});

test("design command standardizes questions and makes approved handoff mandatory", async () => {
  const design = await readFile("commands/supervibe-design.md", "utf8");

  assert.match(design, /Standard Question Template/);
  assert.match(design, /Why:/);
  assert.match(design, /Decision unlocked:/);
  assert.match(design, /If skipped:/);
  assert.match(design, /approved design system > project memory > codebase patterns > accessibility constraints > external references/i);
  assert.match(design, /\.supervibe\/artifacts\/prototypes\/_design-system\/manifest\.json.*status.*approved/i);
  assert.match(design, /supervibe:prototype-handoff/);
  assert.match(design, /\.supervibe\/artifacts\/prototypes\/<slug>\/handoff\//);
  assert.match(design, /ready for development/i);
  assert.match(design, /components-used\.json/);
  assert.match(design, /tokens-used\.json/);
});
