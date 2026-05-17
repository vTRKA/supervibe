import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { getRegistry as getMcpRegistry } from "./mcp-registry.mjs";
import { WORKFLOW_EVIDENCE_MODES } from "./supervibe-plan-to-work-items.mjs";

export async function loadMcpAgentHandoffForDispatch(args = {}) {
  try {
    const registry = await getMcpRegistry({ refresh: Boolean(args["refresh-mcp"] || args["mcp-refresh"]) });
    return registry.agentHandoff || null;
  } catch {
    return null;
  }
}

export function formatMcpAgentHandoffForMessage(handoff = null) {
  if (!handoff || !Array.isArray(handoff.capabilities)) {
    return "MCP runtime palette: unavailable; use local fallback paths and cap MCP-dependent confidence.";
  }
  const runtime = handoff.runtimePaletteProvided ? "runtime" : "configured";
  const capabilities = handoff.capabilities
    .slice(0, 6)
    .map((item) => String(item.capabilityId) + ":" + String(item.state) + ":cap" + String(item.confidenceCap))
    .join(", ") || "none";
  return "MCP runtime palette: " + runtime + "; host=" + (handoff.host || "unknown") + "; capabilities=" + capabilities + ". Use only capabilities marked runtime-available for MCP-dependent claims.";
}

export async function writeFastSessionDispatchWaveReceipt({ rootDir, graphPath, graph = {}, waveId, assigned = [], claimResults = [], args = {}, sourceCommand = "supervibe-loop-dispatch-wave" } = {}) {
  const mode = graph.metadata?.workflowEvidenceMode || (args["release-proof"] ? WORKFLOW_EVIDENCE_MODES.RELEASE_PROOF : WORKFLOW_EVIDENCE_MODES.FAST_SESSION);
  if (mode !== WORKFLOW_EVIDENCE_MODES.FAST_SESSION || !waveId || assigned.length === 0) return null;
  const hostId = String(args.host || args["host-id"] || process.env.SUPERVIBE_HOST || "codex").trim() || "unknown";
  const createdAt = new Date().toISOString();
  const claimByItem = new Map((claimResults || []).map((item) => [item.itemId, item]));
  const bindings = assigned.map((dispatch) => {
    const claim = claimByItem.get(dispatch.taskId) || {};
    return {
      workItemId: dispatch.taskId,
      taskId: dispatch.taskId,
      agentId: dispatch.primaryAgentId || dispatch.agentId || "unassigned-agent",
      reviewerAgentId: dispatch.reviewerAgentId || null,
      hostId,
      invocationId: dispatch.invocationId || dispatch.codexSpawnMetadata?.invocationId || claim.claimId || (String(waveId) + ":" + String(dispatch.taskId || "unknown-task")),
      claimId: claim.claimId || null,
      writeSet: dispatch.writeSet || [],
      status: claim.changed === false ? "unchanged" : "claimed",
    };
  });
  const receipt = {
    schemaVersion: 1,
    kind: "supervibe-fast-session-dispatch-wave-receipt",
    receiptId: "fast-session-" + sanitizeReceiptFileId(waveId),
    mode: WORKFLOW_EVIDENCE_MODES.FAST_SESSION,
    trust: "diagnostic-only-until-release-proof",
    proofScope: "active-session-coordination-only",
    cannotProve: ["delegated-specialist-completion", "release-readiness", "final-validation"],
    sourceCommand,
    graphId: graph.epicId || graph.graph_id || graph.graphId || null,
    graphPath: normalizePath(relative(rootDir, graphPath)),
    waveId,
    createdAt,
    hostId,
    releaseProofRequiredAt: graph.metadata?.receiptPolicy?.releaseProofRequiredAt || "release-handoff",
    startupReceiptsRequired: false,
    assignedTaskIds: assigned.map((dispatch) => dispatch.taskId),
    claimedTaskIds: claimResults.map((item) => item.itemId).filter(Boolean),
    bindings,
  };
  const receiptDir = join(dirname(graphPath), "dispatch-waves");
  const receiptPath = join(receiptDir, sanitizeReceiptFileId(waveId) + ".fast-session.json");
  await mkdir(receiptDir, { recursive: true });
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n", "utf8");
  return {
    path: receiptPath,
    relativePath: normalizePath(relative(rootDir, receiptPath)),
    receiptId: receipt.receiptId,
    mode: receipt.mode,
    trust: receipt.trust,
    bindings: receipt.bindings,
  };
}

function sanitizeReceiptFileId(value = "") {
  return String(value || "wave")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "wave";
}

function normalizePath(path = "") {
  return String(path || "").split("\\").join("/").replace(/^\.\//, "").trim();
}
