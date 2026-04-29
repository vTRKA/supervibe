import { HIGH_RISK_ACTIONS } from "./autonomous-loop-constants.mjs";

export function classifyPolicyRisk(action = {}) {
  const text = `${action.type || ""} ${action.description || ""} ${action.environment || ""}`.toLowerCase();
  if (HIGH_RISK_ACTIONS.some((item) => text.includes(item.replaceAll("_", " "))) || /(production|destructive|billing|credential|dns|remote mutation)/.test(text)) {
    return "high";
  }
  if (/(external|server|docker|mcp|privacy|security|remote)/.test(text)) return "medium";
  return "low";
}

export function guardAction(action = {}, approvalLease = null) {
  const risk = action.policyRiskLevel || classifyPolicyRisk(action);
  if (isDisallowed(action)) {
    return { allowed: false, risk, status: "policy_stopped", reason: "disallowed or abusive automation request" };
  }
  if (risk === "high" && !approvalLease) {
    return { allowed: false, risk, status: "deployment_approval_required", reason: "high-risk action requires explicit approval" };
  }
  if (approvalLease && !approvalLeaseAllows(approvalLease, action)) {
    return { allowed: false, risk, status: "approval_scope_changed", reason: "approval lease does not cover this action" };
  }
  return { allowed: true, risk, status: "allowed", reason: "policy guard passed" };
}

export function approvalLeaseAllows(lease, action) {
  if (lease.expired === true) return false;
  if (lease.environment && action.environment && lease.environment !== action.environment) return false;
  if (lease.actionClass && action.type && lease.actionClass !== action.type) return false;
  return true;
}

function isDisallowed(action) {
  const text = `${action.type || ""} ${action.description || ""}`.toLowerCase();
  if (/(never|no|not|does not|do not|without)\s+.{0,80}(bypass|credential harvesting|unauthorized access|phishing|spam)/.test(text)) {
    return false;
  }
  return /(phishing|spam|credential harvesting|rate-limit bypass|provider bypass|unauthorized access)/.test(text);
}
