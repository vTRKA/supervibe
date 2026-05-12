const AGENT_ONLY_POLICY = Object.freeze({
  durableOutputPolicy: "blocked-without-active-scoped-real-agent-receipts",
  inlineScope: "diagnostic/dry-run only",
  emulationAllowed: false,
});

export function evaluateAgentOnlyPolicy(reportOrPlan = {}) {
  const report = reportOrPlan.plan ? reportOrPlan : { pass: true, plan: reportOrPlan };
  const plan = report.plan || {};
  const issues = [];

  if (report.pass !== true) {
    issues.push(issue("command-agent-plan-failed", "command-agent-plan failed"));
  }
  if (plan.executionMode === "agent-required-blocked") {
    issues.push(issue("required-agents-blocked", "required agents are blocked"));
  }
  if ((plan.missingAgents || []).length) {
    issues.push(issue("missing-agents", `missing agents: ${plan.missingAgents.join(", ")}`));
  }
  if ((plan.missingCallableAgents || []).length) {
    issues.push(issue("missing-callable-agents", `missing callable agents: ${plan.missingCallableAgents.join(", ")}`));
  }
  if ((plan.scopedReceiptTrust?.missingSubjects || []).length) {
    issues.push(issue("missing-scoped-agent-producer-receipt", `missing scoped receipts: ${plan.scopedReceiptTrust.missingSubjects.join(", ")}`));
  }
  if ((plan.logicalFallbackRequiredAgents || []).length && !logicalFallbackAgentsCoveredByReceipts(plan)) {
    issues.push(issue(
      "logical-fallback-agents-unproven",
      `logical fallback agents are not strict host-callable proof until trusted scoped receipts exist: ${plan.logicalFallbackRequiredAgents.join(", ")}`,
    ));
  }
  if (plan.durableWritesAllowed !== true) {
    issues.push(issue("durable-writes-blocked", "durable writes are blocked"));
  }
  if (plan.agentOwnedOutputRequiresReceipts === true || plan.agentDispatchRequired === true) {
    issues.push(issue("runtime-agent-receipts-pending", "runtime agent receipts are still pending"));
  }
  if (/^pending-/i.test(String(plan.receiptGate || ""))) {
    issues.push(issue("pending-receipt-gate", `receipt gate is pending: ${plan.receiptGate}`));
  }

  const strictReady = issues.length === 0;
  return {
    pass: strictReady,
    strictReady,
    policy: AGENT_ONLY_POLICY.durableOutputPolicy,
    durableWritesAllowed: strictReady && plan.durableWritesAllowed === true,
    scopedReceiptGateActive: plan.scopedReceiptGateActive === true,
    globalReceiptTrustIgnoredForActiveScope: plan.globalReceiptTrustIgnoredForActiveScope === true,
    receiptGate: plan.receiptGate || "unknown",
    missingScopedSubjects: [...(plan.scopedReceiptTrust?.missingSubjects || [])],
    blockedReason: issues[0]?.message || "strict gate is ready",
    issues,
  };
}

export function agentOnlyStrictReady(reportOrPlan = {}) {
  return evaluateAgentOnlyPolicy(reportOrPlan).strictReady;
}

export function agentOnlyStrictBlockReason(reportOrPlan = {}) {
  return evaluateAgentOnlyPolicy(reportOrPlan).blockedReason;
}

function logicalFallbackAgentsCoveredByReceipts(plan = {}) {
  const fallbackAgents = plan.logicalFallbackRequiredAgents || [];
  if (fallbackAgents.length === 0) return true;
  const scopedReceiptTrustPass = plan.scopedReceiptTrust?.pass === true || plan.scopedReceiptTrust?.trusted === true;
  return scopedReceiptTrustPass
    && (plan.scopedReceiptTrust?.missingSubjects || []).length === 0
    && plan.agentInvocationsCompleted === true
    && plan.agentReceiptsTrusted === true
    && /^trusted-/i.test(String(plan.receiptGate || ""));
}

function issue(code, message) {
  return { code, message };
}
