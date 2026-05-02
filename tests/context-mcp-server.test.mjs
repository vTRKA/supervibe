import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("context MCP server self-test exposes read-only resources", () => {
  const out = execFileSync(process.execPath, ["scripts/supervibe-context-mcp.mjs", "--self-test"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  const report = JSON.parse(out);
  assert.equal(report.pass, true);
  assert.ok(report.resources.length >= 4);
  assert.equal(report.resources.every((item) => item.readOnly === true), true);
  assert.ok(report.resources.some((item) => item.uri === "supervibe://memory"));
  assert.ok(report.resources.some((item) => item.uri === "supervibe://code-context"));
});
