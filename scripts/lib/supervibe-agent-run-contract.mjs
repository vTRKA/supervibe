const BLOCKED_SOURCES = new Set([
  "prompt-role",
  "prompt-role-only",
  "inline",
  "manual",
  "self-review",
]);

export function validateSupervibeAgentRunRequest(options = {}) {
  const agent = String(options.agent || options["agent-id"] || "").trim();
  const task = String(options.task || options.reason || "").trim();
  const hostInvocationId = String(options.hostInvocationId || options["host-invocation-id"] || "").trim();
  const hostInvocationSource = normalizeSource(options.hostInvocationSource || options["host-invocation-source"] || options.source);
  const receipt = String(options.receipt || options["receipt-output"] || "").trim();
  const issues = [];

  if (!agent) issues.push(issue("missing-agent", "--agent is required"));
  if (!task) issues.push(issue("missing-task", "--task is required"));
  if (!hostInvocationSource) issues.push(issue("missing-host-invocation-source", "--host-invocation-source is required"));
  if (BLOCKED_SOURCES.has(hostInvocationSource)) {
    issues.push(issue("prompt-role-is-not-agent", `${hostInvocationSource} cannot satisfy a real specialist agent run`));
  }
  if (!hostInvocationId) {
    issues.push(issue("missing-host-invocation-id", "--host-invocation-id from the host runtime is required"));
  }
  if (!receipt) {
    issues.push(issue("missing-receipt-output", "--receipt must name the runtime-issued workflow receipt output"));
  }

  return {
    schemaVersion: 1,
    pass: issues.length === 0,
    agent,
    task,
    hostInvocationSource,
    hostInvocationId,
    receipt,
    issues,
  };
}

function normalizeSource(value = "") {
  return String(value || "").trim().toLowerCase().replace(/_/g, "-");
}

function issue(code, message) {
  return { code, message };
}
