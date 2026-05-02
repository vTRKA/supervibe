import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyOperationRisk,
  scanAgenticSecurityPolicy,
} from "../scripts/lib/agentic-security-scanner.mjs";

test("agentic security scanner requires HITL for high-risk operation classes", () => {
  const report = scanAgenticSecurityPolicy({
    operations: [
      { id: "deploy-prod", class: "production mutation", approval: "missing" },
      { id: "read-docs", class: "read-only diagnostic", approval: "not-required" },
      { id: "mcp-write", class: "MCP writeback", approval: "lease-123" },
    ],
  });

  assert.equal(classifyOperationRisk("credential mutation"), "high");
  assert.equal(report.pass, false);
  assert.ok(report.findings.some((item) => item.operationId === "deploy-prod" && item.severity === "high"));
  assert.equal(report.findings.some((item) => item.operationId === "mcp-write"), false);
});
