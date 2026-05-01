export function createHappyPathPlan({
  prdPath = null,
  planPath = null,
  request = "",
  epicId = "<epic-id>",
  graphPath = null,
  maxDuration = "3h",
  tool = "codex",
  dryRun = true,
} = {}) {
  const source = planPath || prdPath || request || "<request>";
  const graph = graphPath || `.supervibe/memory/work-items/${epicId}/graph.json`;
  const atomizeCommand = planPath
    ? `npm run supervibe:loop -- --atomize-plan ${planPath} ${dryRun ? "--dry-run" : "--plan-review-passed"}`
    : prdPath
      ? `npm run supervibe:loop -- --from-prd ${prdPath} --dry-run`
      : `npm run supervibe:loop -- --request "${escapeCommandText(request || "describe the feature")}" --dry-run`;
  return {
    schemaVersion: 1,
    kind: "supervibe-happy-path",
    source,
    dryRun,
    phases: [
      phase("prd-plan", "PRD/Plan", "Start from an accepted PRD, reviewed plan, or request.", source),
      phase("atomize", "Atomize", "Preview or write the native work-item graph.", atomizeCommand),
      phase("inspect", "Inspect", "Open the universal visual control plane.", `npm run supervibe:ui -- --file ${graph}`),
      phase("context", "Context", "Preview the compact task context before execution.", `npm run supervibe:context-pack -- --file ${graph} --item T1`),
      phase("execute", "Execute", "Run bounded provider-safe execution.", `npm run supervibe:loop -- --epic ${epicId} --guided --max-duration ${maxDuration} --fresh-context --tool ${tool}`),
      phase("verify", "Verify", "Inspect status, gates, reports, and assignment reasoning.", `npm run supervibe:status -- --report sla --file ${graph}`),
      phase("archive", "Close/Archive", "Clean up completed work and stale memory with a reversible dry-run first.", "npm run supervibe:gc -- --all --dry-run"),
    ],
    guardrails: [
      "Atomization writes require plan review unless running dry-run.",
      "Execution is bounded and provider-safe; no permission bypass is implied.",
      "UI mutations are preview-first and require explicit local apply confirmation.",
      "GC archives, never deletes, and restore remains available.",
    ],
  };
}

export function formatHappyPathPlan(plan = {}) {
  return [
    "SUPERVIBE_HAPPY_PATH",
    `SOURCE: ${plan.source || "unknown"}`,
    `DRY_RUN: ${Boolean(plan.dryRun)}`,
    ...((plan.phases || []).map((item, index) => `${index + 1}. ${item.label}: ${item.command}`)),
    `GUARDRAILS: ${(plan.guardrails || []).join(" | ")}`,
  ].join("\n");
}

function phase(id, label, description, command) {
  return { id, label, description, command };
}

function escapeCommandText(value = "") {
  return String(value).replace(/"/g, '\\"');
}
