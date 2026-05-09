import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  atomizePlanToWorkItems,
  writeWorkItemGraph,
} from "../scripts/lib/supervibe-plan-to-work-items.mjs";
import {
  defaultWorkItemRegistryPath,
  readWorkItemRegistry,
  resolveActiveWorkItemGraphPath,
} from "../scripts/lib/supervibe-work-item-registry.mjs";

const execFileAsync = promisify(execFile);

const PLAN = `# Registry Flow Plan

Critical path: T1 -> T2

## Task 1: Build registry
**Files:**
- Create: \`scripts/lib/registry.js\`
**Acceptance Criteria:**
- Registry is written.
\`\`\`bash
npm test -- registry
\`\`\`

## Task 2: Wire status
**Files:**
- Modify: \`scripts/status.js\`
**Acceptance Criteria:**
- Status reads registry.
\`\`\`bash
npm test -- status
\`\`\`
`;

test("work-item writes register the active graph and status resolves it", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-active-graph-"));
  try {
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/registry.md",
      epicId: "epic-registry",
      planReviewPassed: true,
    });
    const writeResult = await writeWorkItemGraph(graph, { rootDir: root });
    const registry = await readWorkItemRegistry(defaultWorkItemRegistryPath(root));

    assert.equal(registry.activeEpicId, "epic-registry");
    assert.equal(registry.activeGraphPath, ".supervibe/memory/work-items/epic-registry/graph.json");
    assert.equal(registry.epics["epic-registry"].ready, 1);
    assert.equal(await resolveActiveWorkItemGraphPath({ rootDir: root }), writeResult.graphPath);

    const { stdout } = await execFileAsync(process.execPath, [
      join(process.cwd(), "scripts", "supervibe-loop.mjs"),
      "--status",
    ], { cwd: root });

    assert.match(stdout, /SUPERVIBE_EPIC_STATUS/);
    assert.match(stdout, /EPIC: epic-registry/);
    assert.match(stdout, /SOURCE: active-registry/);
    assert.match(stdout, /NEXT_READY: epic-registry-t1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loop CLI dependency and reparent actions mutate canonical graph", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-cli-actions-"));
  try {
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/registry.md",
      epicId: "epic-registry",
      planReviewPassed: true,
    });
    await writeWorkItemGraph(graph, { rootDir: root });
    const graphRel = ".supervibe/memory/work-items/epic-registry/graph.json";
    const graphPath = join(root, graphRel);

    await execFileAsync(process.execPath, [
      join(process.cwd(), "scripts", "supervibe-loop.mjs"),
      "--dep-add",
      "epic-registry-t1",
      "--to",
      "epic-registry-t2",
      "--file",
      graphRel,
    ], { cwd: root });

    await execFileAsync(process.execPath, [
      join(process.cwd(), "scripts", "supervibe-loop.mjs"),
      "--reparent",
      "epic-registry-t2",
      "--parent",
      "epic-registry-t1",
      "--file",
      graphRel,
    ], { cwd: root });

    await execFileAsync(process.execPath, [
      join(process.cwd(), "scripts", "supervibe-loop.mjs"),
      "--dep-remove",
      "epic-registry-t1",
      "--to",
      "epic-registry-t2",
      "--file",
      graphRel,
    ], { cwd: root });

    const saved = JSON.parse(await readFile(graphPath, "utf8"));
    const t1 = saved.items.find((item) => item.itemId === "epic-registry-t1");
    const t2 = saved.items.find((item) => item.itemId === "epic-registry-t2");

    assert.deepEqual(t1.blocks, []);
    assert.equal(t2.parentId, "epic-registry-t1");
    assert.ok(saved.events.some((event) => event.action === "dep-add"));
    assert.ok(saved.events.some((event) => event.action === "reparent"));
    assert.ok(saved.events.some((event) => event.action === "dep-remove"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loop CLI creates a new work item in an existing graph", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-cli-create-"));
  try {
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/registry.md",
      epicId: "epic-registry",
      planReviewPassed: true,
    });
    await writeWorkItemGraph(graph, { rootDir: root });
    const graphRel = ".supervibe/memory/work-items/epic-registry/graph.json";

    const { stdout } = await execFileAsync(process.execPath, [
      join(process.cwd(), "scripts", "supervibe-loop.mjs"),
      "--create-work-item",
      "--file",
      graphRel,
      "--title",
      "Investigate resume edge case",
      "--acceptance",
      "Resume keeps active graph",
      "--verification",
      "node --test tests/resume.test.mjs",
      "--yes",
    ], { cwd: root });

    assert.match(stdout, /ACTION: create/);
    const saved = JSON.parse(await readFile(join(root, graphRel), "utf8"));
    const created = saved.items.find((item) => item.title === "Investigate resume edge case");
    assert.ok(created);
    assert.equal(created.parentId, "epic-registry");
    assert.ok(created.verificationCommands.includes("node --test tests/resume.test.mjs"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loop CLI blocks direct plan execution until a work graph exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-plan-gate-"));
  try {
    const planPath = join(root, "plan.md");
    await writeFile(planPath, PLAN, "utf8");

    let error = null;
    try {
      await execFileAsync(process.execPath, [
        join(process.cwd(), "scripts", "supervibe-loop.mjs"),
        "--plan",
        planPath,
      ], { cwd: root });
    } catch (err) {
      error = err;
    }

    assert.ok(error, "direct plan execution should fail without graph atomization");
    assert.match(error.stderr, /PLAN_EXECUTION_REQUIRES_WORK_GRAPH/);
    assert.match(error.stderr, /--atomize-plan/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loop CLI executes the active work graph when no plan is passed", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-active-run-"));
  try {
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/registry.md",
      epicId: "epic-registry",
      planReviewPassed: true,
    });
    await writeWorkItemGraph(graph, { rootDir: root });

    const { stdout } = await execFileAsync(process.execPath, [
      join(process.cwd(), "scripts", "supervibe-loop.mjs"),
      "--dry-run",
    ], { cwd: root });

    assert.match(stdout, /SUPERVIBE_LOOP_STATUS/);
    assert.match(stdout, /TASK_SOURCE: active-work-graph/);
    assert.match(stdout, /STATUS: COMPLETE/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reviewed plan atomizes into active graph and loop runs graph-first", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-plan-to-loop-"));
  try {
    const planRel = ".supervibe/artifacts/plans/registry.md";
    const planPath = join(root, planRel);
    await mkdir(join(planPath, ".."), { recursive: true });
    await writeFile(planPath, PLAN, "utf8");

    const atomized = await execFileAsync(process.execPath, [
      join(process.cwd(), "scripts", "supervibe-loop.mjs"),
      "--atomize-plan",
      planRel,
      "--plan-review-passed",
    ], { cwd: root });
    assert.match(atomized.stdout, /SUPERVIBE_WORK_ITEMS/);
    assert.match(atomized.stdout, /GRAPH: .*registry-flow-plan/);

    const status = await execFileAsync(process.execPath, [
      join(process.cwd(), "scripts", "supervibe-loop.mjs"),
      "--status",
    ], { cwd: root });
    assert.match(status.stdout, /SUPERVIBE_EPIC_STATUS/);
    assert.match(status.stdout, /SOURCE: active-registry/);
    assert.match(status.stdout, /READY: 1/);

    const run = await execFileAsync(process.execPath, [
      join(process.cwd(), "scripts", "supervibe-loop.mjs"),
      "--dry-run",
    ], { cwd: root });
    assert.match(run.stdout, /SUPERVIBE_LOOP_STATUS/);
    assert.match(run.stdout, /TASK_SOURCE: active-work-graph/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
