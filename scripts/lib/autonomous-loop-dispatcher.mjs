import { access } from "node:fs/promises";
import { join } from "node:path";
import { createAgentCapabilityRegistry, matchAgentForTask } from "./supervibe-agent-capability-registry.mjs";
import { explainAssignment } from "./supervibe-assignment-explainer.mjs";
import { loadAgentRoster } from "./supervibe-agent-roster.mjs";
import { selectReviewerPreset, selectWorkerPreset } from "./supervibe-worker-reviewer-presets.mjs";

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
  const anchorOwner = selectAnchorOwner(task, options.anchorOwnership || {});
  const registry = options.capabilityRegistry || createAgentCapabilityRegistry();
  const useCapabilityRegistry = Boolean(options.capabilityRegistry || options.useCapabilityRegistry);
  const capabilityMatch = anchorOwner || !useCapabilityRegistry ? null : matchAgentForTask(task, { registry });
  const workerPreset = selectWorkerPreset(task);
  const primaryCandidate = anchorOwner || (capabilityMatch?.status === "matched" ? capabilityMatch.agent.agentId : chain[0]);
  const preferredChain = primaryCandidate ? [primaryCandidate, ...chain.filter((agent) => agent !== primaryCandidate)] : chain;
  const primary = preferredChain.find((agent) => !underperformers.has(agent)) || preferredChain[0];
  const reviewerPreset = selectReviewerPreset({ task, workerAgentId: primary });
  const reviewer = reviewerPreset.agentId || chain.find((agent) => agent !== primary && /reviewer|auditor|engineer|gate/.test(agent))
    || "quality-gate-reviewer";
  const availability = checkAvailabilitySync(primary, reviewer, options.availableAgents);
  const capabilityGaps = availability.available ? [] : availability.missing;

  return {
    taskId: task.id,
    primaryAgentId: primary,
    reviewerAgentId: reviewer,
    fallbackAgents: preferredChain.filter((agent) => agent !== primary),
    chain: preferredChain,
    reason: `category=${category}; risk=${task.policyRiskLevel || "low"}${anchorOwner ? `; anchorOwner=${anchorOwner}` : ""}${capabilityMatch?.status === "matched" ? `; capability=${capabilityMatch.score}` : ""}`,
    routingSignals: {
      category,
      stack: options.stack || task.stack || "unknown",
      fileImpact: task.fileImpact || task.filesTouched || [],
      semanticAnchors: (task.semanticAnchors || []).map((anchor) => anchor.anchorId || anchor.id),
      fileLocalContractRefs: task.fileLocalContractRefs || [],
      previousResults: options.previousResults || [],
      policyRisk: task.policyRiskLevel || "low",
      workerPreset: workerPreset.name,
      reviewerPreset: reviewerPreset.name,
    },
    assignmentExplanation: explainAssignment({
      task,
      worker: { agentId: primary, reasons: capabilityMatch?.reasons || [`preset=${workerPreset.name}`], requiredEvidence: workerPreset.requiredEvidence },
      reviewer: { agentId: reviewer, preset: reviewerPreset.name, requiredEvidence: reviewerPreset.requiredEvidence },
      alternatives: capabilityMatch?.alternatives || [],
      requiredEvidence: [...(workerPreset.requiredEvidence || []), ...(reviewerPreset.requiredEvidence || [])],
    }),
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

function selectAnchorOwner(task = {}, ownership = {}) {
  const anchorRefs = [
    ...(task.anchorRefs || []),
    ...(task.semanticAnchors || []).map((anchor) => anchor.anchorId || anchor.id),
  ].filter(Boolean);
  for (const anchorRef of anchorRefs) {
    if (ownership[anchorRef]) return ownership[anchorRef];
  }
  return null;
}

export async function loadAvailableAgents(rootDir) {
  const roster = await loadAgentRoster({ rootDir });
  const available = Object.fromEntries((roster.agents || []).map((agent) => [agent.id, agent.path]));
  await addLegacyAvailabilityAliases(rootDir, available);
  return available;
}

async function addLegacyAvailabilityAliases(rootDir, available) {
  if (!available["stack-developer"]) {
    const stackAgent = Object.entries(available).find(([, relPath]) => normalizeRel(relPath).includes("/stacks/"));
    if (stackAgent) available["stack-developer"] = stackAgent[1];
  }
  const legacy = {
    "stack-developer": "agents/stacks/react/react-implementer.md",
  };
  for (const [id, relPath] of Object.entries(legacy)) {
    if (available[id]) continue;
    try {
      await access(join(rootDir, relPath));
      available[id] = relPath;
    } catch {
      // Missing specialists are handled by dispatch confidence caps.
    }
  }
}

function checkAvailabilitySync(primary, reviewer, availableAgents) {
  if (!availableAgents) return { available: true, missing: [] };
  const missing = [primary, reviewer].filter((agent) => !(agent in availableAgents));
  return { available: missing.length === 0, missing };
}

function normalizeRel(value) {
  return String(value || "").replace(/\\/g, "/");
}
