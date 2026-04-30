import { routeWorkflowIntent } from "./supervibe-workflow-router.mjs";

export function diagnoseTriggerRequest(request, options = {}) {
  const route = routeWorkflowIntent({
    userPhrase: request,
    artifacts: options.artifacts ?? {},
    recentAssistantOutput: options.recentAssistantOutput,
    lastCompletedPhase: options.lastCompletedPhase,
    dirtyGitState: options.dirtyGitState,
  }, options);
  const likelyCause = likelyCauseFor(route);
  return {
    request,
    route,
    pass: route.intent !== "unknown" && route.missingArtifacts.length === 0 && route.safetyBlockers.length === 0,
    likelyCause,
    recommendedAction: recommendedActionFor(route),
    evidence: {
      matchedPhrase: route.matchedPhrase,
      reason: route.reason,
      confidence: route.confidence,
      missingArtifacts: route.missingArtifacts,
      safetyBlockers: route.safetyBlockers,
    },
  };
}

export function formatTriggerDiagnostic(report) {
  const lines = [
    "=== Supervibe Trigger Diagnostic ===",
    `Intent: ${report.route.intent}`,
    `Confidence: ${report.route.confidence}`,
    `Command: ${report.route.command}`,
    `Skill: ${report.route.skill}`,
    `Reason: ${report.route.reason}`,
  ];
  if (report.evidence.missingArtifacts.length > 0) {
    lines.push(`Missing artifacts: ${report.evidence.missingArtifacts.join(", ")}`);
  }
  if (report.evidence.safetyBlockers.length > 0) {
    lines.push(`Safety blockers: ${report.evidence.safetyBlockers.join(", ")}`);
  }
  lines.push(`Likely cause: ${report.likelyCause}`);
  lines.push(`Recommended action: ${report.recommendedAction}`);
  lines.push(`Next: ${report.route.nextQuestion ?? report.route.nextPromptText}`);
  return lines.join("\n");
}

function likelyCauseFor(route) {
  if (route.intent === "unknown") return "No exact corpus or keyword route matched the user request.";
  if (route.missingArtifacts.length > 0) return "The trigger matched, but required artifact context is missing.";
  if (route.safetyBlockers.length > 0) return "The trigger matched, but safe execution needs an explicit gate first.";
  return "The trigger matched and is ready to hand off.";
}

function recommendedActionFor(route) {
  if (route.intent === "unknown") return "Add a corpus phrase or strengthen the command/skill description.";
  if (route.missingArtifacts.length > 0) return `Provide: ${route.missingArtifacts.join(", ")}.`;
  if (route.safetyBlockers.length > 0) return `Resolve safety gates: ${route.safetyBlockers.join(", ")}.`;
  return `Run ${route.command} through ${route.skill}.`;
}
