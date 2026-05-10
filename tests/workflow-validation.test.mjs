import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  formatWorkflowValidationReport,
  validateWorkflow,
} from "../scripts/supervibe-workflow-validate.mjs";

const ROOT = process.cwd();

test("workflow validation aggregates design workflow checks", () => {
  const result = validateWorkflow(ROOT, { workflow: "/supervibe-design", slug: "agent-chat" });
  const report = formatWorkflowValidationReport(result);

  assert.equal(result.workflow, "/supervibe-design");
  assert.ok(result.checks.some((check) => check.id === "workflow-receipts"));
  assert.ok(result.checks.some((check) => check.id === "design-wizard"));
  assert.ok(result.checks.some((check) => check.id === "design-variant-set"));
  assert.ok(result.checks.some((check) => check.id === "skill-source-report"));
  assert.match(report, /SUPERVIBE_WORKFLOW_VALIDATE/);
  assert.match(report, /WORKFLOW: \/supervibe-design/);
});

test("workflow validation CLI prints workflow and slug", () => {
  const out = execFileSync(process.execPath, [
    join(ROOT, "scripts", "supervibe-workflow-validate.mjs"),
    "--workflow",
    "/supervibe-design",
    "--slug",
    "agent-chat",
  ], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  assert.match(out, /SUPERVIBE_WORKFLOW_VALIDATE/);
  assert.match(out, /SLUG: agent-chat/);
  assert.match(out, /CHECK: design-agent-receipts/);
});

test("workflow validation blocks invalid design variant set", () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-workflow-variant-set-"));
  try {
    const manifest = join(root, ".supervibe", "artifacts", "prototypes", "agent-chat", "variant-manifest.json");
    mkdirSync(dirname(manifest), { recursive: true });
    writeFileSync(manifest, JSON.stringify({
      schemaVersion: 1,
      slug: "agent-chat",
      requestedVariantCount: 2,
      variants: [{ id: "variant-1" }],
    }, null, 2), "utf8");

    const result = validateWorkflow(root, {
      workflow: "/supervibe-design",
      slug: "agent-chat",
      pluginRoot: ROOT,
    });
    const variantSet = result.checks.find((item) => item.id === "design-variant-set");

    assert.equal(result.pass, false);
    assert.equal(variantSet.pass, false);
    assert.ok(result.issues.some((issue) => issue.check === "design-variant-set"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("workflow validation resolves design wizard docs from plugin root", () => {
  const result = validateWorkflow(ROOT, {
    workflow: "/supervibe-design",
    slug: "agent-chat",
    pluginRoot: ROOT,
  });
  const wizard = result.checks.find((item) => item.id === "design-wizard");

  assert.equal(wizard.pass, true);
  assert.equal(wizard.blocking, true);
});

test("active workflow validation blocks when command agents are not callable", () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-workflow-active-command-"));
  try {
    writeFileSync(join(root, "AGENTS.md"), "# Test host\n", "utf8");

    const result = validateWorkflow(root, {
      workflow: "/supervibe-design",
      slug: "agent-chat",
      pluginRoot: ROOT,
      active: true,
      host: "codex",
      handoffId: "agent-chat-run",
    });
    const commandPlan = result.checks.find((item) => item.id === "command-agent-plan");

    assert.equal(result.pass, false);
    assert.equal(result.active, true);
    assert.equal(commandPlan.pass, false);
    assert.ok(result.issues.some((issue) => issue.check === "command-agent-plan" && issue.code === "agent-required-blocked"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("active workflow validation treats skipped critical production pair as blocking when required", () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-workflow-active-production-"));
  try {
    writeFileSync(join(root, "AGENTS.md"), "# Test host\n", "utf8");

    const result = validateWorkflow(root, {
      workflow: "/supervibe-design",
      slug: "agent-chat",
      pluginRoot: ROOT,
      active: true,
      host: "codex",
      handoffId: "agent-chat-run",
      requireProductionPair: true,
    });
    const production = result.checks.find((item) => item.id === "prototype-production-regression");

    assert.equal(result.pass, false);
    assert.equal(production.pass, false);
    assert.ok(result.skippedCritical >= 1);
    assert.ok(result.issues.some((issue) => issue.check === "prototype-production-regression"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
