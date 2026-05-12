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

  assert.match(packageJson.scripts.check, /validate:active-workflows/);
  assert.equal(packageJson.scripts["validate:active-workflows"], "node scripts/validate-active-workflows.mjs");
});
