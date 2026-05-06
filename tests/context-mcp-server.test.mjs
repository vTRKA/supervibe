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
  assert.equal(report.resources.every((item) => item.schema?.output && item.riskLevel), true);
  assert.ok(report.resources.some((item) => item.uri === "supervibe://memory"));
  assert.ok(report.resources.some((item) => item.uri === "supervibe://code-context"));
  assert.ok(report.resources.some((item) => item.uri === "supervibe://repo-map"));
  assert.ok(report.resources.some((item) => item.uri === "supervibe://project-knowledge-graph"));
  assert.ok(report.resources.some((item) => item.uri === "supervibe://agent-regression"));
  assert.ok(report.resources.some((item) => item.uri === "supervibe://runtime-trace"));
  assert.ok(report.resources.some((item) => item.uri === "supervibe://scip-import"));
  assert.ok(report.resources.some((item) => item.technology === "mcp-context-server"));
  assert.ok(report.resourceTemplates.some((item) => item.uriTemplate === "supervibe://code-graph/{symbol}"));
});
