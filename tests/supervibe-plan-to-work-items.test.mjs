import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

import {
  applyWorkItemAdapter,
  atomizePlanToWorkItems,
  createWorkItemGraph,
  createNativeWorkItemAdapter,
  parsePlanForWorkItems,
  validateWorkItemGraph,
  WORK_ITEM_REQUIRED_FIELDS,
  WORK_ITEM_TYPES,
  workItemsToLoopTasks,
  writeWorkItemGraph,
} from "../scripts/lib/supervibe-plan-to-work-items.mjs";

const execFileAsync = promisify(execFile);

const PLAN = `# Payment Flow Implementation Plan

Critical path: T1 -> T2 -> T3
Parallelizable: T4 || T5

## Task 1: Foundation schema
**Files:**
- Create: \`src/schema.ts\`
**Estimated time:** 15min, confidence: high
**Rollback:** git revert <sha>
**Acceptance Criteria:**
- Schema validates payment records.
\`\`\`bash
npm test -- schema.test.ts
\`\`\`

## Task 2: API implementation
**Files:**
- Modify: \`src/api.ts\`
**Estimated time:** 30min, confidence: high
**Rollback:** git revert <sha>
**Acceptance Criteria:**
- API returns idempotent responses.
\`\`\`bash
npm test -- api.test.ts
\`\`\`

### REVIEW GATE 1

## Task 3: Final review
**Files:**
- Test: \`tests/payment.test.ts\`
**Rollback:** git revert <sha>
**Acceptance Criteria:**
- Full payment suite is green.
\`\`\`bash
npm test -- payment.test.ts
\`\`\`
- Follow-up: add external provider replay fixture.
`;

test("plan parser extracts tasks, critical path, parallel groups, and review gates", () => {
  assert.ok(WORK_ITEM_TYPES.includes("epic"));
  assert.ok(WORK_ITEM_REQUIRED_FIELDS.includes("verificationCommands"));
  const parsed = parsePlanForWorkItems(PLAN, ".supervibe/artifacts/plans/payment.md");
  assert.equal(parsed.title, "Payment Flow Implementation Plan");
  assert.equal(parsed.tasks.length, 3);
  assert.deepEqual(parsed.criticalPath, ["T1", "T2", "T3"]);
  assert.equal(parsed.parallelGroups.get("T4"), "parallel");
  assert.equal(parsed.reviewGates.length, 1);
});

test("atomization creates one epic, child tasks, blocker edges, gates, and followups", () => {
  const graph = atomizePlanToWorkItems(PLAN, {
    planPath: ".supervibe/artifacts/plans/payment.md",
    epicId: "epic-payment",
    planReviewPassed: true,
  });

  assert.equal(graph.epicId, "epic-payment");
  assert.equal(graph.items.filter((item) => item.type === "epic").length, 1);
  assert.ok(graph.items.some((item) => item.type === "gate"));
  assert.ok(graph.items.some((item) => item.type === "followup"));
  assert.equal(graph.validation.valid, true);

  const t1 = graph.items.find((item) => item.itemId === "epic-payment-t1");
  const t2 = graph.items.find((item) => item.itemId === "epic-payment-t2");
  assert.ok(t1.blocks.includes(t2.itemId));
  assert.ok(t2.acceptanceCriteria.some((item) => /idempotent/.test(item)));
  assert.ok(t2.verificationCommands.includes("npm test -- api.test.ts"));
  assert.deepEqual(t2.writeScope, [{ action: "modify", path: "src/api.ts" }]);
});

test("work item graph converts into runner-compatible loop tasks", () => {
  const graph = atomizePlanToWorkItems(PLAN, {
    planPath: ".supervibe/artifacts/plans/payment.md",
    epicId: "epic-payment",
    planReviewPassed: true,
  });
  const tasks = workItemsToLoopTasks(graph.items);
  const apiTask = tasks.find((task) => task.id === "epic-payment-t2");

  assert.equal(tasks.some((task) => task.type === "epic"), false);
  assert.equal(apiTask.epicId, "epic-payment");
  assert.deepEqual(apiTask.dependencies, ["epic-payment-t1"]);
  assert.equal(apiTask.writeScope[0].path, "src/api.ts");
});

test("validation rejects unknown blockers", () => {
  const graph = atomizePlanToWorkItems(PLAN, {
    planPath: ".supervibe/artifacts/plans/payment.md",
    epicId: "epic-payment",
    planReviewPassed: true,
  });
  graph.items[1].blocks.push("missing");
  const validation = validateWorkItemGraph(graph);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.code === "unknown-block"));
});

test("createWorkItemGraph exposes task graph projection", () => {
  const graph = atomizePlanToWorkItems(PLAN, {
    planPath: ".supervibe/artifacts/plans/payment.md",
    epicId: "epic-payment",
    planReviewPassed: true,
  });
  const projected = createWorkItemGraph({
    epicId: graph.epicId,
    planPath: ".supervibe/artifacts/plans/payment.md",
    title: graph.title,
    items: graph.items,
  });
  assert.equal(projected.tasks.some((task) => task.id === "epic-payment-t1"), true);
});

test("native write and external adapter failure preserve native graph", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-work-items-"));
  try {
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/payment.md",
      epicId: "epic-payment",
      planReviewPassed: true,
    });
    const writeResult = await writeWorkItemGraph(graph, { rootDir: temp });
    const saved = JSON.parse(await readFile(writeResult.graphPath, "utf8"));
    assert.equal(saved.kind, "supervibe-work-item-graph");

    const adapter = {
      id: "failing",
      async createGraph() {
        throw new Error("tracker unavailable");
      },
    };
    const result = await applyWorkItemAdapter(graph, adapter, { rootDir: temp });
    assert.equal(result.ok, false);
    assert.equal(result.nativeResult.graphPath.endsWith("graph.json"), true);

    const nativeAdapter = createNativeWorkItemAdapter({ rootDir: temp, outDir: join(temp, "native") });
    const nativeResult = await nativeAdapter.createGraph(graph);
    assert.equal(nativeResult.ok, true);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("loop CLI atomizes a reviewed plan into graph artifacts", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-cli-"));
  try {
    const planPath = join(temp, "plan.md");
    await writeFile(planPath, PLAN);
    const { stdout } = await execFileAsync(process.execPath, [
      join(process.cwd(), "scripts", "supervibe-loop.mjs"),
      "--atomize-plan",
      planPath,
      "--plan-review-passed",
      "--out",
      join(temp, "out"),
    ], { cwd: process.cwd() });

    assert.match(stdout, /SUPERVIBE_WORK_ITEMS/);
    assert.match(stdout, /VALID: true/);
    const saved = JSON.parse(await readFile(join(temp, "out", "graph.json"), "utf8"));
    assert.equal(saved.kind, "supervibe-work-item-graph");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
