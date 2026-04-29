const SCENARIOS = [
  "plan execution",
  "validation request",
  "integration repair",
  "design to development",
  "refactor",
  "documentation",
  "monorepo",
  "flaky tests",
  "missing credentials",
  "policy stop",
  "server docker deploy",
  "mcp validation",
];

export function buildScenarioMatrix() {
  return SCENARIOS.map((scenario) => ({
    scenario,
    intake: "task-source",
    dispatch: scenario.includes("design") ? "design-chain" : "standard-chain",
    evidence: ["task", "handoff", "score"],
    confidenceGate: 9,
    stopBehavior: scenario.includes("policy") || scenario.includes("missing") ? "blocked" : "complete",
  }));
}

export function hasScenarioCoverage(matrix, expected = SCENARIOS) {
  const present = new Set(matrix.map((item) => item.scenario));
  const missing = expected.filter((item) => !present.has(item));
  return { ok: missing.length === 0, missing };
}
