import assert from "node:assert/strict";
import test from "node:test";

import {
  validateSupervibeAgentRunRequest,
} from "../scripts/lib/supervibe-agent-run-contract.mjs";

test("agent run contract rejects prompt-role-only emulation", () => {
  const result = validateSupervibeAgentRunRequest({
    agent: "creative-director",
    task: "produce directions",
    "host-invocation-source": "prompt-role-only",
    "host-invocation-id": "local-draft",
    receipt: ".supervibe/artifacts/_workflow-invocations/run/receipt.json",
  });

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "prompt-role-is-not-agent"));
});

test("agent run contract accepts host runtime proof plus receipt target", () => {
  const result = validateSupervibeAgentRunRequest({
    agent: "creative-director",
    task: "produce directions",
    "host-invocation-source": "codex-spawn-agent",
    "host-invocation-id": "agent-123",
    receipt: ".supervibe/artifacts/_workflow-invocations/run/receipt.json",
  });

  assert.equal(result.pass, true);
});
