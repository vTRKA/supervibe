import assert from "node:assert/strict";
import test from "node:test";
import { dispatchTask } from "../scripts/lib/autonomous-loop-dispatcher.mjs";

test("dispatcher maps design and integration chains", () => {
  const design = dispatchTask({ id: "t1", category: "design", policyRiskLevel: "low" });
  assert.deepEqual(design.chain.slice(0, 2), ["creative-director", "ux-ui-designer"]);

  const integration = dispatchTask({ id: "t2", category: "integration", policyRiskLevel: "medium" });
  assert.ok(integration.chain.includes("dependency-reviewer"));
  assert.equal(integration.routingSignals.policyRisk, "medium");
  assert.equal(integration.availabilityChecks.reviewer, true);
});

test("dispatcher reports missing specialist availability", () => {
  const result = dispatchTask({ id: "t3", category: "security", policyRiskLevel: "high" }, { availableAgents: {} });
  assert.equal(result.availabilityStatus, "missing");
  assert.ok(result.capabilityGaps.length > 0);
});
