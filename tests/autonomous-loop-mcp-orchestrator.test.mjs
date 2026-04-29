import assert from "node:assert/strict";
import test from "node:test";
import { discoverMcpTools, planMcpUse } from "../scripts/lib/autonomous-loop-mcp-orchestrator.mjs";

test("MCP discovery records write capability risk", () => {
  assert.equal(discoverMcpTools([{ name: "Figma", writeCapability: true }])[0].policyRisk, "medium");
});

test("design tasks prefer Figma with fallback", () => {
  const plan = planMcpUse({ goal: "inspect design", category: "design" }, []);
  assert.equal(plan.required, true);
  assert.equal(plan.selected, null);
});
