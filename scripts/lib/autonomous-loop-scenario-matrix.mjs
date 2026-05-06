const SCENARIOS = [
  {
    scenario: "plan execution",
    dispatch: "standard-chain",
    evidence: ["task", "handoff", "score", "verification-matrix"],
    stopBehavior: "complete",
  },
  {
    scenario: "goal-until-complete no default timebox",
    dispatch: "standard-chain",
    evidence: ["approval-lease", "budget-policy", "progress-log"],
    stopBehavior: "continue-until-goal-or-gate",
  },
  {
    scenario: "user accepts system-complete result",
    dispatch: "quality-gate-reviewer",
    evidence: ["system-acceptance", "user-goal-acceptance", "final-report"],
    stopBehavior: "complete-after-user-approval",
  },
  {
    scenario: "user rejects system-complete result",
    dispatch: "quality-gate-reviewer",
    evidence: ["system-acceptance", "user-feedback", "replan-checkpoint"],
    stopBehavior: "replan-required",
  },
  {
    scenario: "checkpoint fork and replan",
    dispatch: "supervibe-orchestrator",
    evidence: ["forked-from", "checkpoint-policy", "state-backup"],
    stopBehavior: "replan-required",
  },
  {
    scenario: "multi-session worktree disjoint write sets",
    dispatch: "worktree-session-manager",
    evidence: ["session-registry", "write-set-ownership", "lock-protected-upsert"],
    stopBehavior: "complete",
  },
  {
    scenario: "stale worktree dirty cleanup",
    dispatch: "worktree-session-manager",
    evidence: ["heartbeat", "cleanup-policy", "dirty-state-blocker"],
    stopBehavior: "cleanup-blocked",
  },
  {
    scenario: "scope creep mvp protection",
    dispatch: "supervibe-orchestrator",
    evidence: ["scope-value-guard", "deferred-extras", "user-approved-tradeoff"],
    stopBehavior: "blocked",
  },
  {
    scenario: "regulated domain evidence",
    dispatch: "research-and-policy-chain",
    evidence: ["domain-evidence", "risk-classification", "approval-policy"],
    stopBehavior: "blocked-until-evidence",
  },
  {
    scenario: "validation request",
    dispatch: "standard-chain",
    evidence: ["task", "verification-command", "score"],
    stopBehavior: "complete",
  },
  {
    scenario: "integration repair",
    dispatch: "standard-chain",
    evidence: ["failure-packet", "requeue-summary", "verification-matrix"],
    stopBehavior: "complete",
  },
  {
    scenario: "design to development",
    dispatch: "design-chain",
    evidence: ["prototype-approval", "handoff", "implementation-check"],
    stopBehavior: "complete",
  },
  {
    scenario: "refactor",
    dispatch: "standard-chain",
    evidence: ["codegraph-impact", "focused-tests", "rollback-plan"],
    stopBehavior: "complete",
  },
  {
    scenario: "documentation",
    dispatch: "standard-chain",
    evidence: ["artifact-link", "docs-check", "review"],
    stopBehavior: "complete",
  },
  {
    scenario: "monorepo",
    dispatch: "standard-chain",
    evidence: ["workspace-map", "package-scope", "affected-tests"],
    stopBehavior: "complete",
  },
  {
    scenario: "flaky tests",
    dispatch: "quality-gate-reviewer",
    evidence: ["flake-signature", "retry-policy", "failure-packet"],
    stopBehavior: "blocked-or-requeued",
  },
  {
    scenario: "missing credentials",
    dispatch: "policy-gate",
    evidence: ["missing-access", "secret-reference-policy", "next-safe-action"],
    stopBehavior: "blocked",
  },
  {
    scenario: "policy stop",
    dispatch: "policy-gate",
    evidence: ["policy-gate", "approval-lease", "side-effect-ledger"],
    stopBehavior: "blocked",
  },
  {
    scenario: "production approval",
    dispatch: "release-manager",
    evidence: ["production-approval-policy", "rollback-owner", "release-gate"],
    stopBehavior: "blocked",
  },
  {
    scenario: "server docker deploy",
    dispatch: "devops-chain",
    evidence: ["server-access-reference", "deployment-approval", "rollback-plan"],
    stopBehavior: "blocked",
  },
  {
    scenario: "mcp validation",
    dispatch: "mcp-chain",
    evidence: ["mcp-plan", "fallback", "tool-permission-audit"],
    stopBehavior: "complete",
  },
  {
    scenario: "provider capability fallback",
    dispatch: "supervibe-orchestrator",
    evidence: ["provider-matrix", "recommended-mode", "fallback-mode"],
    stopBehavior: "guided-or-manual",
  },
  {
    scenario: "resume after context compaction",
    dispatch: "supervibe-orchestrator",
    evidence: ["state-json", "workflow-signal", "resume-notes"],
    stopBehavior: "continue",
  },
  {
    scenario: "brainstorm plan execute loop chain",
    dispatch: "supervibe-orchestrator",
    evidence: ["approved-spec", "reviewed-plan", "work-item-graph", "loop-state"],
    stopBehavior: "complete-after-user-approval",
  },
];

export function buildScenarioMatrix() {
  return SCENARIOS.map((scenario) => ({
    intake: "task-source",
    confidenceGate: 9,
    checkpointRequired: ["replan-required", "cleanup-blocked", "blocked-or-requeued"].includes(scenario.stopBehavior),
    userValidationRequired: scenario.evidence.includes("user-goal-acceptance") || scenario.stopBehavior.includes("user"),
    ...scenario,
  }));
}

export function hasScenarioCoverage(matrix, expected = SCENARIOS.map((item) => item.scenario)) {
  const present = new Set(matrix.map((item) => item.scenario));
  const missing = expected.map((item) => typeof item === "string" ? item : item.scenario).filter((item) => !present.has(item));
  return { ok: missing.length === 0, missing };
}
