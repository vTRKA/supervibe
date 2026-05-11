import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  extractTraceabilityRequirements,
  validateTaskGraphTraceability,
} from "../scripts/validate-task-graph-traceability.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test("traceability extracts goal and acceptance requirements", () => {
  const requirements = extractTraceabilityRequirements(`# Spec

## Goal: Complete task graph runtime

## Acceptance Criteria
- Status explains completed epics.
- Traceability maps requirements to evidence.
`);

  assert.ok(requirements.includes("Complete task graph runtime"));
  assert.ok(requirements.includes("Status explains completed epics."));
  assert.ok(requirements.includes("Traceability maps requirements to evidence."));
});

test("traceability passes mapped terminal work with evidence", () => {
  const report = validateTaskGraphTraceability({
    spec: "## Acceptance Criteria\n- Status explains completed epics.",
    graph: {
      items: [{
        itemId: "task-status",
        status: "complete",
        title: "Status explains completed epics",
        evidence: [{ status: "pass", command: "node --test tests/status.test.mjs" }],
      }],
      evidence: [],
    },
  });

  assert.equal(report.pass, true);
  assert.equal(report.mapped, 1);
});

test("traceability maps requirementIds arrays", () => {
  const report = validateTaskGraphTraceability({
    spec: "## Acceptance Criteria\n- REQ-STATUS",
    graph: {
      items: [{
        itemId: "task-status",
        status: "complete",
        requirementIds: ["REQ-STATUS"],
        evidence: [{ status: "pass", command: "node --test tests/status.test.mjs" }],
      }],
      evidence: [],
    },
  });

  assert.equal(report.pass, true);
  assert.equal(report.mapped, 1);
});

test("traceability strict requirement mode fails active graph with zero requirements", () => {
  const report = validateTaskGraphTraceability({
    graph: { items: [{ itemId: "task", status: "complete", title: "Task", evidence: [{ status: "pass" }] }] },
    requireRequirements: true,
  });

  assert.equal(report.pass, false);
  assert.ok(report.issues.some((issue) => /no source requirements/i.test(issue)));
});

test("traceability fails missing terminal work and missing evidence", () => {
  const report = validateTaskGraphTraceability({
    spec: "## Acceptance Criteria\n- Status explains completed epics.",
    graph: {
      items: [{
        itemId: "task-status",
        status: "ready",
        title: "Status explains completed epics",
      }],
    },
  });

  assert.equal(report.pass, false);
  assert.ok(report.issues.some((issue) => /no terminal work item/i.test(issue)));
});

test("traceability requires skipped impact", () => {
  const report = validateTaskGraphTraceability({
    spec: "## Acceptance Criteria\n- Optional tracker sync.",
    graph: {
      items: [{
        itemId: "task-sync",
        status: "skipped",
        title: "Optional tracker sync",
        evidence: [{ status: "pass", command: "node --test tests/sync.test.mjs" }],
        skipReason: "out of scope",
      }],
    },
  });

  assert.equal(report.pass, false);
  assert.ok(report.issues.some((issue) => /lacks reason and impact/i.test(issue)));
});

test("traceability CLI loads active graph source snapshot in strict mode", () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-traceability-source-"));
  const graphDir = join(root, ".supervibe", "memory", "work-items", "epic-source");
  mkdirSync(graphDir, { recursive: true });
  writeFileSync(join(graphDir, "source-plan.md"), "## Acceptance Criteria\n- Source requirement mapped.\n", "utf8");
  writeFileSync(join(graphDir, "graph.json"), `${JSON.stringify({
    graph_id: "epic-source",
    source: { snapshotPath: "source-plan.md" },
    items: [{
      itemId: "task-source",
      status: "complete",
      title: "Source requirement mapped",
      evidence: [{ status: "pass", command: "node --test tests/source.test.mjs" }],
    }],
  }, null, 2)}\n`, "utf8");

  const stdout = execFileSync(process.execPath, [
    join(ROOT, "scripts/validate-task-graph-traceability.mjs"),
    "--strict",
  ], {
    cwd: root,
    encoding: "utf8",
  });

  assert.match(stdout, /NEUTRAL: false/);
  assert.match(stdout, /REQUIREMENTS: 1/);
});
