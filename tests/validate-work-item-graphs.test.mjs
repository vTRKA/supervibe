import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { atomizePlanToWorkItems, writeWorkItemGraph } from "../scripts/lib/supervibe-plan-to-work-items.mjs";
import { validateWorkItemGraphFiles } from "../scripts/validate-work-item-graphs.mjs";

const PLAN = `# Graph Validation Plan

## Task 1: Validate graph
**Files:**
- Test: \`tests/example.test.mjs\`
**Rollback:** git revert sha
**Acceptance Criteria:**
- Graph validation catches malformed work-item graphs.
\`\`\`bash
node --test tests/example.test.mjs
\`\`\`
`;

test("work item graph validator fails malformed work-item graph files", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-graph-validator-"));
  try {
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/graph-validation.md",
      epicId: "epic-graph-validation",
      planReviewPassed: true,
      dryRun: true,
    });
    graph.items = graph.items.filter((item) => item.type === "epic");
    graph.tasks = [];

    const graphPath = join(temp, "graph.json");
    await writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`);

    const report = await validateWorkItemGraphFiles({ rootDir: temp, files: [graphPath] });
    assert.equal(report.pass, false);
    assert.ok(report.results[0].validation.issues.some((issue) => issue.code === "missing-child-task"));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("strict work item graph validation requires adjacent source plan snapshot", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-graph-source-snapshot-"));
  try {
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/graph-validation.md",
      epicId: "epic-graph-validation",
      planReviewPassed: true,
      dryRun: true,
    });
    const { graphPath } = await writeWorkItemGraph(graph, { rootDir: temp });

    const passing = await validateWorkItemGraphFiles({
      rootDir: temp,
      files: [graphPath],
      requireSourcePlanSnapshot: true,
    });
    assert.equal(passing.pass, true);

    await writeFile(join(temp, ".supervibe", "memory", "work-items", "epic-graph-validation", "source-plan.md"), "changed plan", "utf8");
    const failing = await validateWorkItemGraphFiles({
      rootDir: temp,
      files: [graphPath],
      requireSourcePlanSnapshot: true,
    });
    assert.equal(failing.pass, false);
    assert.ok(failing.results[0].validation.issues.some((issue) => issue.code === "source-plan-snapshot-hash-mismatch"));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
