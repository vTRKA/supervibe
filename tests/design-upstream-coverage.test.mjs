import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

test("upstream coverage document classifies every useful source family", async () => {
  const content = await readFile("docs/design-intelligence-upstream-coverage.md", "utf8");
  for (const phrase of [
    "Main design CSV data",
    "Duplicate data trees",
    "Stack CSV data",
    "Slide decision CSV data",
    "Logo, icon, CIP collateral CSV data",
    "CLI TypeScript source and package sidecars",
    "Font binaries and font license sidecars",
    "Low-signal draft/design backup files",
  ]) {
    assert.match(content, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("manifest records excluded source families and no design lookup command exists", async () => {
  const manifest = JSON.parse(await readFile("skills/design-intelligence/data/manifest.json", "utf8"));
  assert.equal(manifest.excludedAssets.some((asset) => asset.path.includes("canvas-fonts")), true);
  assert.equal(manifest.excludedAssets.some((asset) => asset.path.includes("cli/src")), true);
  assert.equal(manifest.commandPolicy.includes("no new slash command"), true);

  const commands = await readdir("commands");
  assert.equal(commands.includes("supervibe-design-intelligence.md"), false);
  assert.equal(commands.includes("supervibe-design-lookup.md"), false);
});
