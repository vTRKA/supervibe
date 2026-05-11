import assert from "node:assert/strict";
import test from "node:test";

import {
  extractTraceabilityRequirements,
  validateTaskGraphTraceability,
} from "../scripts/validate-task-graph-traceability.mjs";

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
