const SDLC_PHASES = [
  "intake and requirements",
  "design or architecture",
  "implementation",
  "local verification",
  "integration verification",
  "security and privacy review",
  "performance or load consideration",
  "documentation update",
  "release packaging",
  "staging or preview validation",
  "production approval boundary",
  "post-deploy monitoring plan",
];

export function evaluateSdlcGates(evidence = {}) {
  const gaps = [];
  if (!evidence.requirementsLinked) gaps.push("requirements");
  if (!evidence.tests && !evidence.acceptedTestGap) gaps.push("tests");
  if (evidence.dependencyChanged && !evidence.dependencyAudit) gaps.push("dependency audit");
  if (evidence.newProductionDependency && !evidence.licenseReview) gaps.push("license provenance");
  if (evidence.productionIntent && !evidence.ciEvidence && !evidence.localEquivalent) gaps.push("ci evidence");
  if (evidence.externallyReachable && !evidence.securityPrivacyReview) gaps.push("security privacy review");
  if (evidence.deployable && !evidence.rollbackPlan) gaps.push("rollback");
  if (evidence.productionClaim && !evidence.smokeTestEvidence) gaps.push("smoke test");
  return {
    pass: gaps.length === 0,
    gaps,
    cap: gaps.length === 0 ? 10 : gaps.includes("smoke test") ? 6 : 8,
  };
}
