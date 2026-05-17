import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  atomizePlanToWorkItems,
  writeWorkItemGraph,
} from "../scripts/lib/supervibe-plan-to-work-items.mjs";
import { classifyAdaptDirtyEntries } from "../scripts/lib/supervibe-adapt.mjs";
import {
  scanSupervibeArtifactGc,
  validateSupervibeGcStrict,
} from "../scripts/lib/supervibe-artifact-gc.mjs";
import {
  buildStrictReleaseGateReport,
} from "../scripts/lib/supervibe-strict-release-gate.mjs";
import { issueWorkflowInvocationReceipt } from "../scripts/lib/supervibe-workflow-receipt-runtime.mjs";

const ROOT = process.cwd();
const ADAPT_SCRIPT = join(ROOT, "scripts", "supervibe-adapt.mjs");
const GC_STRICT_SCRIPT = join(ROOT, "scripts", "validate-supervibe-gc-strict.mjs");
const TOKEN_SCRIPT = join(ROOT, "scripts", "measure-token-footprint.mjs");
const STRICT_GATE_SCRIPT = join(ROOT, "scripts", "validate-strict-release-gate.mjs");
const TASK_GRAPH_MATURITY_SCRIPT = join(ROOT, "scripts", "supervibe-task-graph-maturity.mjs");
const DESIGN_MATURITY_SCRIPT = join(ROOT, "scripts", "supervibe-design-maturity.mjs");
const CURRENT_VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;

function createAdaptProjectWithPendingAppAndDeploy() {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-strict-adapt-"));
  mkdirSync(join(projectRoot, ".codex", "agents"), { recursive: true });
  mkdirSync(join(projectRoot, ".supervibe", "memory", "genesis"), { recursive: true });
  writeFileSync(join(projectRoot, "AGENTS.md"), "# Project instructions\n");
  writeFileSync(join(projectRoot, ".codex", "agents", "repo-researcher.md"), "# stale repo researcher\n\nlocal-old-copy\n");
  writeFileSync(join(projectRoot, ".supervibe", "memory", ".supervibe-version"), "2.0.27\n");
  writeFileSync(join(projectRoot, ".supervibe", "memory", "genesis", "state.json"), JSON.stringify({
    schemaVersion: 1,
    frontendTarget: { id: "next-app", bundler: "turbopack" },
    appChoice: { id: "next-app" },
    generateAppsStep: {
      appGenerated: true,
      appVerified: false,
      appChoice: { id: "next-app" },
    },
    verification: {
      appGenerated: true,
      appVerified: false,
      deployVerified: false,
    },
    deployAddOnPolicy: {
      requested: true,
      status: "requires-adapt-deploy-scope",
      targets: ["dokploy"],
    },
  }, null, 2) + "\n");
  return projectRoot;
}

function createArchivedWorkflowProject(prefix = "supervibe-strict-release-archived-") {
  const projectRoot = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(projectRoot, ".supervibe", "memory"), { recursive: true });
  writeFileSync(join(projectRoot, ".supervibe", "memory", "active-workflow.json"), `${JSON.stringify({
    schemaVersion: 1,
    command: "/supervibe-loop",
    stage: "archived",
    question: null,
    choices: [],
    acceptedAnswer: null,
    artifacts: [],
    receipts: [],
    nextCommand: "/supervibe-loop",
    nextAction: "archived workflow retained for audit only",
  }, null, 2)}\n`);
  return projectRoot;
}

function createIsolatedCodexHome(prefix = "supervibe-strict-codex-home-") {
  const codexHome = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(join(codexHome, "config.toml"), [
    'approval_policy = "on-request"',
    'sandbox_mode = "workspace-write"',
    'default_permissions = ":workspace"',
    'web_search = "live"',
    "",
    "[features]",
    "apps = true",
    "multi_agent = true",
    "memories = true",
    "shell_snapshot = true",
    "codex_hooks = true",
    "goals = true",
    "",
    "[agents]",
    "max_threads = 8",
    "max_depth = 1",
    "job_max_runtime_seconds = 1800",
    "",
    "[apps._default]",
    "enabled = true",
    "",
    "[[tool_suggest.discoverables]]",
    'type = "plugin"',
    'id = "supervibe@supervibe-marketplace"',
    "",
  ].join("\n"));
  return codexHome;
}

function writeTestAgentInvocation(root, { agentId, invocationId, taskSummary }) {
  const outputJson = `.supervibe/artifacts/_agent-outputs/${invocationId}/agent-output.json`;
  const outputPath = join(root, ...outputJson.split("/"));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify({
    schemaVersion: 1,
    invocationId,
    agentId,
    taskSummary,
  }, null, 2) + "\n", "utf8");
  mkdirSync(join(root, ".supervibe", "memory"), { recursive: true });
  appendFileSync(join(root, ".supervibe", "memory", "agent-invocations.jsonl"), JSON.stringify({
    schemaVersion: 1,
    ts: "2026-05-10T00:00:00.000Z",
    invocation_id: invocationId,
    agent_id: agentId,
    task_summary: taskSummary,
    confidence_score: 10,
    structured_output: { json: outputJson },
  }) + "\n", "utf8");
}

function writeJsonArtifact(root, relativePath, value) {
  const path = join(root, ...String(relativePath).split("/"));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function writeCompletedRuntimeGraph(root, { receiptId, outputSummary }) {
  const graph = atomizePlanToWorkItems([
    "# Runtime Implementation Plan",
    "",
    "## Acceptance Criteria",
    "- Completed runtime requirement.",
    "",
    "## Task 1: Completed runtime requirement",
    "**Files:**",
    "- Modify: scripts/runtime.mjs",
    "**Acceptance Criteria:**",
    "- Completed runtime requirement.",
    "```bash",
    "node --test tests/runtime.test.mjs",
    "```",
  ].join("\n"), {
    planPath: ".supervibe/artifacts/plans/completed-runtime.md",
    epicId: "completed-runtime",
    writeSourcePlan: true,
    planReviewPassed: true,
  });
  for (const item of graph.items || []) {
    item.status = "complete";
    if (item.type !== "epic") {
      item.evidence = [{
        status: "pass",
        command: "node --test tests/runtime.test.mjs",
        outputSummary,
        receiptId,
      }];
      item.verificationEvidence = item.evidence;
    }
  }
  for (const task of graph.tasks || []) {
    task.status = "complete";
    task.evidence = [{
      status: "pass",
      command: "node --test tests/runtime.test.mjs",
      outputSummary,
      receiptId,
    }];
    task.verificationEvidence = task.evidence;
  }
  await writeWorkItemGraph(graph, { rootDir: root, writeSourcePlan: true });
}

function runAdapt(projectRoot, args = []) {
  return execFileSync(process.execPath, [ADAPT_SCRIPT, ...args], {
    cwd: projectRoot,
    env: {
      ...process.env,
      SUPERVIBE_HOST: "codex",
      SUPERVIBE_PLUGIN_ROOT: ROOT,
      SUPERVIBE_SKIP_DOCKER_PROBE: "1",
      CODEX_HOME: createIsolatedCodexHome(),
    },
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

test("adapt dry-run writes drift state and apply exposes app/deploy verification hooks", () => {
  const projectRoot = createAdaptProjectWithPendingAppAndDeploy();
  try {
    const dryRun = runAdapt(projectRoot, ["--dry-run", "--summary-json", "--changed-only", "--no-color"]);
    const summary = JSON.parse(dryRun);

    assert.equal(summary.driftState.path, ".supervibe/memory/adapt/state.json");
    assert.equal(summary.driftState.lifecycle, "drift_reported");
    assert.equal(existsSync(join(projectRoot, ".supervibe", "memory", "adapt", "state.json")), true);

    const out = runAdapt(projectRoot, [
      "--apply",
      "--include",
      ".codex/agents/repo-researcher.md",
      "--no-refresh-memory-index",
      "--no-color",
    ]);

    assert.match(out, /SUPERVIBE_ADAPT_APPLY/);
    assert.match(out, /APP_VERIFICATION_STATUS: not-run-app-verification/);
    assert.match(out, /APP_VERIFICATION_COMMAND: node <resolved-supervibe-plugin-root>\/scripts\/supervibe-genesis\.mjs --verify-apps/);
    assert.match(out, /NEXT_APP_VERIFICATION: node <resolved-supervibe-plugin-root>\/scripts\/supervibe-genesis\.mjs --verify-apps/);
    assert.match(out, /DEPLOY_VERIFICATION_STATUS: not-run-deploy-adapt/);
    assert.match(out, /DEPLOY_VERIFICATION_COMMAND: node <resolved-supervibe-plugin-root>\/scripts\/supervibe-adapt\.mjs --scope deploy --target dokploy --dry-run/);
    assert.match(out, /NEXT_DEPLOY_VERIFICATION: node <resolved-supervibe-plugin-root>\/scripts\/supervibe-adapt\.mjs --scope deploy --target dokploy --dry-run/);
    assert.match(out, /DIRTY_STATE: no-git-snapshot/);

    const state = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "adapt", "state.json"), "utf8"));
    assert.equal(state.verification.artifactVerified, true);
    assert.equal(state.verification.appVerified, false);
    assert.equal(state.verification.appVerification.status, "not-run-app-verification");
    assert.equal(state.verification.appVerification.nextCommand, "node <resolved-supervibe-plugin-root>/scripts/supervibe-genesis.mjs --verify-apps");
    assert.equal(state.verification.deployVerified, false);
    assert.equal(state.verification.deployVerification.status, "not-run-deploy-adapt");
    assert.equal(state.recovery.nextAppVerification, "node <resolved-supervibe-plugin-root>/scripts/supervibe-genesis.mjs --verify-apps");
    assert.equal(state.recovery.nextDeployVerification, "node <resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs --scope deploy --target dokploy --dry-run");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("adapt dirty classifier separates receipts, memory, stale garbage, approved artifacts, and unexpected mutations", () => {
  const result = classifyAdaptDirtyEntries([
    ".supervibe/artifacts/_workflow-invocations/supervibe-adapt/run/receipt.json",
    ".supervibe/memory/adapt/state.json",
    ".supervibe/memory/workflow-receipts-stale/old.json",
    ".codex/agents/repo-researcher.md",
    "src/unapproved.js",
  ], {
    expectedPaths: [".codex/agents/repo-researcher.md"],
  });

  assert.equal(result.counts.expectedReceipts, 1);
  assert.equal(result.counts.expectedMemory, 1);
  assert.equal(result.counts.staleGarbage, 1);
  assert.equal(result.counts.approvedArtifacts, 1);
  assert.equal(result.counts.unexpectedMutations, 1);
  assert.equal(result.safe, false);
});

test("adapt recovery-status prints verification next commands from state", () => {
  const projectRoot = createAdaptProjectWithPendingAppAndDeploy();
  try {
    runAdapt(projectRoot, [
      "--apply",
      "--include",
      ".codex/agents/repo-researcher.md",
      "--no-refresh-memory-index",
      "--no-color",
    ]);

    const out = runAdapt(projectRoot, ["--recovery-status", "--no-color"]);

    assert.match(out, /SUPERVIBE_ADAPT_RECOVERY_STATUS/);
    assert.match(out, /ADAPT_STATE: \.supervibe\/memory\/adapt\/state\.json/);
    assert.match(out, /APP_VERIFICATION_STATUS: not-run-app-verification/);
    assert.match(out, /DEPLOY_VERIFICATION_STATUS: not-run-deploy-adapt/);
    assert.match(out, /NEXT_APP_VERIFICATION: node <resolved-supervibe-plugin-root>\/scripts\/supervibe-genesis\.mjs --verify-apps/);
    assert.match(out, /NEXT_DEPLOY_VERIFICATION: node <resolved-supervibe-plugin-root>\/scripts\/supervibe-adapt\.mjs --scope deploy --target dokploy --dry-run/);
    assert.match(out, /NEXT_SAFE_COMMAND: node <resolved-supervibe-plugin-root>\/scripts\/supervibe-genesis\.mjs --verify-apps/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("strict supervibe GC validates nested runtime folders and protects receipt-linked outputs", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-strict-gc-"));
  const now = "2026-05-12T00:00:00.000Z";
  const old = new Date("2026-04-01T00:00:00.000Z");
  try {
    const outputDir = join(projectRoot, ".supervibe", "artifacts", "_agent-outputs", "gc-fixture");
    const workItemDir = join(projectRoot, ".supervibe", "memory", "work-items", "epic-gc");
    const loopDir = join(projectRoot, ".supervibe", "memory", "loops", "loop-gc");
    const serverDir = join(projectRoot, ".supervibe", "servers");
    mkdirSync(outputDir, { recursive: true });
    mkdirSync(workItemDir, { recursive: true });
    mkdirSync(loopDir, { recursive: true });
    mkdirSync(serverDir, { recursive: true });

    const outputPath = join(outputDir, "agent-output.json");
    const logPath = join(serverDir, "supervibe-ui-3000.out.log");
    const backupPath = join(projectRoot, ".supervibe", "memory", "work-items", "epic-gc", "graph.json.bak");
    writeFileSync(outputPath, JSON.stringify({ status: "ok" }, null, 2) + "\n");
    writeFileSync(join(outputDir, "summary.md"), "gc fixture\n");
    writeFileSync(join(workItemDir, "graph.json"), JSON.stringify({ tasks: [] }, null, 2) + "\n");
    writeFileSync(backupPath, "{}\n");
    writeFileSync(join(loopDir, "state.json"), JSON.stringify({ status: "running" }, null, 2) + "\n");
    writeFileSync(logPath, "old preview log\n");
    utimesSync(logPath, old, old);
    utimesSync(backupPath, old, old);

    await issueWorkflowInvocationReceipt({
      rootDir: projectRoot,
      command: "/supervibe-loop",
      subjectType: "command",
      subjectId: "gc-fixture",
      stage: "gc-strict",
      invocationReason: "strict gc fixture",
      outputArtifacts: [".supervibe/artifacts/_agent-outputs/gc-fixture/agent-output.json"],
      startedAt: now,
      completedAt: now,
      handoffId: "gc-fixture",
    });

    const scan = await scanSupervibeArtifactGc({ rootDir: projectRoot, now, retentionDays: 14 });
    assert.equal(scan.candidates.some((item) => item.relPath === ".supervibe/artifacts/_agent-outputs/gc-fixture"), false);
    assert.equal(scan.candidates.some((item) => item.reason === "preview-log"), true);
    assert.equal(scan.candidates.some((item) => item.reason === "backup-file"), true);

    const strict = await validateSupervibeGcStrict({ rootDir: projectRoot, now, scan, retentionDays: 14 });
    assert.equal(strict.pass, true);
    assert.equal(strict.summary.unsafeProtectedCandidates, 0);
    assert.ok(strict.coverage.artifacts > 0);
    assert.ok(strict.coverage.memory > 0);
    assert.ok(strict.coverage.loops > 0);
    assert.ok(strict.coverage.workItems > 0);
    assert.ok(strict.coverage.receipts > 0);
    assert.ok(strict.coverage.backups > 0);
    assert.ok(strict.coverage.telemetry > 0);
    assert.ok(strict.classifications.protectedReceiptOutputs.some((item) => item.relPath === ".supervibe/artifacts/_agent-outputs/gc-fixture/agent-output.json"));
    assert.ok(strict.classifications.staleTelemetry.some((item) => item.relPath === ".supervibe/servers/supervibe-ui-3000.out.log"));

    const out = execFileSync(process.execPath, [GC_STRICT_SCRIPT, "--root", projectRoot], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    assert.match(out, /SUPERVIBE_GC_STRICT/);
    assert.match(out, /PASS: true/);
    assert.match(out, /PROTECTED_RECEIPT_OUTPUTS: 1/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("strict token gate reports planned repairs, per-agent budget, and workflow report", () => {
  const outDir = mkdtempSync(join(tmpdir(), "supervibe-token-report-"));
  const reportPath = join(outDir, "token-report.json");
  try {
    const out = execFileSync(process.execPath, [
      TOKEN_SCRIPT,
      "--strict",
      "--workflow-run",
      "strict-release-gate-test",
      "--out",
      reportPath,
    ], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    assert.match(out, /SUPERVIBE_TOKEN_FOOTPRINT/);
    assert.match(out, /STRICT: true/);
    assert.match(out, /PASS: true/);
    assert.match(out, /PER_AGENT_CONTEXT_BUDGET: 8000/);
    assert.match(out, /PROMPT_SLICING_POLICY: task-contract > current-work-item/);
    assert.match(out, /BLOCKING_VIOLATIONS: 0/);
    assert.match(out, /TOKEN_REPAIR_PLAN:/);

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    assert.equal(report.workflowRunId, "strict-release-gate-test");
    assert.equal(report.perAgentContextBudget, 8000);
    assert.equal(report.pass, true);
    assert.equal(report.blockingViolations.length, 0);
    assert.ok(report.repairs.length > 0);
    assert.ok(report.promptSlicingPolicy.includes("retrieval-evidence"));
    assert.match(pkg.scripts["check:release-strict"], /measure:tokens:strict/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("strict release gate lists active proof gates, repair commands, and package scripts", () => {
  const result = spawnSync(process.execPath, [STRICT_GATE_SCRIPT, "--require-active-proof"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  assert.ok([0, 1].includes(result.status), result.stderr || result.stdout);
  assert.match(result.stdout, /SUPERVIBE_STRICT_RELEASE_GATE/);
  assert.match(result.stdout, /MATURITY_SCOPE: active-workflow-readiness/);
  assert.match(result.stdout, /ACTIVE_PROOF_REQUIRED: true/);
  assert.match(result.stdout, /GLOBAL_10_BLOCKED: (true|false)/);
  for (const gate of [
    "active-workflows",
    "strict-plan",
    "strict-plan-review",
    "trusted-epic-completion",
    "task-graph-runtime-maturity",
    "design-workflow-report",
    "token-strict",
    "supervibe-gc-strict",
    "legacy-evidence-graphs",
  ]) {
    assert.match(result.stdout, new RegExp(`- ${gate}:`));
  }
  assert.match(result.stdout, /REPAIR: npm run (validate:active-workflows -- --strict|supervibe:task-graph-runtime-maturity)/);
  assert.match(result.stdout, /REPAIR: npm run validate:epic-completion:trusted/);

  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  assert.equal(pkg.scripts["validate:strict-release-gate"], "node scripts/validate-strict-release-gate.mjs");
  assert.match(pkg.scripts["check:strict"], /validate:strict-release-gate/);
  assert.match(pkg.scripts["check:release-strict"], /validate:strict-release-gate/);
});

test("strict release gate accepts runtime work graph proof when legacy active workflow state is absent", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-strict-runtime-graph-proof-"));
  try {
    const runtimeGraphPath = ".supervibe/memory/work-items/current/graph.json";
    const report = await buildStrictReleaseGateReport(projectRoot, {
      requireActiveProof: true,
      taskGraphMaturityResult: {
        pass: true,
        score: 10,
        status: "10-of-10-ready",
        maturityScope: "active-workflow-readiness",
        dimensions: [
          { id: "current-active-graph", pass: true, evidence: [runtimeGraphPath] },
          { id: "active-graph-receipts", pass: true, evidence: [runtimeGraphPath] },
          { id: "active-trusted-completion", pass: true, evidence: [runtimeGraphPath] },
        ],
      },
    });

    const activeGate = report.gates.find((gate) => gate.id === "active-workflows");
    const taskGraphGate = report.gates.find((gate) => gate.id === "task-graph-runtime-maturity");
    assert.equal(activeGate.pass, true);
    assert.match(activeGate.summary, /runtimeGraphProof=accepted/);
    assert.match(activeGate.summary, /status=passed-via-runtime-work-graph/);
    assert.deepEqual(activeGate.blockers, []);
    assert.ok(activeGate.evidence.includes(runtimeGraphPath));
    assert.equal(taskGraphGate.pass, true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
test("strict release gate blocks active workflow before release-ready stage", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-strict-release-stage-"));
  try {
    mkdirSync(join(projectRoot, ".supervibe", "memory"), { recursive: true });
    writeFileSync(join(projectRoot, ".supervibe", "memory", "active-workflow.json"), `${JSON.stringify({
      schemaVersion: 1,
      command: "/supervibe-loop",
      stage: "verification",
      question: null,
      choices: [],
      acceptedAnswer: { choiceId: "continue" },
      artifacts: [],
      receipts: [],
      nextCommand: "/supervibe-loop",
      nextAction: "run validators and global checks",
    }, null, 2)}\n`);

    const report = await buildStrictReleaseGateReport(projectRoot, { requireActiveProof: true });
    const activeGate = report.gates.find((gate) => gate.id === "active-workflows");
    assert.equal(activeGate.pass, false);
    assert.ok(activeGate.blockers.some((blocker) => /stage must be release-ready/.test(blocker)));
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("strict release gate uses global mode for archived workflow state", async () => {
  const projectRoot = createArchivedWorkflowProject();
  try {
    const report = await buildStrictReleaseGateReport(projectRoot);
    const activeGate = report.gates.find((gate) => gate.id === "active-workflows");
    const trustedGate = report.gates.find((gate) => gate.id === "trusted-epic-completion");

    assert.equal(report.activeProofRequired, false);
    assert.equal(report.maturityScope, "global-capability");
    assert.equal(activeGate.pass, true);
    assert.equal(activeGate.scope, "global-capability");
    assert.equal(trustedGate.pass, true);
    assert.equal(trustedGate.required, false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("strict release gate CLI auto-uses global mode for archived workflow unless active proof is required", () => {
  const projectRoot = createArchivedWorkflowProject("supervibe-strict-release-cli-");
  try {
    const defaultResult = spawnSync(process.execPath, [STRICT_GATE_SCRIPT, "--root", projectRoot, "--json"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    assert.ok([0, 1].includes(defaultResult.status), defaultResult.stderr || defaultResult.stdout);
    const defaultReport = JSON.parse(defaultResult.stdout);
    const defaultActiveGate = defaultReport.gates.find((gate) => gate.id === "active-workflows");
    assert.equal(defaultReport.activeProofRequired, false);
    assert.equal(defaultReport.maturityScope, "global-capability");
    assert.equal(defaultActiveGate.pass, true);
    assert.equal(defaultActiveGate.scope, "global-capability");

    const explicitResult = spawnSync(process.execPath, [STRICT_GATE_SCRIPT, "--root", projectRoot, "--require-active-proof", "--json"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    assert.ok([0, 1].includes(explicitResult.status), explicitResult.stderr || explicitResult.stdout);
    const explicitReport = JSON.parse(explicitResult.stdout);
    const explicitActiveGate = explicitReport.gates.find((gate) => gate.id === "active-workflows");
    assert.equal(explicitReport.activeProofRequired, true);
    assert.equal(explicitReport.maturityScope, "active-workflow-readiness");
    assert.equal(explicitActiveGate.pass, false);
    assert.equal(explicitActiveGate.scope, "active-workflow-readiness");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("strict release gate ignores archived work-item graphs for active proof blockers", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-strict-release-archive-ignore-"));
  try {
    mkdirSync(join(projectRoot, ".supervibe", "memory", "work-items", ".archive", "old-active-looking"), { recursive: true });
    writeFileSync(join(projectRoot, ".supervibe", "memory", "work-items", ".archive", "old-active-looking", "graph.json"), JSON.stringify({
      epicId: "old-active-looking",
      items: [
        { itemId: "old-active-looking", type: "epic", status: "open" },
        { itemId: "old-active-looking-t1", type: "task", status: "complete" },
      ],
    }, null, 2) + "\n");

    const report = await buildStrictReleaseGateReport(projectRoot, { requireActiveProof: true });
    const trustedGate = report.gates.find((gate) => gate.id === "trusted-epic-completion");

    assert.ok(trustedGate, "trusted epic completion gate should be present");
    assert.equal(trustedGate.evidence.some((item) => item.includes(".archive/old-active-looking")), false);
    assert.equal(trustedGate.blockers.some((item) => item.includes(".archive/old-active-looking")), false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("strict release gate considers newest terminal runtime graph for trusted completion proof", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-strict-terminal-graph-proof-"));
  try {
    const graphDir = join(projectRoot, ".supervibe", "memory", "work-items", "completed-runtime");
    mkdirSync(graphDir, { recursive: true });
    writeFileSync(join(graphDir, "source-plan.md"), "## Acceptance Criteria\n- Completed runtime requirement.\n", "utf8");
    const outputArtifact = ".supervibe/artifacts/completed-runtime/worker.json";
    const invocationId = "test-strict-release-completed-runtime-worker";
    writeJsonArtifact(projectRoot, outputArtifact, { status: "pass", source: "completed-runtime" });
    writeTestAgentInvocation(projectRoot, {
      agentId: "stack-developer",
      invocationId,
      taskSummary: "completed runtime proof",
    });
    const { receipt } = await issueWorkflowInvocationReceipt({
      rootDir: projectRoot,
      command: "/supervibe-loop",
      subjectType: "worker",
      subjectId: "stack-developer",
      agentId: "stack-developer",
      stage: "completed-runtime-t1",
      invocationReason: "completed runtime task evidence",
      outputArtifacts: [outputArtifact],
      startedAt: "2026-05-10T00:00:00.000Z",
      completedAt: "2026-05-10T00:01:00.000Z",
      handoffId: "completed-runtime",
      graphId: "completed-runtime",
      taskId: "completed-runtime-t1",
      hostInvocation: {
        source: "codex-spawn-agent",
        invocationId,
        agentId: "stack-developer",
      },
    });
    writeFileSync(join(graphDir, "graph.json"), JSON.stringify({
      graph_id: "completed-runtime",
      source: { snapshotPath: "source-plan.md" },
      items: [
        { itemId: "completed-runtime", type: "epic", status: "complete", title: "Completed Runtime" },
        {
          itemId: "completed-runtime-t1",
          type: "task",
          status: "complete",
          title: "Completed runtime requirement",
          evidence: [{
            status: "pass",
            command: "node --test tests/runtime.test.mjs",
            outputSummary: "completed runtime proof passed",
            receiptId: receipt.receiptId,
          }],
        },
      ],
    }, null, 2) + "\n");

    await writeCompletedRuntimeGraph(projectRoot, {
      receiptId: receipt.receiptId,
      outputSummary: "completed runtime proof passed",
    });

    const report = await buildStrictReleaseGateReport(projectRoot, { requireActiveProof: true });
    const trustedGate = report.gates.find((gate) => gate.id === "trusted-epic-completion");

    assert.ok(trustedGate, "trusted epic completion gate should be present");
    assert.match(trustedGate.summary, /graphs=1/);
    assert.ok(trustedGate.evidence.some((item) => item.includes("completed-runtime/graph.json")));
    assert.notEqual(trustedGate.summary, "no work-item graph files found");
    assert.equal(trustedGate.pass, true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("strict release gate rejects terminal graph evidence bound to another graph", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-strict-terminal-wrong-receipt-"));
  try {
    const graphDir = join(projectRoot, ".supervibe", "memory", "work-items", "completed-runtime");
    mkdirSync(graphDir, { recursive: true });
    const outputArtifact = ".supervibe/artifacts/completed-runtime/wrong-worker.json";
    const invocationId = "test-strict-release-wrong-graph-worker";
    writeJsonArtifact(projectRoot, outputArtifact, { status: "pass", source: "wrong-graph" });
    writeTestAgentInvocation(projectRoot, {
      agentId: "stack-developer",
      invocationId,
      taskSummary: "wrong graph proof",
    });
    const { receipt } = await issueWorkflowInvocationReceipt({
      rootDir: projectRoot,
      command: "/supervibe-loop",
      subjectType: "worker",
      subjectId: "stack-developer",
      agentId: "stack-developer",
      stage: "other-runtime-t1",
      invocationReason: "wrong graph receipt must not satisfy terminal graph completion",
      outputArtifacts: [outputArtifact],
      startedAt: "2026-05-10T00:00:00.000Z",
      completedAt: "2026-05-10T00:01:00.000Z",
      handoffId: "other-runtime",
      graphId: "other-runtime",
      taskId: "other-runtime-t1",
      hostInvocation: {
        source: "codex-spawn-agent",
        invocationId,
        agentId: "stack-developer",
      },
    });

    writeFileSync(join(graphDir, "source-plan.md"), "## Acceptance Criteria\n- Completed runtime requirement.\n", "utf8");
    writeFileSync(join(graphDir, "graph.json"), JSON.stringify({
      graph_id: "completed-runtime",
      source: { snapshotPath: "source-plan.md" },
      items: [
        { itemId: "completed-runtime", type: "epic", status: "complete", title: "Completed Runtime" },
        {
          itemId: "completed-runtime-t1",
          type: "task",
          status: "complete",
          title: "Completed runtime requirement",
          evidence: [{
            status: "pass",
            command: "node --test tests/runtime.test.mjs",
            outputSummary: "copied wrong graph receipt must not count",
            receiptId: receipt.receiptId,
          }],
        },
      ],
    }, null, 2) + "\n", "utf8");

    await writeCompletedRuntimeGraph(projectRoot, {
      receiptId: receipt.receiptId,
      outputSummary: "copied wrong graph receipt must not count",
    });

    const report = await buildStrictReleaseGateReport(projectRoot, { requireActiveProof: true });
    const trustedGate = report.gates.find((gate) => gate.id === "trusted-epic-completion");

    assert.ok(trustedGate, "trusted epic completion gate should be present");
    assert.equal(trustedGate.pass, false);
    assert.ok(trustedGate.blockers.some((blocker) => blocker.includes("untrusted-evidence")));
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("maturity CLIs state whether they prove global capability or active workflow readiness", () => {
  const taskGlobal = parseSpawnJson([TASK_GRAPH_MATURITY_SCRIPT, "--json"]);
  assert.equal(taskGlobal.maturityScope, "global-capability");
  assert.equal(taskGlobal.activeProofRequired, false);
  assert.equal(taskGlobal.globalCapabilityOnly, true);

  const taskActive = parseSpawnJson([TASK_GRAPH_MATURITY_SCRIPT, "--require-active-graph", "--json"]);
  assert.equal(taskActive.maturityScope, "active-workflow-readiness");
  assert.equal(taskActive.activeProofRequired, true);

  const designGlobal = parseSpawnJson([DESIGN_MATURITY_SCRIPT, "--json"]);
  assert.equal(designGlobal.maturityScope, "global-capability");
  assert.equal(designGlobal.activeProofRequired, false);
  assert.equal(designGlobal.globalCapabilityOnly, true);

  const designActive = parseSpawnJson([DESIGN_MATURITY_SCRIPT, "--active", "--json"]);
  assert.equal(designActive.maturityScope, "active-workflow-readiness");
  assert.equal(designActive.activeProofRequired, true);
});

test("strict release gate fixture tracks current package version", () => {
  assert.match(CURRENT_VERSION, /^\d+\.\d+\.\d+$/);
});

function parseSpawnJson(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  assert.ok([0, 1].includes(result.status), result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
