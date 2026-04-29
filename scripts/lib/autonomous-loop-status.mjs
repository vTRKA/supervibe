import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { versionEnvelope } from "./autonomous-loop-constants.mjs";

export function createState(fields = {}) {
  return versionEnvelope({
    plugin_version: fields.pluginVersion,
    run_id: fields.runId,
    status: fields.status || "IN_PROGRESS",
    active_task: fields.activeTask || null,
    active_agent: fields.activeAgent || null,
    loop_count: Number(fields.loopCount || 0),
    scores: fields.scores || [],
    budget_remaining: fields.budgetRemaining || {},
    last_progress_at: fields.lastProgressAt || new Date().toISOString(),
    stop_reason: fields.stopReason || null,
    next_action: fields.nextAction || "dispatch",
    tasks: fields.tasks || [],
    dispatches: fields.dispatches || [],
    runtime_environment: fields.runtimeEnvironment || null,
    mcp_plans: fields.mcpPlans || [],
    memory_write_policy: fields.memoryWritePolicy || null,
    final_acceptance: fields.finalAcceptance || null,
  });
}

export async function writeState(filePath, state) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return filePath;
}

export async function readState(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export function formatStatus(state) {
  return [
    "SUPERVIBE_LOOP_STATUS",
    `STATUS: ${state.status}`,
    `EXIT_SIGNAL: ${state.status === "COMPLETE"}`,
    `CONFIDENCE: ${state.run_score ?? 0}`,
    `NEXT_AGENT: ${state.active_agent || "none"}`,
    `NEXT_ACTION: ${state.next_action || "none"}`,
    `STOP_REASON: ${state.stop_reason || "none"}`,
    `POLICY_RISK: ${state.policy_risk || "none"}`,
  ].join("\n");
}
