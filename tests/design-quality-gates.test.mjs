import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import YAML from "yaml";

test("design intelligence rubric blocks weak evidence", async () => {
  const rubric = YAML.parse(await readFile("confidence-rubrics/design-intelligence.yaml", "utf8"));
  assert.equal(rubric.artifact, "design-intelligence");
  assert.equal(rubric["max-score"], 10);
  assert.equal(rubric.gates["block-below"], 9);
  const dimensions = new Set(rubric.dimensions.map((dimension) => dimension.id));
  for (const id of ["source-quality", "memory-integration", "conflict-handling", "token-discipline", "synthesis"]) {
    assert.equal(dimensions.has(id), true, id);
  }
});

test("design docs require memory, lookup, citations, and token precedence", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const docs = await readFile("docs/design-intelligence.md", "utf8");
  assert.match(docs, /project memory/i);
  assert.match(docs, /cited rows/i);
  assert.match(docs, /Approved design system/);
  assert.match(docs, new RegExp(packageJson.version.replaceAll(".", "\\.")));
});
