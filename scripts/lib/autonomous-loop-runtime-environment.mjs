export function detectRuntimeEnvironment(input = {}) {
  const text = `${input.request || ""} ${(input.tasks || []).map((task) => task.goal).join(" ")}`.toLowerCase();
  const targets = [];
  if (text.includes("docker")) targets.push("docker");
  if (text.includes("ci")) targets.push("ci");
  if (text.includes("staging")) targets.push("staging");
  if (text.includes("production")) targets.push("production");
  if (text.includes("ssh") || text.includes("remote") || text.includes("server")) targets.push("remote");
  if (text.includes("migration") || text.includes("database")) targets.push("database");
  if (targets.length === 0) targets.push("local");
  return {
    targets,
    riskClass: targets.some((target) => ["production", "remote", "database"].includes(target)) ? "high"
      : targets.some((target) => ["docker", "staging"].includes(target)) ? "medium" : "low",
  };
}

export function runtimeEvidenceCap(evidence = {}) {
  if (evidence.remoteMutationAttemptedWithoutApproval) return 6;
  if (evidence.deployTask && !evidence.rollbackPlan) return 7;
  if (evidence.mcpRequired && !evidence.mcpEvidence && !evidence.fallbackEvidence) return 7;
  if (evidence.dockerTask && !evidence.containerLogEvidence) return 8;
  if (evidence.serverTask && !evidence.healthCheckEvidence) return 8;
  return 10;
}
