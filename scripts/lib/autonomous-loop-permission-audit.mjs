import {
  evaluateProviderSafetyPolicy,
  providerAuditId,
  redactSensitiveText,
} from "./autonomous-loop-provider-policy-guard.mjs";

export function createPermissionAudit(input = {}) {
  const policy = evaluateProviderSafetyPolicy(input);
  const audit = {
    auditId: providerAuditId({
      executionMode: policy.executionMode,
      adapterId: policy.adapterId,
      status: policy.status,
      blockers: policy.blockers.map((blocker) => blocker.status),
    }),
    createdAt: new Date().toISOString(),
    pass: policy.pass,
    status: policy.status,
    executionMode: policy.executionMode,
    adapterId: policy.adapterId,
    permissionMode: policy.permissionMode,
    bypassDisabled: policy.bypassDisabled,
    approvedToolClasses: policy.approvedToolClasses,
    promptRequiredToolClasses: policy.promptRequiredToolClasses,
    deniedToolClasses: policy.deniedToolClasses,
    blockers: policy.blockers,
    warnings: policy.warnings,
    remediation: policy.remediation,
    networkState: policy.networkState,
    mcpState: policy.mcpState,
    secretState: policy.secretState,
    rateLimitState: policy.rateLimitState,
    managedPolicyState: policy.managedPolicyState,
    nextSafeAction: policy.nextSafeAction,
  };
  return audit;
}

export function summarizePermissionAudit(audit = null) {
  if (!audit) {
    return {
      pass: false,
      status: "permission_audit_missing",
      permissionMode: "unknown",
      bypassDisabled: true,
      deniedToolClasses: ["permission-audit-missing"],
      promptRequiredToolClasses: [],
      nextSafeAction: "run provider permission audit",
    };
  }
  return {
    pass: Boolean(audit.pass),
    status: audit.status,
    permissionMode: audit.permissionMode,
    bypassDisabled: audit.bypassDisabled !== false,
    deniedToolClasses: audit.deniedToolClasses || [],
    promptRequiredToolClasses: audit.promptRequiredToolClasses || [],
    rateLimitStatus: audit.rateLimitState?.status || "unknown",
    networkStatus: audit.networkState?.status || "unknown",
    mcpStatus: audit.mcpState?.status || "unknown",
    nextSafeAction: audit.nextSafeAction || "none",
  };
}

export function formatPermissionAudit(audit = null) {
  const summary = summarizePermissionAudit(audit);
  return [
    "SUPERVIBE_PERMISSION_AUDIT",
    `PASS: ${summary.pass}`,
    `STATUS: ${summary.status}`,
    `PERMISSION_MODE: ${summary.permissionMode}`,
    `BYPASS_DISABLED: ${summary.bypassDisabled}`,
    `DENIED_TOOLS: ${summary.deniedToolClasses.join(",") || "none"}`,
    `PROMPT_REQUIRED_TOOLS: ${summary.promptRequiredToolClasses.join(",") || "none"}`,
    `RATE_LIMIT: ${summary.rateLimitStatus}`,
    `NETWORK: ${summary.networkStatus}`,
    `MCP: ${summary.mcpStatus}`,
    `NEXT_SAFE_ACTION: ${redactSensitiveText(summary.nextSafeAction)}`,
  ].join("\n");
}

export function assertPermissionAuditPass(audit = null) {
  if (audit?.pass) return true;
  const status = audit?.status || "permission_audit_missing";
  const next = audit?.nextSafeAction || "run provider permission audit";
  throw new Error(`Provider permission audit failed: ${status}. Next safe action: ${next}`);
}
