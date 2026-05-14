import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  discoverActiveWorkflows,
  validateActiveWorkflows,
} from "../scripts/validate-active-workflows.mjs";
import {
  issueWorkflowInvocationReceipt,
} from "../scripts/lib/supervibe-workflow-receipt-runtime.mjs";

const ROOT = process.cwd();

test("active workflow validator is a no-op when no active workflow state exists", () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-active-none-"));
  try {
    const result = validateActiveWorkflows(root, { pluginRoot: ROOT });

    assert.equal(result.pass, true);
    assert.equal(result.status, "not-started");
    assert.equal(result.activeWorkflows, 0);
    assert.equal(result.checked, 0);
    assert.ok(result.warnings.some((warning) => warning.code === "active-workflow-not-started"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("active workflow validator blocks missing scoped receipts from persisted active state", () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-active-blocked-"));
  try {
    writeFileSync(join(root, "AGENTS.md"), "# Test host\n", "utf8");
    const activePath = join(root, ".supervibe", "memory", "active-workflow.json");
    mkdirSync(dirname(activePath), { recursive: true });
    writeFileSync(activePath, JSON.stringify({
      command: "/supervibe-plan",
      host: "codex",
      handoffId: "active-plan-run",
    }, null, 2), "utf8");

    const workflows = discoverActiveWorkflows(root);
    const result = validateActiveWorkflows(root, { pluginRoot: ROOT });

    assert.equal(workflows.length, 1);
    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "active-command-agent-plan-blocked"));
    assert.ok(result.issues.some((issue) => /missingScoped=.*supervibe-orchestrator/.test(issue.message)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("active workflow validator trusts handoff-scoped receipts when workflow run id is only state metadata", async () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-active-scoped-handoff-"));
  try {
    writeFileSync(join(root, "AGENTS.md"), "# Test host\n", "utf8");
    const activePath = join(root, ".supervibe", "memory", "active-workflow.json");
    mkdirSync(dirname(activePath), { recursive: true });
    writeFileSync(activePath, JSON.stringify({
      command: "/supervibe-review",
      host: "codex",
      stage: "review",
      handoffId: "review-final-pass",
      workflowRunId: "review-run-metadata-only",
      question: {
        id: "review",
        prompt: "Proceed with review?",
        resumeCursor: "review-final-pass",
      },
      choices: [{ id: "start", label: "Start" }],
      acceptedAnswer: { choiceId: "start" },
      artifacts: [{ id: "graph", path: ".supervibe/memory/work-items/example/graph.json" }],
      receipts: [],
      nextCommand: "/supervibe-review",
      nextAction: "continue review gate",
    }, null, 2), "utf8");

    const agents = [
      "supervibe-orchestrator",
      "architect-reviewer",
      "code-reviewer",
      "qa-test-engineer",
      "release-governance-reviewer",
      "quality-gate-reviewer",
    ];
    const logPath = join(root, ".supervibe", "memory", "agent-invocations.jsonl");
    const logLines = [];
    const receiptInputs = [];
    for (const agentId of agents) {
      const invocationId = agentId + "-run-1";
      const output = ".supervibe/artifacts/_agent-outputs/" + invocationId + "/agent-output.json";
      const outputPath = join(root, ...output.split("/"));
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, JSON.stringify({ status: "pass", agentId }, null, 2) + "\n", "utf8");
      logLines.push(JSON.stringify({
        schemaVersion: 1,
        invocation_id: invocationId,
        host_invocation_source: "codex-spawn-agent",
        ts: "2026-05-14T00:00:00.000Z",
        agent_id: agentId,
        task_summary: "review gate pass",
        confidence_score: 9,
      }));
      receiptInputs.push({ agentId, invocationId, output });
    }
    writeFileSync(logPath, logLines.join("\n") + "\n", "utf8");
    for (const { agentId, invocationId, output } of receiptInputs) {
      await issueWorkflowInvocationReceipt({
        rootDir: root,
        command: "/supervibe-review",
        subjectType: "reviewer",
        subjectId: agentId,
        agentId,
        stage: "review-gate",
        invocationReason: "active review gate pass",
        outputArtifacts: [output],
        startedAt: "2026-05-14T00:00:00.000Z",
        completedAt: "2026-05-14T00:01:00.000Z",
        handoffId: "review-final-pass",
        hostInvocation: { source: "codex-spawn-agent", invocationId },
      });
    }

    const result = validateActiveWorkflows(root, { pluginRoot: ROOT });

    assert.equal(result.pass, true);
    assert.equal(result.status, "passed");
    assert.equal(result.checks.some((check) => check.id === "command-agent-plan:active" && check.pass === true), true);
    assert.equal(result.issues.some((issue) => issue.code === "active-command-agent-plan-blocked"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("active workflow validator CLI exits non-zero for blocked active workflow", () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-active-cli-blocked-"));
  let result;
  try {
    result = spawnSync(process.execPath, [
      join(ROOT, "scripts", "validate-active-workflows.mjs"),
      "--root",
      root,
      "--command",
      "/supervibe-plan",
      "--host",
      "codex",
      "--handoff-id",
      "active-plan-run",
      "--plugin-root",
      ROOT,
    ], {
      cwd: ROOT,
      encoding: "utf8",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  assert.equal(result.status, 1);
  assert.match(result.stdout, /SUPERVIBE_ACTIVE_WORKFLOWS/);
  assert.match(result.stdout, /ACTIVE_WORKFLOWS: 1/);
  assert.match(result.stdout, /ISSUE: active-command-agent-plan-blocked/);
});

test("package check includes active workflow validator", () => {
  const packageJson = JSON.parse(execFileSync(process.execPath, [
    "-e",
    "process.stdout.write(require('fs').readFileSync('package.json','utf8'))",
  ], { cwd: ROOT, encoding: "utf8" }));

  assert.equal(packageJson.scripts.check, "node scripts/run-release-check.mjs");
  assert.match(packageJson.scripts["check:full"], /validate:active-workflows/);
  assert.equal(packageJson.scripts["validate:active-workflows"], "node scripts/validate-active-workflows.mjs");
});
