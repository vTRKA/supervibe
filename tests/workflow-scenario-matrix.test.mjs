import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateActiveWorkflows } from "../scripts/validate-active-workflows.mjs";
import { validatePlanReviewGateForPlan } from "../scripts/validate-plan-review-artifacts.mjs";
import { validateDesignActiveCompletion } from "../scripts/lib/design-active-completion.mjs";
import { evaluateTaskBudgetPolicy } from "../scripts/lib/supervibe-task-budget-policy.mjs";
import { buildTaskGraphMaturityReport } from "../scripts/lib/supervibe-task-graph-maturity.mjs";
import {
  summarizeTrackerMappingForBundle,
  validateTrackerMapping,
} from "../scripts/lib/supervibe-task-tracker-sync.mjs";

const ROOT = process.cwd();

test("workflow scenario matrix covers hidden blocker classes with executable checks", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-workflow-scenarios-"));
  try {
    const missingActive = validateActiveWorkflows(projectRoot, { strict: true });
    assert.equal(missingActive.pass, false);
    assert.ok(missingActive.issues.some((issue) => issue.code === "active-workflow-state-missing"));

    const reviewAbsent = await validatePlanReviewGateForPlan({
      rootDir: projectRoot,
      planPath: ".supervibe/artifacts/plans/missing-plan.md",
      requireActiveReview: true,
    });
    assert.equal(reviewAbsent.pass, false);
    assert.match(reviewAbsent.issues.join("\n"), /no plan review artifacts found|missing active review artifact/);

    const prototypeDir = join(projectRoot, ".supervibe", "artifacts", "prototypes", "chat-redesign");
    mkdirSync(prototypeDir, { recursive: true });
    writeFileSync(join(prototypeDir, "index.html"), "<!doctype html><title>durable prototype</title>\n", "utf8");
    const falseNotStarted = validateDesignActiveCompletion(projectRoot);
    assert.equal(falseNotStarted.status, "blocked");
    assert.ok(falseNotStarted.issues.some((issue) => issue.code === "durable-design-artifacts-without-active-receipts"));

    const graph = {
      graph_id: "current-graph",
      tasks: [{ id: "task-a", title: "Do the work", status: "ready" }],
    };
    const staleMapping = {
      schemaVersion: 1,
      graphId: "old-graph",
      items: {
        ghost: { nativeId: "ghost", externalId: "EXT-1", status: "stale", itemHash: "old" },
      },
    };
    const mappingReport = validateTrackerMapping({ graph, mapping: staleMapping, requireComplete: true });
    assert.equal(mappingReport.ok, false);
    assert.deepEqual(
      mappingReport.issues.map((issue) => issue.code).sort(),
      ["graph-id-mismatch", "missing-mapping", "orphan-mapping"].sort(),
    );
    assert.equal(summarizeTrackerMappingForBundle(staleMapping).stale, 1);

    const budgetReport = evaluateTaskBudgetPolicy({
      items: Array.from({ length: 5 }, (_, index) => ({
        id: `task-${index + 1}`,
        type: "task",
        executionHints: { parentTaskRef: "phase-1" },
      })),
      policy: { maxTasksPerPhase: 2, maxChildItemsPerAtomizationRun: 3 },
      decision: {},
    });
    assert.equal(budgetReport.pass, false);
    assert.deepEqual(
      budgetReport.violations.map((item) => item.code).sort(),
      ["max-child-items-per-atomization-run-exceeded", "max-tasks-per-phase-exceeded"].sort(),
    );
    assert.match(budgetReport.prompt, /PHASE_SPLIT_REQUIRED/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("direct UI mutation requires preview token and active graph maturity rejects ambiguous active graphs", () => {
  const uiServer = readFileSync(join(ROOT, "scripts", "lib", "supervibe-ui-server.mjs"), "utf8");
  assert.match(uiServer, /body\.confirm !== "apply-local"/);
  assert.match(uiServer, /consumePreviewToken\(previewTokens, body\.previewToken, scope\)/);
  assert.match(uiServer, /apply requires valid previewToken/);
  assert.match(uiServer, /Preview this exact action before applying it\./);

  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-active-graph-scenarios-"));
  try {
    const first = join(projectRoot, ".supervibe", "memory", "work-items", "completed-epic");
    const second = join(projectRoot, ".supervibe", "memory", "work-items", "current-epic");
    mkdirSync(first, { recursive: true });
    mkdirSync(second, { recursive: true });
    writeFileSync(join(first, "graph.json"), JSON.stringify({ graph_id: "completed-epic", tasks: [] }, null, 2), "utf8");
    writeFileSync(join(second, "graph.json"), JSON.stringify({ graph_id: "current-epic", tasks: [] }, null, 2), "utf8");

    const report = buildTaskGraphMaturityReport(projectRoot, { requireActiveGraph: true });
    const traceability = report.dimensions.find((dimension) => dimension.id === "active-traceability");
    const completion = report.dimensions.find((dimension) => dimension.id === "active-trusted-completion");
    assert.equal(traceability.pass, false);
    assert.match(traceability.blockers.join("\n"), /exactly one active graph is required/);
    assert.equal(completion.pass, false);
    assert.match(completion.blockers.join("\n"), /exactly one active graph is required/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
