import assert from "node:assert/strict";
import test from "node:test";
import {
  renderCompactTable,
  renderExpandedDetails,
  renderMarkdownSummary,
  renderPagerSafeOutput,
  renderTerminalOutput,
  shouldUseColor,
} from "../scripts/lib/supervibe-terminal-renderer.mjs";

test("terminal renderer keeps JSON passthrough machine-readable", () => {
  const output = renderTerminalOutput({ data: [{ itemId: "t1" }], json: true }, { json: true });

  assert.deepEqual(JSON.parse(output), [{ itemId: "t1" }]);
});

test("terminal renderer truncates narrow tables with explicit detail command", () => {
  const output = renderCompactTable([
    { itemId: "t1", title: "A very long title that cannot fit in a narrow terminal" },
  ], ["itemId", { key: "title", label: "Title", max: 12 }], {
    width: 32,
    detailCommand: "supervibe-status --view ready-now",
  });

  assert.match(output, /DETAILS: supervibe-status --view ready-now --details <id>/);
  assert.match(output, /A very long…/);
});

test("terminal renderer supports details, markdown wrapping, pager-safe output, and optional color", () => {
  assert.match(renderExpandedDetails({ title: "Example", nested: { a: 1 } }, { width: 40 }), /nested/);
  assert.match(renderMarkdownSummary("# Title\nThis is a long markdown summary", { width: 12 }), /This is a lon/);
  assert.match(renderPagerSafeOutput("a\nb\nc", { maxLines: 2, overflowCommand: "cmd" }), /run: cmd/);
  assert.equal(shouldUseColor({ stdout: { isTTY: false }, noColor: false, env: {} }), false);
});
