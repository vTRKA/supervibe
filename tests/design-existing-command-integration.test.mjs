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
