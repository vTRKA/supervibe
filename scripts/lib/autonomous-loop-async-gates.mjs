import { createHash } from "node:crypto";

const GATE_TYPES = new Set(["human", "ci", "pr", "timer", "manual", "custom"]);
const OPEN_STATUSES = new Set(["open", "waiting", "blocked"]);

export function createGate({
  gateId,
  taskId,
  type = "manual",
  awaitSpec,
  title,
  timeoutAt = null,
  now = new Date(),
  status = "open",
  evidence = [],
  approvalReceiptId = null,
  requiredRole = null,
} = {}) {
  if (!GATE_TYPES.has(type)) throw new Error(`Unknown gate type: ${type}`);
  const createdAt = toDate(now).toISOString();
  const seed = `${taskId || "run"}:${type}:${awaitSpec || title || createdAt}`;
  return {
    gateId: gateId || `gate-${createHash("sha1").update(seed).digest("hex").slice(0, 10)}`,
    taskId: taskId || null,
    type,
    awaitSpec: awaitSpec || "manual approval",
    title: title || `${type} gate`,
    createdAt,
    timeoutAt,
    status,
    approvedBy: null,
    result: null,
    evidence,
    approvalReceiptId,
    requiredRole,
  };
}

export function listGates(gates = [], filter = {}) {
  return gates.filter((gate) => {
    if (filter.status && gate.status !== filter.status) return false;
    if (filter.type && gate.type !== filter.type) return false;
    if (filter.taskId && gate.taskId !== filter.taskId) return false;
    return true;
  });
}

export function evaluateGate(gate, options = {}) {
  if (!OPEN_STATUSES.has(gate.status)) return gate;
  const now = toDate(options.now || new Date());

  if (gate.timeoutAt && toDate(gate.timeoutAt).getTime() <= now.getTime()) {
    return expireGate(gate, now);
  }

  if (gate.type === "timer") {
    return { ...gate, status: "waiting", result: "timer_waiting" };
  }

  if (gate.type === "human" || gate.type === "manual") {
    return { ...gate, status: "blocked", result: "human_approval_required" };
  }

  if (gate.type === "ci" || gate.type === "pr") {
    const adapter = options.adapters?.[gate.type];
    if (!adapter) {
      return { ...gate, status: "blocked", result: `${gate.type}_adapter_unavailable` };
    }
    const result = adapter(gate);
    return {
      ...gate,
      status: result.pass ? "closed" : "blocked",
      result: result.pass ? "passed" : result.reason || "adapter_failed",
      evidence: [...(gate.evidence || []), ...(result.evidence || [])],
    };
  }

  return { ...gate, status: "blocked", result: "custom_gate_waiting" };
}

export function approveGate(gate, { approvedBy, evidence = [], now = new Date() } = {}) {
  if (!approvedBy) throw new Error("approvedBy is required");
  return {
    ...gate,
    status: "approved",
    approvedBy,
    result: "approved",
    approvedAt: toDate(now).toISOString(),
    evidence: [...(gate.evidence || []), ...evidence],
  };
}

function attachApprovalReceiptToGate(gate, receipt = {}) {
  return {
    ...gate,
    approvalReceiptId: receipt.receiptId || gate.approvalReceiptId || null,
    evidence: [
      ...(gate.evidence || []),
      receipt.receiptId ? `approval-receipt:${receipt.receiptId}` : "approval-receipt:missing",
    ],
  };
}

export function closeGate(gate, { result = "closed", evidence = [], now = new Date() } = {}) {
  return {
    ...gate,
    status: "closed",
    result,
    closedAt: toDate(now).toISOString(),
    evidence: [...(gate.evidence || []), ...evidence],
  };
}

export function expireGate(gate, now = new Date()) {
  return {
    ...gate,
    status: "expired",
    result: "timeout",
    expiredAt: toDate(now).toISOString(),
  };
}

export function summarizeGates(gates = []) {
  return {
    open: gates.filter((gate) => ["open", "waiting", "blocked"].includes(gate.status)).length,
    approved: gates.filter((gate) => gate.status === "approved").length,
    closed: gates.filter((gate) => gate.status === "closed").length,
    expired: gates.filter((gate) => gate.status === "expired").length,
  };
}

export function createPolicyGate(action = {}, taskId = null) {
  return createGate({
    taskId,
    type: "human",
    awaitSpec: "exact approval lease for high-risk action",
    title: `Approval required for ${action.type || "high-risk action"}`,
    approvalReceiptId: action.approvalReceiptId || null,
    requiredRole: action.requiredRole || "maintainer",
    evidence: [
      `environment=${action.environment || "unknown"}`,
      `risk=${action.policyRiskLevel || "high"}`,
      action.approvalReceiptId ? `approval-receipt:${action.approvalReceiptId}` : null,
    ].filter(Boolean),
  });
}

function toDate(value) {
  return value instanceof Date ? value : new Date(value);
}
