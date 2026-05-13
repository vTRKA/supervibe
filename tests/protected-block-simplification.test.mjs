import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectProtectedSimplificationBlocks,
  isLineProtected,
} from "../scripts/lib/protected-block-simplification.mjs";

test("protected simplification blocks support reasons and nested-safe ranges", () => {
  const report = inspectProtectedSimplificationBlocks([
    "a",
    "// supervibe-simplify-ignore-start: generated migration",
    "b",
    "// supervibe-simplify-ignore-start: vendor stanza",
    "c",
    "// supervibe-simplify-ignore-end",
    "d",
    "// supervibe-simplify-ignore-end",
  ].join("\n"));

  assert.equal(report.pass, true);
  assert.equal(report.blocks.length, 2);
  assert.equal(isLineProtected(3, report.blocks), true);
  assert.equal(isLineProtected(9, report.blocks), false);
});

test("protected simplification blocks warn on malformed markers", () => {
  const report = inspectProtectedSimplificationBlocks([
    "// supervibe-simplify-ignore-start:",
    "content",
    "// supervibe-simplify-ignore-end",
    "// supervibe-simplify-ignore-end",
    "// supervibe-simplify-ignore-start: missing end",
  ].join("\n"));

  assert.equal(report.pass, false);
  assert.deepEqual(report.warnings.map((warning) => warning.code), [
    "missing-reason",
    "unmatched-end",
    "unclosed-start",
  ]);
});
