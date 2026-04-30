import assert from "node:assert/strict";
import test from "node:test";
import {
  assertMcpTaskTrackerApproved,
  createTaskTrackerMcpBridge,
  detectMcpTaskTrackerCapability,
} from "../scripts/lib/supervibe-task-tracker-mcp-bridge.mjs";

test("MCP bridge is blocked until exact approval exists", async () => {
  const bridge = createTaskTrackerMcpBridge({ servers: ["issue-mcp"], allowedTools: ["create_issue"] });
  const detection = bridge.detect();

  assert.equal(detection.status, "blocked");
  assert.equal((await bridge.call("createTask", { token: "secret-value" })).ok, false);
  assert.throws(() => assertMcpTaskTrackerApproved(bridge), /not approved/);
});

test("approved MCP bridge redacts payload and reports capabilities", async () => {
  const bridge = createTaskTrackerMcpBridge({
    servers: ["issue-mcp"],
    approved: true,
    allowedTools: ["create_task", "add_dependency"],
  });
  const detection = bridge.detect();
  const call = await bridge.call("createTask", { title: "Task", apiToken: "secret-value" });

  assert.equal(detection.available, true);
  assert.equal(detection.capabilities.create, true);
  assert.equal(detection.capabilities.dependencySupport, true);
  assert.equal(call.payload.apiToken, "[REDACTED_SECRET]");
});

test("MCP capability detection finds issue/task servers", () => {
  const detection = detectMcpTaskTrackerCapability({
    approved: true,
    mcps: [{ name: "tracker", tools: [{ name: "create_issue" }] }],
  });

  assert.equal(detection.available, true);
  assert.deepEqual(detection.servers, ["tracker"]);
});
