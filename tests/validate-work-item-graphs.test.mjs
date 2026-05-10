import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { atomizePlanToWorkItems } from "../scripts/lib/supervibe-plan-to-work-items.mjs";
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
