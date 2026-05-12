import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildDesignWorkflowReport,
  formatDesignWorkflowReport,
} from "../scripts/lib/design-workflow-report.mjs";

const ROOT = process.cwd();

test("design workflow report separates declared maturity from active readiness", () => {
  const report = buildDesignWorkflowReport(process.cwd(), {
    activeCompletionResult: {
      pass: false,
      status: "blocked",
      command: "/supervibe-design",
      slug: "agent-chat",
      handoffId: "run-1",
      checks: [],
      issues: [{ code: "active-design-receipts-checked-zero", file: "scope", message: "empty" }],
      warnings: [],
      nextAction: "run real specialists and issue scoped receipts",
    },
    activeWorkflowsResult: { pass: true, checked: 0, issues: [], warnings: [] },
    workflowStateResult: { pass: true, checked: 0, issues: [] },
    declaredMaturity: "10/10-global-diagnostic",
  });

  assert.equal(report.pass, false);
  assert.equal(report.declaredMaturity, "10/10-global-diagnostic");
  assert.equal(report.activeWorkflowReadiness, "blocked");
  assert.equal(report.releaseGate.pass, false);
  assert.equal(report.releaseGate.status, "blocked");
  assert.equal(report.strictChecks.receiptCoveragePass, "not-checked");
  assert.match(formatDesignWorkflowReport(report), /ACTIVE_WORKFLOW_READINESS: blocked/);
  assert.match(formatDesignWorkflowReport(report), /RELEASE_GATE: blocked/);
  assert.match(formatDesignWorkflowReport(report), /STRICT_CHECKS:/);
  assert.match(formatDesignWorkflowReport(report), /NEXT_REPAIR_ACTION: run real specialists/);
});

test("design workflow report does not mark not-started workflow as ready", () => {
  const report = buildDesignWorkflowReport(process.cwd(), {
    activeCompletionResult: {
      pass: true,
      status: "not-started",
      command: null,
      slug: null,
      handoffId: null,
      checks: [],
      issues: [],
      warnings: [],
      nextAction: "run with --active --command /supervibe-design --slug <slug>",
    },
    activeWorkflowsResult: {
      pass: true,
      status: "not-started",
      checked: 0,
      issues: [],
      warnings: [{ code: "active-workflow-not-started", file: "active-workflows", message: "none" }],
    },
    workflowStateResult: { pass: true, checked: 0, issues: [] },
  });

  assert.equal(report.pass, false);
  assert.equal(report.status, "not-started");
  assert.equal(report.activeWorkflowReadiness, "not-started");
  assert.equal(report.releaseGate.status, "not-started");
  assert.match(formatDesignWorkflowReport(report), /ACTIVE_WORKFLOW_READINESS: not-started/);
});

test("design workflow report lists required agents, missing receipts, and evidence paths", () => {
  const report = buildDesignWorkflowReport(process.cwd(), {
    activeCompletionResult: {
      pass: false,
      status: "blocked",
      command: "/supervibe-design",
      slug: "agent-chat",
      handoffId: "run-1",
      checks: [
        {
          id: "command-agent-plan:active",
          pass: false,
          result: {
            plan: {
              requiredAgentIds: ["creative-director", "prototype-builder"],
              scopedReceiptTrust: { missingSubjects: ["prototype-builder"] },
            },
          },
        },
        {
          id: "design-variant-set:active",
          pass: false,
          result: { manifestPath: ".supervibe/artifacts/prototypes/agent-chat/variant-manifest.json" },
        },
        {
          id: "screenshot-similarity:active",
          pass: false,
          result: { evidencePath: ".supervibe/artifacts/prototypes/agent-chat/screenshot-similarity.json" },
        },
      ],
      issues: [],
      warnings: [],
      nextAction: "repair prototype artifacts",
    },
    activeWorkflowsResult: { pass: true, checked: 1, issues: [], warnings: [] },
    workflowStateResult: { pass: true, checked: 1, issues: [] },
  });

  assert.deepEqual(report.requiredAgents, ["creative-director", "prototype-builder"]);
  assert.deepEqual(report.missingReceipts, ["prototype-builder"]);
  assert.equal(report.strictChecks.variantSetPass, false);
  assert.equal(report.strictChecks.screenshotSimilarityPass, false);
  assert.ok(report.evidencePaths.includes(".supervibe/artifacts/prototypes/agent-chat/variant-manifest.json"));
  assert.ok(report.evidencePaths.includes(".supervibe/artifacts/prototypes/agent-chat/screenshot-similarity.json"));
});

test("design workflow report CLI emits JSON", () => {
  let output = "";
  try {
    output = execFileSync(process.execPath, [
      join(ROOT, "scripts", "validate-design-workflow-report.mjs"),
      "--root",
      ROOT,
      "--json",
    ], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    output = error.stdout.toString();
  }
  const parsed = JSON.parse(output);

  assert.equal(parsed.schemaVersion, 1);
  assert.ok(["not-started", "blocked", "ready"].includes(parsed.activeWorkflowReadiness));
});

test("design workflow report CLI treats non-active not-started state as diagnostic success", () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-design-workflow-report-cli-"));
  let output = "";
  try {
    output = execFileSync(process.execPath, [
      join(ROOT, "scripts", "validate-design-workflow-report.mjs"),
      "--root",
      root,
    ], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  assert.match(output, /SUPERVIBE_DESIGN_WORKFLOW_REPORT/);
  assert.match(output, /STATUS: not-started/);
});
