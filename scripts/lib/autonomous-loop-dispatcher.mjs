import { access } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_CHAINS = {
  design: ["creative-director", "ux-ui-designer", "prototype-builder", "ui-polish-reviewer", "stack-developer"],
  integration: ["repo-researcher", "dependency-reviewer", "stack-developer", "qa-test-engineer", "quality-gate-reviewer"],
  architecture: ["systems-analyst", "architect-reviewer", "stack-developer", "code-reviewer"],
  security: ["security-auditor", "stack-developer", "quality-gate-reviewer"],
  runtime: ["devops-sre", "qa-test-engineer", "quality-gate-reviewer"],
  implementation: ["stack-developer", "code-reviewer"],
  verification: ["qa-test-engineer", "quality-gate-reviewer"],
  documentation: ["stack-developer", "quality-gate-reviewer"],
};

export function dispatchTask(task, options = {}) {
  const category = task.category || "implementation";
  const chain = DEFAULT_CHAINS[category] || DEFAULT_CHAINS.implementation;
  const underperformers = new Set(options.underperformers || []);
  const primary = chain.find((agent) => !underperformers.has(agent)) || chain[0];
  const reviewer = chain.find((agent) => agent !== primary && /reviewer|auditor|engineer|gate/.test(agent))
    || "quality-gate-reviewer";
  const availability = checkAvailabilitySync(primary, reviewer, options.availableAgents);
  const capabilityGaps = availability.available ? [] : availability.missing;

  return {
    taskId: task.id,
    primaryAgentId: primary,
    reviewerAgentId: reviewer,
    fallbackAgents: chain.filter((agent) => agent !== primary),
    chain,
    reason: `category=${category}; risk=${task.policyRiskLevel || "low"}`,
    routingSignals: {
      category,
      stack: options.stack || task.stack || "unknown",
      fileImpact: task.fileImpact || task.filesTouched || [],
      previousResults: options.previousResults || [],
      policyRisk: task.policyRiskLevel || "low",
    },
    availabilityStatus: availability.available ? "available" : "missing",
    availabilityChecks: {
      primary: !availability.missing.includes(primary),
      reviewer: !availability.missing.includes(reviewer),
      fallback: chain.some((agent) => agent !== primary && !availability.missing.includes(agent)),
      skills: true,
      mcp: true,
    },
    capabilityGaps,
    requiredHandoffContract: ["summary", "decisions", "filesTouched", "openRisks", "verificationEvidence", "confidenceScore"],
  };
}

export async function loadAvailableAgents(rootDir) {
  const candidates = {
    "repo-researcher": "agents/_core/repo-researcher.md",
    "dependency-reviewer": "agents/_ops/dependency-reviewer.md",
    "stack-developer": "agents/stacks/react/react-implementer.md",
    "qa-test-engineer": "agents/_product/qa-test-engineer.md",
    "quality-gate-reviewer": "agents/_core/quality-gate-reviewer.md",
    "creative-director": "agents/_design/creative-director.md",
    "ux-ui-designer": "agents/_design/ux-ui-designer.md",
    "prototype-builder": "agents/_design/prototype-builder.md",
    "ui-polish-reviewer": "agents/_design/ui-polish-reviewer.md",
    "systems-analyst": "agents/_product/systems-analyst.md",
    "architect-reviewer": "agents/_core/architect-reviewer.md",
    "code-reviewer": "agents/_core/code-reviewer.md",
    "security-auditor": "agents/_core/security-auditor.md",
    "devops-sre": "agents/_ops/devops-sre.md",
    "root-cause-debugger": "agents/_core/root-cause-debugger.md",
  };
  const available = {};
  for (const [id, relPath] of Object.entries(candidates)) {
    try {
      await access(join(rootDir, relPath));
      available[id] = relPath;
    } catch {
      // Missing specialists are handled by dispatch confidence caps.
    }
  }
  return available;
}

function checkAvailabilitySync(primary, reviewer, availableAgents) {
  if (!availableAgents) return { available: true, missing: [] };
  const missing = [primary, reviewer].filter((agent) => !(agent in availableAgents));
  return { available: missing.length === 0, missing };
}
