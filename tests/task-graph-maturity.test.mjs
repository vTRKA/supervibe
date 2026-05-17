import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildTaskGraphMaturityReport,
  formatTaskGraphMaturityReport,
} from "../scripts/lib/supervibe-task-graph-maturity.mjs";
import { issueWorkflowInvocationReceipt } from "../scripts/lib/supervibe-workflow-receipt-runtime.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test("task graph maturity reports 10 of 10 for the repository capability surface", () => {
  const report = buildTaskGraphMaturityReport(ROOT);

  assert.equal(report.pass, true);
  assert.equal(report.score, 10);
  assert.equal(report.status, "10-of-10-ready");
  assert.ok(report.dimensions.some((dimension) => dimension.id === "routing" && dimension.pass));
  assert.match(formatTaskGraphMaturityReport(report), /SUPERVIBE_TASK_GRAPH_MATURITY/);
});

test("task graph maturity strict active graph mode blocks missing current graph coverage", () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-task-graph-maturity-empty-"));
  writeMinimalSurface(root);
  const report = buildTaskGraphMaturityReport(root, { requireActiveGraph: true });

  assert.equal(report.pass, false);
  assert.ok(report.dimensions.some((dimension) => dimension.id === "current-active-graph" && !dimension.pass));
  assert.match(formatTaskGraphMaturityReport(report), /no active work-item graph selected|atomize a user-approved loop-ready plan before execution/);
});

test("task graph runtime maturity blocks stale work-item registry", () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-task-graph-maturity-stale-index-"));
  writeMinimalSurface(root);
  writeRuntimeGraph(root, { source: "## Acceptance Criteria\n- Runtime requirement.\n" });
  writeFileSync(join(root, ".supervibe", "memory", "work-items", "index.json"), `${JSON.stringify({
    schemaVersion: 1,
    activeEpicId: "epic-runtime",
    activeGraphPath: ".supervibe/memory/work-items/epic-runtime/missing.json",
    epics: {
      "epic-runtime": {
        epicId: "epic-runtime",
        graphPath: ".supervibe/memory/work-items/epic-runtime/missing.json",
        status: "active",
      },
    },
  }, null, 2)}\n`, "utf8");

  const report = buildTaskGraphMaturityReport(root, { requireActiveGraph: true });

  assert.equal(report.pass, false);
  assert.ok(report.dimensions.some((dimension) => dimension.id === "work-item-registry" && !dimension.pass));
});

test("task graph runtime maturity blocks neutral traceability", () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-task-graph-maturity-neutral-trace-"));
  writeMinimalSurface(root);
  writeRuntimeGraph(root, { source: "# Source Without Requirements\n" });

  const report = buildTaskGraphMaturityReport(root, { requireActiveGraph: true });

  assert.equal(report.pass, false);
  assert.ok(report.dimensions.some((dimension) => dimension.id === "active-traceability" && !dimension.pass));
});

test("task graph runtime maturity ignores closed historical graphs for active traceability", () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-task-graph-maturity-active-filter-"));
  writeMinimalSurface(root);
  writeRuntimeGraph(root, { source: "## Acceptance Criteria\n- Runtime requirement.\n" });
  const closedDir = join(root, ".supervibe", "memory", "work-items", "epic-closed");
  mkdirSync(closedDir, { recursive: true });
  writeFileSync(join(closedDir, "source-plan.md"), "## Acceptance Criteria\n- Closed requirement.\n", "utf8");
  writeFileSync(join(closedDir, "graph.json"), `${JSON.stringify({
    graph_id: "epic-closed",
    source: { snapshotPath: "source-plan.md" },
    items: [
      { itemId: "epic-closed", type: "epic", status: "closed", title: "Closed" },
      { itemId: "task-closed", type: "task", status: "complete", title: "Closed requirement" },
    ],
  }, null, 2)}\n`, "utf8");

  const report = buildTaskGraphMaturityReport(root, { requireActiveGraph: true });
  const traceability = report.dimensions.find((item) => item.id === "active-traceability");

  assert.notEqual(traceability.summary, "2 active graph candidate(s) found");
  assert.equal(traceability.blockers.some((blocker) => /exactly one active graph/.test(blocker)), false);
});


test("task graph runtime maturity uses registry-selected graph when stale open graphs exist", () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-task-graph-maturity-registry-selected-"));
  writeMinimalSurface(root);
  writeRuntimeGraph(root, { source: "## Acceptance Criteria\n- Runtime requirement.\n" });
  writeFileSync(join(root, ".supervibe", "memory", "work-items", "index.json"), `${JSON.stringify({
    schemaVersion: 1,
    activeEpicId: "epic-runtime",
    activeGraphPath: ".supervibe/memory/work-items/epic-runtime/graph.json",
    epics: {
      "epic-runtime": {
        epicId: "epic-runtime",
        graphPath: ".supervibe/memory/work-items/epic-runtime/graph.json",
        sourcePlanPath: ".supervibe/artifacts/plans/missing.md",
        status: "active",
      },
    },
  }, null, 2)}\n`, "utf8");

  const staleDir = join(root, ".supervibe", "memory", "work-items", "epic-stale-open");
  mkdirSync(staleDir, { recursive: true });
  writeFileSync(join(staleDir, "source-plan.md"), "## Acceptance Criteria\n- Stale requirement.\n", "utf8");
  writeFileSync(join(staleDir, "graph.json"), `${JSON.stringify({
    graph_id: "epic-stale-open",
    source: { snapshotPath: "source-plan.md" },
    items: [
      { itemId: "epic-stale-open", type: "epic", status: "open", title: "Stale" },
      { itemId: "task-stale", type: "task", status: "ready", title: "Stale requirement" },
    ],
  }, null, 2)}\n`, "utf8");

  const report = buildTaskGraphMaturityReport(root, { requireActiveGraph: true });
  const current = report.dimensions.find((item) => item.id === "current-active-graph");
  const traceability = report.dimensions.find((item) => item.id === "active-traceability");
  const trustedCompletion = report.dimensions.find((item) => item.id === "active-trusted-completion");

  assert.equal(current.pass, true);
  assert.equal(traceability.blockers.some((blocker) => /exactly one active graph/.test(blocker)), false);
  assert.equal(trustedCompletion.blockers.some((blocker) => /exactly one active graph/.test(blocker)), false);
  assert.deepEqual(traceability.evidence, [".supervibe/memory/work-items/epic-runtime/graph.json"]);
});

test("task graph runtime maturity rejects validator and command-only receipts", async () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-task-graph-maturity-receipt-filter-"));
  writeMinimalSurface(root);
  const commandOutput = ".supervibe/artifacts/receipt-filter/command.json";
  const validatorOutput = ".supervibe/artifacts/receipt-filter/validator.json";
  writeJsonArtifact(root, commandOutput, { status: "pass", source: "command-only" });
  writeJsonArtifact(root, validatorOutput, { status: "pass", source: "validator" });
  const commandReceipt = await issueWorkflowInvocationReceipt({
    rootDir: root,
    command: "/supervibe-loop",
    subjectType: "command",
    subjectId: "supervibe-loop",
    stage: "release-completion",
    invocationReason: "command-only graph receipt cannot satisfy active trusted completion",
    outputArtifacts: [commandOutput],
    startedAt: "2026-05-10T00:00:00.000Z",
    completedAt: "2026-05-10T00:01:00.000Z",
    handoffId: "receipt-filter",
    graphId: "epic-runtime",
  });
  const validatorReceipt = await issueWorkflowInvocationReceipt({
    rootDir: root,
    command: "/supervibe-loop",
    subjectType: "validator",
    subjectId: "validator-output",
    stage: "release-completion",
    invocationReason: "validator graph receipt cannot satisfy active trusted completion",
    outputArtifacts: [validatorOutput],
    startedAt: "2026-05-10T00:00:00.000Z",
    completedAt: "2026-05-10T00:01:00.000Z",
    handoffId: "receipt-filter-validator",
    graphId: "epic-runtime",
  });

  writeRuntimeGraph(root, {
    source: "## Acceptance Criteria\n- Runtime requirement.\n",
    evidence: [{
      status: "pass",
      command: "node --test tests/runtime.test.mjs",
      outputSummary: "validator-only evidence is not enough",
      receiptId: validatorReceipt.receipt.receiptId,
    }],
  });

  const report = buildTaskGraphMaturityReport(root, { requireActiveGraph: true });
  const dimension = report.dimensions.find((item) => item.id === "active-trusted-completion");

  assert.equal(dimension.pass, false);
  assert.ok(dimension.blockers.some((blocker) => blocker.includes("untrusted-evidence")));
  assert.equal(dimension.summary.includes(commandReceipt.receipt.receiptId), false);
});

test("task graph runtime maturity rejects receipts bound to another graph or task", async () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-task-graph-maturity-wrong-binding-"));
  writeMinimalSurface(root);
  const outputArtifact = ".supervibe/artifacts/wrong-binding/worker.json";
  const invocationId = "test-stack-developer-wrong-binding";
  writeJsonArtifact(root, outputArtifact, { status: "pass", source: "wrong-binding" });
  writeTestAgentInvocation(root, {
    agentId: "stack-developer",
    invocationId,
    taskSummary: "worker receipt bound to another graph",
  });
  const { receipt } = await issueWorkflowInvocationReceipt({
    rootDir: root,
    command: "/supervibe-loop",
    subjectType: "worker",
    subjectId: "stack-developer",
    agentId: "stack-developer",
    stage: "T1-wrong-binding",
    invocationReason: "receipt bound to another graph must not satisfy active completion",
    outputArtifacts: [outputArtifact],
    startedAt: "2026-05-10T00:00:00.000Z",
    completedAt: "2026-05-10T00:01:00.000Z",
    handoffId: "wrong-binding",
    graphId: "epic-other",
    taskId: "epic-other-t1",
    hostInvocation: {
      source: "codex-spawn-agent",
      invocationId,
      agentId: "stack-developer",
    },
  });

  writeRuntimeGraph(root, {
    source: "## Acceptance Criteria\n- Runtime requirement.\n",
    evidence: [{
      status: "pass",
      command: "node --test tests/runtime.test.mjs",
      outputSummary: "copied wrong binding receipt must not count",
      receiptId: receipt.receiptId,
    }],
  });

  const report = buildTaskGraphMaturityReport(root, { requireActiveGraph: true });
  const dimension = report.dimensions.find((item) => item.id === "active-trusted-completion");

  assert.equal(dimension.pass, false);
  assert.ok(dimension.blockers.some((blocker) => blocker.includes("untrusted-evidence")));
});

test("task graph runtime maturity blocks active legacy completion evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-task-graph-maturity-legacy-evidence-"));
  writeMinimalSurface(root);
  writeRuntimeGraph(root, {
    source: "## Acceptance Criteria\n- Runtime requirement.\n",
    epicStatus: "open",
    evidence: [{
      status: "pass",
      command: "node --test tests/runtime.test.mjs",
      receiptId: "legacy-graph-evidence-migration-1",
    }],
  });

  const report = buildTaskGraphMaturityReport(root, { requireActiveGraph: true });
  const dimension = report.dimensions.find((item) => item.id === "active-trusted-completion");

  assert.equal(report.pass, false);
  assert.equal(dimension.pass, false);
  assert.ok(dimension.blockers.some((blocker) => blocker.includes("legacy-evidence")));
});

test("task graph maturity CLI prints a machine-readable report", () => {
  const stdout = execFileSync(process.execPath, [
    join(ROOT, "scripts/supervibe-task-graph-maturity.mjs"),
  ], {
    cwd: ROOT,
    encoding: "utf8",
  });

  assert.match(stdout, /SUPERVIBE_TASK_GRAPH_MATURITY/);
  assert.match(stdout, /SCORE: 10\/10/);
  assert.match(stdout, /STATUS: 10-of-10-ready/);
});

function writeMinimalSurface(root) {
  const files = {
    "scripts/supervibe-loop.mjs": "--atomize-plan --claim-ready --adopt-completed --validate-completion --require-trusted-evidence --auto-ui-dry-run --no-auto-ui trustedReceiptIdsForValidation --split --reparent --skip --block --delete --edit",
    "scripts/lib/supervibe-ui-server.mjs": "no-active-graph atomizeReviewedPlan tracker actionImpact claim defer close reopen skip cancel create edit split reparent dep-add dep-remove delete",
    "scripts/lib/supervibe-durable-task-tracker-adapter.mjs": "createEpic createTask addDependency ready claim update close syncPush syncPull",
    "scripts/lib/supervibe-task-tracker-sync.mjs": "validateTrackerMapping diagnoseTrackerSyncConflicts partial-sync redactTrackerSyncDiagnostics",
    "scripts/validate-work-item-graphs.mjs": "validator",
    "scripts/validate-epic-completion.mjs": "strict-coverage require-trusted-evidence validateWorkflowReceiptTrust",
    "scripts/lib/supervibe-epic-completion-validator.mjs": "validator isStructuredProductionEvidence insufficient-evidence requireTrustedEvidence untrusted-evidence",
    "scripts/lib/supervibe-plan-to-work-items.mjs": "atomize",
    "tests/supervibe-commands-routing.test.mjs": "test",
    "tests/supervibe-plan-to-work-items.test.mjs": "test",
    "tests/supervibe-loop-work-items.test.mjs": "test",
    "tests/supervibe-work-item-actions.test.mjs": "test",
    "tests/supervibe-ui-server.test.mjs": "test",
    "tests/supervibe-epic-completion-validator.test.mjs": "test",
    "tests/fixtures/artifacts/work-item-graphs/sample.work-item-graph.json": "{}",
  };
  for (const [file, content] of Object.entries(files)) {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${content}\n`, "utf8");
  }
}

function writeTestAgentInvocation(root, { agentId, invocationId, taskSummary }) {
  const outputJson = `.supervibe/artifacts/_agent-outputs/${invocationId}/agent-output.json`;
  mkdirSync(join(root, ".supervibe", "memory"), { recursive: true });
  mkdirSync(dirname(join(root, ...outputJson.split("/"))), { recursive: true });
  writeFileSync(join(root, ...outputJson.split("/")), `${JSON.stringify({
    schemaVersion: 1,
    invocationId,
    agentId,
    taskSummary,
  }, null, 2)}\n`, "utf8");
  appendFileSync(join(root, ".supervibe", "memory", "agent-invocations.jsonl"), `${JSON.stringify({
    schemaVersion: 1,
    ts: "2026-05-10T00:00:00.000Z",
    invocation_id: invocationId,
    agent_id: agentId,
    task_summary: taskSummary,
    confidence_score: 10,
    structured_output: { json: outputJson },
  })}\n`, "utf8");
}

function writeJsonArtifact(root, relativePath, value) {
  const path = join(root, ...String(relativePath).split("/"));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function writeRuntimeGraph(root, {
  source,
  epicStatus = "open",
  evidence = [{ status: "pass", command: "node --test tests/runtime.test.mjs" }],
} = {}) {
  const graphDir = join(root, ".supervibe", "memory", "work-items", "epic-runtime");
  mkdirSync(graphDir, { recursive: true });
  writeFileSync(join(graphDir, "source-plan.md"), source, "utf8");
  writeFileSync(join(graphDir, "graph.json"), `${JSON.stringify({
    graph_id: "epic-runtime",
    source: { snapshotPath: "source-plan.md" },
    items: [
      { itemId: "epic-runtime", type: "epic", status: epicStatus, title: "Runtime" },
      {
        itemId: "task-runtime",
        type: "task",
        status: "complete",
        title: "Runtime requirement",
        evidence,
      },
    ],
  }, null, 2)}\n`, "utf8");
  writeFileSync(join(root, ".supervibe", "memory", "work-items", "index.json"), `${JSON.stringify({
    schemaVersion: 1,
    activeEpicId: null,
    activeGraphPath: null,
    epics: {
      "epic-runtime": {
        epicId: "epic-runtime",
        graphPath: ".supervibe/memory/work-items/epic-runtime/graph.json",
        sourcePlanPath: ".supervibe/artifacts/plans/missing.md",
        status: "active",
      },
    },
  }, null, 2)}\n`, "utf8");
}
