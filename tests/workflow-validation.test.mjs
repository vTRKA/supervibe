import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
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
