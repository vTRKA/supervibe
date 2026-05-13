import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { atomizePlanToWorkItems } from "../scripts/lib/supervibe-plan-to-work-items.mjs";
import { summarizeTaskGraphStatus, validateTaskGraphStatusConsistency } from "../scripts/validate-task-graph-status-consistency.mjs";

const PLAN = `# Status Consistency Plan

Critical path: T1 -> T2

## Task 1: Build status consistency
**Files:**
- Modify: \`scripts/supervibe-status.mjs\`
**Acceptance Criteria:**
- Status reports completed epics as ready to finish.
\`\`\`bash
node scripts/supervibe-status.mjs --no-color
\`\`\`

## Task 2: Test status consistency
**Files:**
- Create: \`tests/status.test.mjs\`
**Acceptance Criteria:**
- Status consistency tests pass.
\`\`\`bash
node --test tests/status.test.mjs
\`\`\`
`;

test("completed graph reports finish/archive as next action", () => {
  const graph = completedGraph();
  const summary = summarizeTaskGraphStatus(graph);

  assert.equal(summary.completionPass, true);
  assert.equal(summary.nextAction, "finish/archive completed epic");
});

test("open graph reports validation or unblock as next action", () => {
  const graph = completedGraph();
  graph.items.find((item) => item.itemId.endsWith("-t1")).status = "ready";
  graph.tasks.find((task) => task.id.endsWith("-t1")).status = "ready";

  const summary = summarizeTaskGraphStatus(graph);

  assert.equal(summary.completionPass, false);
  assert.match(summary.nextAction, /claim|validate completion|unblock/);
});

test("closed historical graphs do not require active graph selection", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-status-consistency-"));
  try {
    await writeGraph(root, "epic-status-a", completedGraph({ epicId: "epic-status-a" }));
    await writeGraph(root, "epic-status-b", completedGraph({ epicId: "epic-status-b" }));

    const report = await validateTaskGraphStatusConsistency({ rootDir: root });

    assert.equal(report.pass, true);
    assert.equal(report.neutral, false);
    assert.equal(report.summaries.length, 2);
    assert.deepEqual(report.issues, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function completedGraph({ epicId = "epic-status" } = {}) {
  const graph = atomizePlanToWorkItems(PLAN, {
    planPath: ".supervibe/artifacts/plans/status.md",
    epicId,
    planReviewPassed: true,
  });
  const evidence = {
    kind: "test",
    command: "node --test tests/task-graph-status-consistency.test.mjs",
    status: "pass",
    outputSummary: "status consistency verified",
    receiptId: "status-consistency-test",
    mode: "production",
  };
  graph.items = graph.items.map((item) => (
    item.type === "followup"
      ? item
      : { ...item, status: "complete", evidence: [{ ...evidence, taskId: item.itemId }] }
  ));
  graph.tasks = graph.tasks.map((task) => ({
    ...task,
    status: "complete",
    evidence: [{ ...evidence, taskId: task.id }],
  }));
  graph.evidence = graph.tasks.map((task) => ({ ...evidence, taskId: task.id }));
  return graph;
}

async function writeGraph(root, epicId, graph) {
  const dir = join(root, ".supervibe", "memory", "work-items", epicId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "graph.json"), `${JSON.stringify(graph, null, 2)}\n`, "utf8");
}
