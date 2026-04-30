import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createGraphInspection } from "./autonomous-loop-graph-export.mjs";
import { redactBenchmarkArtifact } from "./autonomous-loop-benchmark-corpus.mjs";

export async function replayArchivedRun(runDir, { golden = null } = {}) {
  const dir = resolve(runDir);
  const state = JSON.parse(await readFile(join(dir, "state.json"), "utf8"));
  const progressLog = await readOptional(join(dir, "progress.md"));
  const finalReport = await readOptional(join(dir, "final-report.md"));
  const snapshot = createReplaySnapshot({ state, progressLog, finalReport });
  const comparison = golden ? compareReplayToGolden(snapshot, golden) : { pass: true, diffs: [] };
  return { runDir: dir, snapshot, comparison, remoteMutation: false, workspaceMutation: false };
}

export function replayBenchmarkCase(caseDef = {}, golden = null) {
  const snapshot = createReplaySnapshot({
    state: caseDef.inputArtifacts?.state || {},
    progressLog: caseDef.inputArtifacts?.progressLog || "",
    finalReport: caseDef.inputArtifacts?.finalReport || "",
  });
  const comparison = compareReplayToGolden(snapshot, golden || caseDef.expected || {});
  return {
    caseId: caseDef.id,
    snapshot,
    comparison,
    remoteMutation: false,
    workspaceMutation: false,
  };
}

export function createReplaySnapshot({ state = {}, progressLog = "", finalReport = "" } = {}) {
  const graph = createGraphInspection(state);
  const blocked = graph.nodes.filter((node) => ["blocked", "policy_stopped", "POLICY_STOPPED", "budget_stopped", "command_adapter_required"].includes(node.status) || node.gates?.length > 0);
  const verification = state.verification_matrix || state.verificationMatrix || [];
  const tasks = state.tasks || [];
  const finalAcceptancePass = state.final_acceptance?.pass ?? (
    tasks.length > 0
      && tasks.every((task) => task.status === "complete")
      && (verification.length === 0 || verification.every((entry) => entry.status === "pass" || entry.pass === true))
  );
  return {
    runId: state.run_id || state.runId || "unknown",
    status: state.status || "unknown",
    readyFront: graph.readyFront?.ready || [],
    readyFrontCount: graph.readyFront?.ready?.length || 0,
    blockedStates: blocked.map((node) => ({ id: node.id, status: node.status })),
    blockedCount: blocked.length,
    stopReason: state.stop_reason || state.stopReason || null,
    nextAction: state.next_action || state.nextAction || null,
    finalAcceptancePass,
    progressHash: stableHash(progressLog),
    finalReportHash: stableHash(finalReport),
  };
}

export function compareReplayToGolden(snapshot = {}, golden = {}) {
  const diffs = [];
  for (const field of ["status", "readyFrontCount", "blockedCount", "stopReason", "nextAction", "finalAcceptancePass"]) {
    if (field in golden && normalize(snapshot[field]) !== normalize(golden[field])) {
      diffs.push({ field, expected: golden[field], actual: snapshot[field] });
    }
  }
  return {
    pass: diffs.length === 0,
    diffs,
    summary: diffs.length ? `${diffs.length} golden difference(s)` : "matches golden outcome",
  };
}

export function formatReplayDiff(comparison = {}) {
  if (comparison.pass) return "REPLAY_DIFF: none";
  return [
    "REPLAY_DIFF:",
    ...(comparison.diffs || []).map((diff) => `- ${diff.field}: expected=${redactBenchmarkArtifact(JSON.stringify(diff.expected))} actual=${redactBenchmarkArtifact(JSON.stringify(diff.actual))}`),
  ].join("\n");
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

function normalize(value) {
  return value == null ? null : value;
}

function stableHash(value = "") {
  let hash = 0;
  for (const char of String(value)) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return String(Math.abs(hash));
}
