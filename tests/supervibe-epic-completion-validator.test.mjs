import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { atomizePlanToWorkItems } from "../scripts/lib/supervibe-plan-to-work-items.mjs";
import {
  formatEpicCompletionReport,
  validateEpicCompletion,
} from "../scripts/lib/supervibe-epic-completion-validator.mjs";
import {
  validateEpicCompletionFiles,
} from "../scripts/validate-epic-completion.mjs";
import {
  issueWorkflowInvocationReceipt,
} from "../scripts/lib/supervibe-workflow-receipt-runtime.mjs";
import {
  createFinalReviewerSweep,
} from "../scripts/lib/supervibe-final-review-sweep.mjs";

const PLAN = `# Completion Plan

Critical path: T1 -> T2

## Task 1: Build completion validator
**Files:**
- Create: \`scripts/lib/completion.js\`
**Acceptance Criteria:**
- Validator identifies closed work.
\`\`\`bash
node --test tests/completion.test.mjs
\`\`\`

## Task 2: Wire completion CLI
**Files:**
- Create: \`scripts/validate-completion.mjs\`
**Acceptance Criteria:**
- CLI fails open work.
\`\`\`bash
node scripts/validate-completion.mjs --file graph.json
\`\`\`
`;

const ROOT = fileURLToPath(new URL("../", import.meta.url));

test("validateEpicCompletion passes closed graph with production evidence", () => {
  const graph = completedGraph();
  const report = validateEpicCompletion(graph);

  assert.equal(report.pass, true);
  assert.equal(report.score, 10);
  assert.equal(report.counts.open, 0);
  assert.match(formatEpicCompletionReport(report), /PASS: true/);
});

test("validateEpicCompletion inherits parent evidence for covered plan-step subtasks", () => {
  const graph = completedGraph();
  const parent = graph.items.find((item) => item.type === "task");
  const subtask = graph.items.find((item) => item.parentId === parent.itemId && item.type === "subtask")
    || addCoveredPlanStepSubtask(graph, parent);
  assert.ok(subtask);

  subtask.verificationEvidence = [];
  graph.tasks.find((task) => task.id === subtask.itemId).verificationEvidence = [];
  graph.evidence = graph.evidence.filter((entry) => entry.taskId !== subtask.itemId);

  const report = validateEpicCompletion(graph);

  assert.equal(report.pass, true);
  assert.equal(report.issues.some((issue) => issue.code === "missing-evidence" && issue.itemId === subtask.itemId), false);
});

test("validateEpicCompletion fails open tasks and open epic", () => {
  const graph = completedGraph();
  graph.items.find((item) => item.itemId === "epic-completion-t2").status = "ready";
  graph.tasks.find((task) => task.id === "epic-completion-t2").status = "ready";
  graph.items.find((item) => item.type === "epic").status = "ready";

  const report = validateEpicCompletion(graph);

  assert.equal(report.pass, false);
  assert.ok(report.issues.some((issue) => issue.code === "epic-not-closed"));
  assert.ok(report.issues.some((issue) => issue.code === "item-open" && issue.itemId === "epic-completion-t2"));
});

test("validateEpicCompletion rejects dry-run evidence for production completion", () => {
  const graph = completedGraph();
  const task = graph.items.find((item) => item.itemId === "epic-completion-t1");
  task.verificationEvidence = ["dry-run verification evidence"];

  const production = validateEpicCompletion(graph);
  const diagnostic = validateEpicCompletion(graph, { allowDryRunEvidence: true });

  assert.equal(production.pass, false);
  assert.ok(production.issues.some((issue) => issue.code === "dry-run-evidence" && issue.nextAction));
  assert.equal(diagnostic.pass, true);
});

test("validateEpicCompletion requires skipped work to include reason and impact", () => {
  const graph = completedGraph();
  const task = graph.items.find((item) => item.itemId === "epic-completion-t1");
  task.status = "skipped";
  task.verificationEvidence = [];
  graph.tasks.find((item) => item.id === "epic-completion-t1").status = "skipped";

  const missing = validateEpicCompletion(graph);
  task.skipReason = "out of approved scope";
  const missingImpact = validateEpicCompletion(graph);
  task.skipImpact = "does not affect production readiness because the approved scope excludes this integration";
  const accepted = validateEpicCompletion(graph);

  assert.ok(missing.issues.some((issue) => issue.code === "missing-skip-reason"));
  assert.ok(missing.issues.some((issue) => issue.code === "missing-skip-impact"));
  assert.equal(missingImpact.issues.some((issue) => issue.code === "missing-skip-reason"), false);
  assert.ok(missingImpact.issues.some((issue) => issue.code === "missing-skip-impact"));
  assert.equal(accepted.pass, true);
});

test("validateEpicCompletion rejects event reason without structured evidence", () => {
  const graph = atomizePlanToWorkItems(PLAN, {
    planPath: ".supervibe/artifacts/plans/completion.md",
    epicId: "epic-completion",
    planReviewPassed: true,
  });
  graph.items = graph.items.map((item) => ({ ...item, status: "complete" }));
  graph.tasks = graph.tasks.map((task) => ({ ...task, status: "complete" }));
  graph.events = graph.items
    .filter((item) => item.type !== "epic" && item.type !== "followup")
    .map((item) => ({ action: "complete", itemId: item.itemId, reason: "verified manually" }));

  const report = validateEpicCompletion(graph);

  assert.equal(report.pass, false);
  assert.ok(report.issues.some((issue) => issue.code === "missing-evidence"));
});

test("validateEpicCompletion rejects unstructured production evidence", () => {
  const graph = completedGraph();
  const task = graph.items.find((item) => item.itemId === "epic-completion-t1");
  task.verificationEvidence = ["verified manually"];
  graph.tasks.find((item) => item.id === "epic-completion-t1").verificationEvidence = ["verified manually"];
  graph.evidence = graph.evidence.filter((item) => item.taskId !== "epic-completion-t1");

  const report = validateEpicCompletion(graph);

  assert.equal(report.pass, false);
  assert.ok(report.issues.some((issue) => issue.code === "insufficient-evidence" && issue.itemId === "epic-completion-t1"));
});

test("validateEpicCompletion can require trusted receipt evidence", () => {
  const graph = completedGraph();
  const task = graph.items.find((item) => item.itemId === "epic-completion-t1");
  task.verificationEvidence = [{
    taskId: "epic-completion-t1",
    receiptId: "receipt-not-trusted",
    status: "pass",
    outputSummary: "verified",
  }];
  graph.tasks.find((item) => item.id === "epic-completion-t1").verificationEvidence = task.verificationEvidence;
  graph.evidence = graph.evidence.filter((item) => item.taskId !== "epic-completion-t1").concat(task.verificationEvidence);
  for (const evidence of graph.evidence) {
    if (evidence.taskId !== "epic-completion-t1") evidence.receiptId = "trusted-receipt";
  }
  for (const item of graph.items) {
    for (const evidence of item.verificationEvidence || []) {
      if (evidence.taskId !== "epic-completion-t1") evidence.receiptId = "trusted-receipt";
    }
  }
  for (const item of graph.tasks) {
    for (const evidence of item.verificationEvidence || []) {
      if (evidence.taskId !== "epic-completion-t1") evidence.receiptId = "trusted-receipt";
    }
  }

  const blocked = validateEpicCompletion(graph, {
    requireTrustedEvidence: true,
    trustedReceiptIds: ["trusted-receipt"],
  });
  const trusted = validateEpicCompletion(graph, {
    requireTrustedEvidence: true,
    trustedReceiptIds: ["receipt-not-trusted", "trusted-receipt"],
  });

  assert.equal(blocked.pass, false);
  assert.ok(blocked.issues.some((issue) => issue.code === "untrusted-evidence" && issue.itemId === "epic-completion-t1"));
  assert.equal(trusted.pass, true);
});

test("validateEpicCompletion accepts trusted graph-level completion receipt for closed tasks", () => {
  const graph = completedGraph();
  graph.evidence = [];
  graph.items = graph.items.map((item) => ({
    ...item,
    verificationEvidence: item.type === "epic" ? item.verificationEvidence : [],
  }));
  graph.tasks = graph.tasks.map((task) => ({ ...task, verificationEvidence: [] }));

  const blocked = validateEpicCompletion(graph, {
    requireTrustedEvidence: true,
    trustedReceiptIds: ["graph-release-receipt"],
  });
  const trusted = validateEpicCompletion(graph, {
    requireTrustedEvidence: true,
    trustedReceiptIds: ["graph-release-receipt"],
    trustedGraphReceiptIds: ["graph-release-receipt"],
  });

  assert.equal(blocked.pass, false);
  assert.ok(blocked.issues.some((issue) => issue.code === "missing-evidence"));
  assert.equal(trusted.pass, true);
});

test("validateEpicCompletion blocks legacy migrated evidence in strict production mode", () => {
  const graph = completedGraph();
  const task = graph.items.find((item) => item.itemId === "epic-completion-t1");
  task.verificationEvidence = [{
    taskId: "epic-completion-t1",
    receiptId: "legacy-graph-evidence-migration-epic-completion-t1",
    command: "node --test tests/completion.test.mjs",
    status: "pass",
    outputSummary: "migrated legacy evidence",
  }];
  graph.tasks.find((item) => item.id === "epic-completion-t1").verificationEvidence = task.verificationEvidence;
  graph.evidence = graph.evidence.filter((item) => item.taskId !== "epic-completion-t1").concat(task.verificationEvidence);

  const blocked = validateEpicCompletion(graph, { disallowLegacyEvidence: true });
  const grandfathered = validateEpicCompletion(graph, { disallowLegacyEvidence: true, allowLegacyEvidence: true });

  assert.equal(blocked.pass, false);
  assert.ok(blocked.issues.some((issue) => issue.code === "legacy-evidence" && issue.itemId === "epic-completion-t1"));
  assert.equal(grandfathered.pass, true);
});

test("validate-epic-completion CLI reports failed and passed completion", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-epic-completion-"));
  const passingFile = join(root, "passing.graph.json");
  const failingFile = join(root, "failing.graph.json");
  await writeFile(passingFile, `${JSON.stringify(completedGraph(), null, 2)}\n`, "utf8");

  const failing = completedGraph();
  failing.items.find((item) => item.itemId === "epic-completion-t1").status = "open";
  await writeFile(failingFile, `${JSON.stringify(failing, null, 2)}\n`, "utf8");

  const passStdout = execFileSync(process.execPath, ["scripts/validate-epic-completion.mjs", "--file", passingFile], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
  });
  assert.match(passStdout, /SUPERVIBE_EPIC_COMPLETION/);
  assert.match(passStdout, /PASS: true/);

  assert.throws(() => execFileSync(process.execPath, ["scripts/validate-epic-completion.mjs", "--file", failingFile], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
    stdio: "pipe",
  }), /epic completion artifact\(s\) failed/);
});

test("validate-epic-completion CLI requires runtime-trusted receipt evidence in trusted mode", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-trusted-epic-completion-"));
  const evidenceFile = join(root, "trusted-output.txt");
  const planFile = join(root, ".supervibe", "artifacts", "plans", "completion.md");
  const invocationId = "test-worker-trusted-completion";
  await mkdir(dirname(planFile), { recursive: true });
  await writeFile(planFile, PLAN, "utf8");
  await writeFile(evidenceFile, "trusted verification\n", "utf8");
  await writeTestAgentInvocation(root, {
    agentId: "stack-developer",
    invocationId,
    taskSummary: "trusted completion verification",
  });
  const { receipt } = await issueWorkflowInvocationReceipt({
    rootDir: root,
    command: "/supervibe-loop",
    subjectType: "worker",
    subjectId: "stack-developer",
    agentId: "stack-developer",
    stage: "validate-completion",
    invocationReason: "trusted completion verification",
    inputEvidence: [".supervibe/artifacts/plans/completion.md"],
    outputArtifacts: ["trusted-output.txt"],
    startedAt: "2026-05-10T00:00:00.000Z",
    completedAt: "2026-05-10T00:01:00.000Z",
    handoffId: "trusted-completion",
    hostInvocation: {
      source: "codex-spawn-agent",
      invocationId,
      agentId: "stack-developer",
    },
  });

  const trusted = graphWithReceiptId(receipt.receiptId);
  const trustedFile = join(root, "trusted.graph.json");
  await writeFile(trustedFile, `${JSON.stringify(trusted, null, 2)}\n`, "utf8");

  const passStdout = execFileSync(process.execPath, [
    join(ROOT, "scripts/validate-epic-completion.mjs"),
    "--file",
    trustedFile,
    "--require-trusted-evidence",
    "--trusted-receipts",
    receipt.receiptId,
  ], {
    cwd: root,
    encoding: "utf8",
  });
  assert.match(passStdout, /REQUIRE_TRUSTED_EVIDENCE: true/);
  assert.match(passStdout, /PASS: true/);

  const untrusted = graphWithReceiptId("receipt-not-runtime-issued");
  const untrustedFile = join(root, "untrusted.graph.json");
  await writeFile(untrustedFile, `${JSON.stringify(untrusted, null, 2)}\n`, "utf8");
  assert.throws(() => execFileSync(process.execPath, [
    join(ROOT, "scripts/validate-epic-completion.mjs"),
    "--file",
    untrustedFile,
    "--require-trusted-evidence",
    "--trusted-receipts",
    "receipt-not-runtime-issued",
  ], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  }), /epic completion artifact\(s\) failed/);
});

test("validate-epic-completion CLI accepts graph-bound release receipt in trusted mode", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-graph-trusted-epic-completion-"));
  const evidenceFile = join(root, "final-audit.md");
  await writeFile(evidenceFile, "final audit evidence\n", "utf8");
  const graph = completedGraph();
  graph.evidence = [];
  graph.items = graph.items.map((item) => ({
    ...item,
    verificationEvidence: item.type === "epic" ? item.verificationEvidence : [],
  }));
  graph.tasks = graph.tasks.map((task) => ({ ...task, verificationEvidence: [] }));
  const graphFile = join(root, "graph.json");
  await writeFile(graphFile, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
  const invocationId = "test-supervibe-orchestrator-graph-completion";
  await writeTestAgentInvocation(root, {
    agentId: "supervibe-orchestrator",
    invocationId,
    taskSummary: "trusted graph-level completion verification",
  });
  const { receipt } = await issueWorkflowInvocationReceipt({
    rootDir: root,
    command: "/supervibe-loop",
    subjectType: "agent",
    subjectId: "supervibe-orchestrator",
    agentId: "supervibe-orchestrator",
    stage: "release-completion",
    invocationReason: "trusted graph-level completion verification",
    outputArtifacts: ["graph.json"],
    startedAt: "2026-05-10T00:00:00.000Z",
    completedAt: "2026-05-10T00:01:00.000Z",
    handoffId: "epic-completion",
    graphId: "epic-completion",
    hostInvocation: {
      source: "codex-spawn-agent",
      invocationId,
      agentId: "supervibe-orchestrator",
    },
  });

  const passStdout = execFileSync(process.execPath, [
    join(ROOT, "scripts/validate-epic-completion.mjs"),
    "--file",
    graphFile,
    "--require-trusted-evidence",
    "--disallow-legacy-evidence",
    "--trusted-receipts",
    receipt.receiptId,
  ], {
    cwd: root,
    encoding: "utf8",
  });
  assert.match(passStdout, /REQUIRE_TRUSTED_EVIDENCE: true/);
  assert.match(passStdout, /PASS: true/);
});

test("validateEpicCompletionFiles allows active pre-close epic only with graph-level trusted receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-active-preclose-epic-completion-"));
  const graph = completedGraph();
  const epic = graph.items.find((item) => item.itemId === "epic-completion");
  epic.status = "active";
  delete epic.closedAt;
  delete epic.closeReason;
  const graphFile = join(root, "graph.json");
  await writeFile(graphFile, `${JSON.stringify(graph, null, 2)}\n`, "utf8");

  const blocked = await validateEpicCompletionFiles({
    rootDir: root,
    files: [graphFile],
    requireEpicClosed: true,
  });
  const preClose = await validateEpicCompletionFiles({
    rootDir: root,
    files: [graphFile],
    requireEpicClosed: true,
    trustedGraphReceiptIdsByGraphId: { "epic-completion": ["trusted-graph-receipt"] },
    activePreCloseGraphIds: ["epic-completion"],
  });

  assert.equal(blocked.pass, false);
  assert.ok(blocked.results[0].report.issues.some((issue) => issue.code === "epic-not-closed"));
  assert.equal(preClose.pass, true);
  assert.ok(preClose.results[0].report.warnings.some((warning) => warning.code === "active-preclose-epic"));
});

test("validate-epic-completion --all reports no graph coverage explicitly", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-no-completion-graphs-"));
  const stdout = execFileSync(process.execPath, [
    join(ROOT, "scripts/validate-epic-completion.mjs"),
    "--all",
  ], {
    cwd: root,
    encoding: "utf8",
  });

  assert.match(stdout, /SUPERVIBE_EPIC_COMPLETION_COVERAGE/);
  assert.match(stdout, /NO_COVERAGE: true/);
  assert.match(stdout, /PASS: neutral/);
});

test("validate-epic-completion --strict-coverage fails when no graph coverage exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-no-strict-completion-graphs-"));

  let error;
  try {
    execFileSync(process.execPath, [
      join(ROOT, "scripts/validate-epic-completion.mjs"),
      "--all",
      "--strict-coverage",
    ], {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
    });
  } catch (err) {
    error = err;
  }
  assert.ok(error);
  assert.match(error.stdout, /NO_COVERAGE: true/);
  assert.match(error.stdout, /PASS: false/);
});

test("supervibe-loop exposes completion validation for current commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-loop-completion-"));
  const graphFile = join(root, "graph.json");
  await writeFile(graphFile, `${JSON.stringify(completedGraph(), null, 2)}\n`, "utf8");

  const stdout = execFileSync(process.execPath, [
    "scripts/supervibe-loop.mjs",
    "--validate-completion",
    "--file",
    graphFile,
    "--non-production",
  ], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
  });

  assert.match(stdout, /SUPERVIBE_EPIC_COMPLETION/);
  assert.match(stdout, /PASS: true/);
  assert.match(stdout, /GRAPH:/);
});

test("supervibe-loop closes epic when final full-check evidence is supplied on close", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-loop-close-release-evidence-"));
  const graph = completedGraph();
  const epic = graph.items.find((item) => item.itemId === "epic-completion");
  epic.status = "active";
  delete epic.closedAt;
  delete epic.closeReason;
  const graphFile = join(root, "graph.json");
  await attachTrustedFinalReviewSweep({ root, graph, graphFile });
  await writeFile(graphFile, `${JSON.stringify(graph, null, 2)}\n`, "utf8");

  const stdout = execFileSync(process.execPath, [
    join(ROOT, "scripts/supervibe-loop.mjs"),
    "--close",
    "epic-completion",
    "--file",
    graphFile,
    "--verification-command",
    "npm run check:release",
    "--verification-status",
    "pass",
    "--evidence",
    "release full check passed",
  ], {
    cwd: root,
    encoding: "utf8",
  });

  assert.match(stdout, /ACTION: close/);
  const closedGraph = JSON.parse(await readFile(graphFile, "utf8"));
  const closedEpic = closedGraph.items.find((item) => item.itemId === "epic-completion");
  assert.equal(closedEpic.status, "closed");
  assert.ok((closedEpic.verificationEvidence || []).some((entry) => entry.command === "npm run check:release"));
});

function addCoveredPlanStepSubtask(graph, parent) {
  const subtask = {
    ...parent,
    itemId: `${parent.itemId}-s1`,
    id: `${parent.itemId}-s1`,
    parentId: parent.itemId,
    type: "subtask",
    title: "Covered plan-step subtask",
    blocks: [],
    verificationEvidence: [],
    discoveredFrom: {
      type: "plan-step",
      parentItemId: parent.itemId,
    },
  };
  graph.items.push(subtask);
  graph.tasks.push({
    id: subtask.itemId,
    itemId: subtask.itemId,
    parentId: parent.itemId,
    type: "subtask",
    title: subtask.title,
    status: subtask.status,
    verificationEvidence: [],
  });
  graph.dependencyEdges.push({
    from: parent.itemId,
    to: subtask.itemId,
    type: "parent-child",
  });
  const totals = graph.metadata?.taskBudgetPolicy?.report?.totals;
  if (totals) {
    totals.childItems += 1;
    totals.implementationItems += 1;
  }
  return subtask;
}

async function attachTrustedFinalReviewSweep({ root, graph }) {
  const reviewArtifact = join(root, ".supervibe", "artifacts", "reviews", "final-review.json");
  const invocationId = "test-quality-gate-final-review";
  await writeTestAgentInvocation(root, {
    agentId: "quality-gate-reviewer",
    invocationId,
    taskSummary: "trusted final reviewer sweep for release close",
  });
  await mkdir(dirname(reviewArtifact), { recursive: true });
  await writeFile(reviewArtifact, `${JSON.stringify({ status: "pass", reviewer: "quality-gate-reviewer" }, null, 2)}\n`, "utf8");
  const receiptResult = await issueWorkflowInvocationReceipt({
    rootDir: root,
    command: "/supervibe-loop",
    subjectType: "reviewer",
    subjectId: "quality-gate-reviewer",
    agentId: "quality-gate-reviewer",
    stage: "final-review-sweep",
    invocationReason: "trusted final reviewer sweep for release close",
    outputArtifacts: [reviewArtifact],
    startedAt: "2026-05-10T00:00:00.000Z",
    completedAt: "2026-05-10T00:01:00.000Z",
    handoffId: "final-review-sweep",
    graphId: graph.epicId,
    hostInvocation: {
      source: "codex-spawn-agent",
      invocationId,
      agentId: "quality-gate-reviewer",
    },
  });
  const receiptId = receiptResult.receipt.receiptId;
  graph.reviewPolicy = {
    mode: "final-sweep",
    reviewersRequiredAt: "graph-release-gate",
    midGraphBlocking: false,
  };
  graph.finalReviewerSweep = createFinalReviewerSweep(graph, {
    reviewerAgentId: "quality-gate-reviewer",
    receiptIds: [receiptId],
    taskReviews: graph.items
      .filter((item) => item.type !== "epic")
      .map((item) => ({
        taskId: item.itemId || item.id,
        status: "pass",
        score: 10,
        productionReady: true,
        reviewerAgentId: "quality-gate-reviewer",
        receiptIds: [receiptId],
      })),
  });
  return receiptId;
}

async function writeTestAgentInvocation(root, { agentId, invocationId, taskSummary }) {
  const outputJson = `.supervibe/artifacts/_agent-outputs/${invocationId}/agent-output.json`;
  await mkdir(join(root, ".supervibe", "memory"), { recursive: true });
  await mkdir(dirname(join(root, ...outputJson.split("/"))), { recursive: true });
  await writeFile(join(root, ...outputJson.split("/")), `${JSON.stringify({
    schemaVersion: 1,
    invocationId,
    agentId,
    taskSummary,
  }, null, 2)}\n`, "utf8");
  await appendFile(join(root, ".supervibe", "memory", "agent-invocations.jsonl"), `${JSON.stringify({
    schemaVersion: 1,
    ts: "2026-05-10T00:00:00.000Z",
    invocation_id: invocationId,
    agent_id: agentId,
    task_summary: taskSummary,
    confidence_score: 10,
    structured_output: { json: outputJson },
  })}\n`, "utf8");
}

function completedGraph() {
  const graph = atomizePlanToWorkItems(PLAN, {
    planPath: ".supervibe/artifacts/plans/completion.md",
    epicId: "epic-completion",
    planReviewPassed: true,
  });
  const now = "2026-05-10T00:00:00.000Z";
  const evidence = [];

  graph.items = graph.items.map((item) => {
    if (item.type === "followup") return item;
    const next = {
      ...item,
      status: "complete",
      closedAt: now,
      closeReason: "validated by completion gate",
    };
    if (item.type !== "epic") {
      const itemEvidence = {
        taskId: item.itemId,
        command: item.verificationCommands?.[0] || "manual-review",
        status: "pass",
        output: "verified",
      };
      next.verificationEvidence = [itemEvidence];
      evidence.push(itemEvidence);
    }
    return next;
  });
  graph.tasks = graph.tasks.map((task) => ({
    ...task,
    status: "complete",
    verificationEvidence: evidence.filter((item) => item.taskId === task.id),
  }));
  graph.evidence = evidence;
  return graph;
}

function graphWithReceiptId(receiptId) {
  const graph = completedGraph();
  const updateEvidence = (evidence) => ({ ...evidence, receiptId });
  graph.evidence = graph.evidence.map(updateEvidence);
  graph.items = graph.items.map((item) => ({
    ...item,
    verificationEvidence: (item.verificationEvidence || []).map(updateEvidence),
  }));
  graph.tasks = graph.tasks.map((task) => ({
    ...task,
    verificationEvidence: (task.verificationEvidence || []).map(updateEvidence),
  }));
  return graph;
}
