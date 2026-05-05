import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export function buildAgentSmokeTestState({
  host = "codex",
  command = "/supervibe-genesis",
  agentId = "repo-researcher",
} = {}) {
  const runner = command === "/supervibe-adapt" ? "supervibe-adapt.mjs" : "supervibe-genesis.mjs";
  return {
    required: true,
    status: "pending-real-host-agent",
    purpose: "Prove at least one installed Supervibe specialist can run through the active host and bind telemetry to a receipt.",
    suggestedAgent: agentId,
    commandTemplate: [
      `node <resolved-supervibe-plugin-root>/scripts/${runner}`,
      "--verify-agents",
      "--record-smoke",
      `--host ${host}`,
      `--smoke-agent ${agentId}`,
      "--host-invocation-id <real-host-agent-id>",
    ].join(" "),
  };
}

export function recordAgentRuntimeSmoke({
  projectRoot = process.cwd(),
  pluginRoot = process.cwd(),
  host = "codex",
  command = "/supervibe-genesis",
  agentId = "repo-researcher",
  hostInvocationId = "",
} = {}) {
  const invocationId = String(hostInvocationId || "").trim();
  const normalizedAgentId = String(agentId || "repo-researcher").trim();
  const scriptPath = join(pluginRoot, "scripts", "agent-invocation.mjs");
  if (!invocationId || invocationId.includes("<")) {
    return {
      attempted: false,
      pass: false,
      status: "missing-real-host-invocation-id",
      reason: "--host-invocation-id must be the id returned by a real host-agent invocation",
    };
  }
  if (!existsSync(scriptPath)) {
    return {
      attempted: false,
      pass: false,
      status: "agent-invocation-runtime-missing",
      reason: `agent invocation runtime not found at ${scriptPath}`,
    };
  }
  const outputArtifact = `.supervibe/artifacts/_agent-outputs/${invocationId}/agent-output.json`;
  const args = [
    scriptPath,
    "log",
    "--root",
    projectRoot,
    "--agent",
    normalizedAgentId,
    "--host",
    host,
    "--host-invocation-id",
    invocationId,
    "--task",
    `${command} receipt-bound smoke test`,
    "--confidence",
    "9",
    "--retrieval-policy",
    "memory=mandatory,rag=mandatory,codegraph=optional",
    "--verification-commands",
    "node scripts/supervibe-status.mjs",
    "--redaction-status",
    "not-needed",
    "--issue-receipt",
    "--command",
    command,
    "--stage",
    "agent-smoke-test",
    "--handoff-id",
    `${command.replace(/^\//, "").replace(/[^a-z0-9-]/gi, "-")}-agent-smoke`,
    "--output-artifacts",
    outputArtifact,
  ];
  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 20_000,
    windowsHide: true,
    env: {
      ...process.env,
      SUPERVIBE_PLUGIN_ROOT: pluginRoot,
    },
  });
  return {
    attempted: true,
    pass: result.status === 0,
    status: result.status === 0 ? "recorded" : "failed",
    agentId: normalizedAgentId,
    host,
    invocationId,
    outputArtifact,
    exitCode: result.status,
    stdoutTail: tailLines(result.stdout || "", 8),
    stderrTail: tailLines(result.stderr || "", 8),
  };
}

function tailLines(value, maxLines = 5) {
  return String(value || "")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-maxLines)
    .join("\n");
}
