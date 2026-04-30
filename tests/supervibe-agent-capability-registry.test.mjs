import assert from "node:assert/strict";
import test from "node:test";
import {
  createAgentCapabilityRegistry,
  formatCapabilityMatch,
  matchAgentForTask,
  recordOutcomeSignal,
} from "../scripts/lib/supervibe-agent-capability-registry.mjs";

test("capability registry matches agents by module, risk, tests, and worktree support", () => {
  const registry = createAgentCapabilityRegistry({
    overrides: [{
      agentId: "payments-integration-worker",
      capabilities: {
        stacks: ["node"],
        moduleTypes: ["INTEGRATION"],
        riskLevels: ["low", "medium"],
        testTypes: ["integration"],
        integration: true,
        reviewer: false,
        worktree: true,
      },
    }],
  });
  const match = matchAgentForTask({
    category: "integration",
    stack: "node",
    moduleType: "INTEGRATION",
    policyRiskLevel: "medium",
    verificationCommands: ["npm test -- integration"],
  }, { registry });

  assert.equal(match.status, "matched");
  assert.equal(match.agent.agentId, "payments-integration-worker");
  assert.equal(match.manualAssignmentRequired, false);
  assert.match(formatCapabilityMatch(match), /payments-integration-worker/);
});

test("capability matching degrades to manual assignment when uncertain", () => {
  const registry = createAgentCapabilityRegistry({ builtIns: [] });
  const match = matchAgentForTask({ category: "unknown", policyRiskLevel: "high" }, { registry });

  assert.equal(match.status, "manual-assignment-required");
  assert.equal(match.manualAssignmentRequired, true);
});

test("prior outcome signals affect ranking without storing raw prompts", () => {
  const registry = recordOutcomeSignal(createAgentCapabilityRegistry(), {
    agentId: "stack-developer",
    taskId: "task-1",
    score: 10,
    outcome: "pass",
    prompt: "raw prompt should not be stored",
  });
  const match = matchAgentForTask({ category: "implementation", moduleType: "CORE_LOGIC", policyRiskLevel: "low" }, { registry });

  assert.equal(JSON.stringify(registry).includes("raw prompt"), false);
  assert.equal(match.agent.agentId, "stack-developer");
  assert.ok(match.score > 0);
});
