import assert from "node:assert/strict";
import test from "node:test";

import {
  assertProtectedSimplificationSafe,
  evaluateProtectedSimplification,
  inspectProtectedSimplificationBlocks,
  isLineProtected,
  isRangeProtected,
  normalizeSimplificationRanges,
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
  assert.equal(isRangeProtected({ startLine: 4, endLine: 5 }, report.blocks), true);
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

test("protected simplification gate blocks touched ranges inside protected spans", () => {
  const content = [
    "before",
    "// supervibe-simplify-ignore-start: user-owned host stanza",
    "do not rewrite",
    "// supervibe-simplify-ignore-end",
    "after",
  ].join("\n");

  const allowed = evaluateProtectedSimplification(content, [{ startLine: 5, endLine: 5 }]);
  assert.equal(allowed.pass, true);
  assert.equal(allowed.violations.length, 0);

  const blocked = evaluateProtectedSimplification(content, [{ startLine: 1, endLine: 3 }]);
  assert.equal(blocked.pass, false);
  assert.equal(blocked.violations.length, 1);
  assert.deepEqual(blocked.violations[0], {
    code: "protected-range-overlap",
    message: "Simplification or refactor touches a protected block.",
    startLine: 1,
    endLine: 3,
    protectedStartLine: 2,
    protectedEndLine: 4,
    reason: "user-owned host stanza",
  });
});

test("protected simplification gate blocks malformed markers before destructive edits", () => {
  const content = [
    "before",
    "// supervibe-simplify-ignore-start: generated table",
    "generated",
  ].join("\n");

  const gate = evaluateProtectedSimplification(content, [{ line: 1 }]);
  assert.equal(gate.pass, false);
  assert.equal(gate.blockers[0].code, "malformed-unclosed-start");
  assert.throws(
    () => assertProtectedSimplificationSafe(content, [{ line: 1 }]),
    /Protected simplification blocked/,
  );
});

test("protected simplification range normalization accepts diff-like shapes", () => {
  assert.deepEqual(normalizeSimplificationRanges([
    4,
    [8, 6],
    { lineNumber: 2 },
    { start: 12, end: 13 },
    { startLine: 1, endLine: 0 },
    { startLine: "bad", endLine: 9 },
  ]), [
    { startLine: 2, endLine: 2 },
    { startLine: 4, endLine: 4 },
    { startLine: 6, endLine: 8 },
    { startLine: 12, endLine: 13 },
  ]);
});
