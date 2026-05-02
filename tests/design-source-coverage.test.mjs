import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateDesignSourceCoverage,
} from "../scripts/validate-design-source-coverage.mjs";

test("source coverage document classifies every useful source family", async () => {
  const content = await readFile("references/design-intelligence-source-coverage.md", "utf8");
  for (const phrase of [
    "Main design CSV data",
    "Stack CSV data",
    "Slide decision CSV data",
    "Logo, icon, CIP collateral CSV data",
    "Search and reasoning scripts",
    "Brand, design-system, UI styling, slides references",
    "Font binaries and font license sidecars",
    "Low-signal design/draft backup files",
  ]) {
    assert.match(content, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("manifest records adapted local source families and no design lookup command exists", async () => {
  const result = validateDesignSourceCoverage(process.cwd());
  assert.deepEqual(result.issues, []);
  assert.equal(result.pass, true);

  const manifest = JSON.parse(await readFile("skills/design-intelligence/data/manifest.json", "utf8"));
  assert.equal(manifest.sourceReference, "local-design-intelligence-pack");
  assert.equal(manifest.excludedAssets.some((asset) => asset.path.includes("canvas-fonts")), true);
  assert.equal(manifest.excludedAssets.some((asset) => asset.path.includes("installer-src")), true);
  assert.equal(manifest.commandPolicy.includes("no new slash command"), true);

  const commands = await readdir("commands");
  assert.equal(commands.includes("supervibe-design-intelligence.md"), false);
  assert.equal(commands.includes("supervibe-design-lookup.md"), false);
});
