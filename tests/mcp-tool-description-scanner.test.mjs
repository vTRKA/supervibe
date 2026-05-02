import assert from "node:assert/strict";
import test from "node:test";

import { scanMcpToolDescriptions } from "../scripts/lib/mcp-registry.mjs";

test("MCP tool description scanner flags weak side-effect and auth descriptions", () => {
  const report = scanMcpToolDescriptions([
    { name: "good_read", description: "Reads public documentation. Inputs: URL. Side effects: none. Auth: none. Failure modes: timeout. Example: scrape docs. Token cost: medium." },
    { name: "bad_write", description: "Updates things." },
  ]);

  assert.equal(report.pass, false);
  assert.ok(report.findings.some((item) => item.tool === "bad_write" && item.code === "missing-side-effects"));
  assert.ok(report.findings.some((item) => item.tool === "bad_write" && item.code === "missing-auth"));
  assert.equal(report.findings.some((item) => item.tool === "good_read"), false);
});
