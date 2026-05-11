import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  atomizePlanToWorkItems,
  writeWorkItemGraph,
} from "../scripts/lib/supervibe-plan-to-work-items.mjs";
import { runAutonomousLoop } from "../scripts/lib/autonomous-loop-runner.mjs";
import { createShellStubAdapter } from "../scripts/lib/autonomous-loop-tool-adapters.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const execFileAsync = promisify(execFile);

const PLAN = `# Claim Ready Plan

## Task 1: First ready task
**Files:**
- Test: \`tests/first.test.mjs\`
**Rollback:** git revert sha
**Acceptance Criteria:**
- First task is claimed.
\`\`\`bash
node --test tests/first.test.mjs
\`\`\`

## Task 2: Second task
**Files:**
- Test: \`tests/second.test.mjs\`
**Rollback:** git revert sha
**Acceptance Criteria:**
- Second task waits for first task.
\`\`\`bash
node --test tests/second.test.mjs
\`\`\`
`;

test("loop CLI claim-ready claims the first ready work item in the graph", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-claim-ready-"));
  try {
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/claim-ready.md",
      epicId: "epic-claim-ready",
      planReviewPassed: true,
    });
    const { graphPath } = await writeWorkItemGraph(graph, { rootDir: temp });

    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "scripts", "supervibe-loop.mjs"),
      "--claim-ready",
      "--file",
      graphPath,
      "--actor",
      "tester",
    ], { cwd: ROOT });

    assert.match(stdout, /ACTION: claim-ready/);
    assert.match(stdout, /ITEM: epic-claim-ready-t1/);

    const saved = JSON.parse(await readFile(graphPath, "utf8"));
    const first = saved.items.find((item) => item.itemId === "epic-claim-ready-t1");
    assert.equal(first.status, "claimed");
    assert.equal(first.owner, "tester");
    assert.equal(saved.claims[0].taskId, "epic-claim-ready-t1");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("autonomous loop writes dry-run task completion back to canonical graph", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-sync-"));
  try {
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/loop-sync.md",
      epicId: "epic-loop-sync",
      planReviewPassed: true,
    });
    const { graphPath } = await writeWorkItemGraph(graph, { rootDir: temp });

    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "scripts", "supervibe-loop.mjs"),
      "--file",
      graphPath,
      "--dry-run",
      "--run-id",
      "loop-sync-test",
    ], { cwd: temp });

    assert.match(stdout, /SUPERVIBE_LOOP_STATUS/);
    assert.match(stdout, /COMPLETION_SEMANTICS: dry-run-preview-complete/);
    assert.match(stdout, /PRODUCTION_READY: false/);
    const saved = JSON.parse(await readFile(graphPath, "utf8"));
    const first = saved.items.find((item) => item.itemId === "epic-loop-sync-t1");
    assert.equal(first.status, "complete");
    assert.equal(saved.nativeLoopSync.status, "synced");
    assert.equal(saved.nativeLoopSync.runId, "loop-sync-test");
    assert.ok(first.evidence.some((entry) => entry.mode === "dry-run"));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("autonomous loop accepts legacy graph items without itemId or execution hints", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-legacy-graph-"));
  try {
    const graphPath = join(temp, "legacy-graph.json");
    await writeFile(graphPath, `${JSON.stringify({
      kind: "supervibe-work-item-graph",
      graph_id: "legacy-epic",
      title: "Legacy Epic",
      items: [
        { id: "legacy-epic", type: "epic", status: "open", title: "Legacy Epic" },
        { id: "legacy-task", type: "task", status: "open", title: "Run legacy task" },
      ],
      tasks: [{ id: "legacy-task", status: "open" }],
    }, null, 2)}\n`, "utf8");

    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "scripts", "supervibe-loop.mjs"),
      "--file",
      graphPath,
      "--dry-run",
      "--run-id",
      "legacy-loop-sync-test",
    ], { cwd: temp });

    assert.match(stdout, /NATIVE_WORK_GRAPH_SYNC: synced/);
    const saved = JSON.parse(await readFile(graphPath, "utf8"));
    assert.equal(saved.items.find((item) => item.id === "legacy-task").status, "complete");
    assert.equal(saved.nativeLoopSync.taskCount, 1);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("autonomous loop maps fresh-context failure to graph blocker state", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-failure-sync-"));
  try {
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/failure-sync.md",
      epicId: "epic-failure-sync",
      planReviewPassed: true,
    });
    const { graphPath } = await writeWorkItemGraph(graph, { rootDir: temp });
    const adapter = createShellStubAdapter({ output: "SUPERVIBE_TASK_COMPLETE: false" });

    const result = await runAutonomousLoop({
      rootDir: temp,
      runId: "failure-sync-run",
      plan: graphPath,
      executionMode: "fresh-context",
      adapter,
      maxTaskRetries: 0,
      maxLoops: 1,
    });

    assert.equal(result.status, "BLOCKED");
    const saved = JSON.parse(await readFile(graphPath, "utf8"));
    const first = saved.items.find((item) => item.itemId === "epic-failure-sync-t1");
    assert.equal(first.status, "blocked");
    assert.equal(saved.nativeLoopSync.status, "synced");
    assert.equal(saved.nativeLoopSync.evidenceMode, "runtime");
    assert.match(first.resumeNotes.blocker, /missing_evidence|verification_failed/);
    assert.match(first.resumeNotes.nextAction, /resolve blocker before retry/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("loop CLI resume prints active work graph next action after interruption", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-resume-graph-"));
  try {
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/resume-graph.md",
      epicId: "epic-resume-graph",
      planReviewPassed: true,
    });
    const updatedGraph = {
      ...graph,
      items: graph.items.map((item) => item.itemId === "epic-resume-graph-t1" ? { ...item, status: "complete" } : item),
      tasks: graph.tasks.map((task) => task.id === "epic-resume-graph-t1" ? { ...task, status: "complete" } : task),
    };
    const { graphPath } = await writeWorkItemGraph(updatedGraph, { rootDir: temp });
    const statePath = join(temp, ".supervibe", "memory", "loops", "interrupted-run", "state.json");
    await mkdir(dirname(statePath), { recursive: true });
    await writeFile(statePath, `${JSON.stringify({
      schema_version: 1,
      command_version: 1,
      rubric_version: 1,
      run_id: "interrupted-run",
      status: "BLOCKED",
      next_action: "resume_from_work_graph",
      task_graph: {
        graph_id: "epic-resume-graph",
        source: { type: "work-item-graph", path: graphPath },
        tasks: [],
      },
    }, null, 2)}\n`, "utf8");

    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "scripts", "supervibe-loop.mjs"),
      "--resume",
      statePath,
    ], { cwd: temp });

    assert.match(stdout, /SUPERVIBE_RESUME_WORK_GRAPH/);
    assert.match(stdout, /EPIC: epic-resume-graph/);
    assert.match(stdout, /NEXT_READY: epic-resume-graph-t2/);
    assert.match(stdout, /NEXT_ACTION: continue ready work item epic-resume-graph-t2/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("loop tracker-prime prints atomize and runtime gate guidance when graph is absent", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-no-active-"));
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "scripts", "supervibe-loop.mjs"),
      "--tracker-prime",
    ], { cwd: temp });

    assert.match(stdout, /STATUS: no active work graph/);
    assert.match(stdout, /ATOMIZE_COMMAND: \/supervibe-loop --atomize-plan <plan-path> --plan-review-passed/);
    assert.match(stdout, /RUNTIME_GATE: node scripts\/supervibe-task-graph-maturity\.mjs --require-active-graph/);
    assert.match(stdout, /UI_COMMAND: \/supervibe-ui/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("loop CLI status does not report terminal review gates as pending review work", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-terminal-status-"));
  try {
    const graph = atomizePlanToWorkItems(`${PLAN}

### REVIEW GATE 1
`, {
      planPath: ".supervibe/artifacts/plans/terminal-status.md",
      epicId: "epic-terminal-status",
      planReviewPassed: true,
    });
    const closedGraph = {
      ...graph,
      items: graph.items.map((item) => ({
        ...item,
        status: "complete",
        verificationEvidence: item.type === "epic" ? item.verificationEvidence : [{ taskId: item.itemId, command: "node --test", status: "pass", output: "verified" }],
      })),
      tasks: graph.tasks.map((task) => ({
        ...task,
        status: "complete",
        verificationEvidence: [{ taskId: task.id, command: "node --test", status: "pass", output: "verified" }],
      })),
    };
    const { graphPath } = await writeWorkItemGraph(closedGraph, { rootDir: temp });

    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "scripts", "supervibe-loop.mjs"),
      "--status",
      "--file",
      graphPath,
    ], { cwd: ROOT });

    assert.match(stdout, /REVIEW: 0/);
    assert.match(stdout, /NEXT_ACTION: run \/supervibe-loop --validate-completion/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("loop CLI status can emit an auto UI daemon plan without spawning", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-auto-ui-"));
  try {
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/auto-ui.md",
      epicId: "epic-auto-ui",
      planReviewPassed: true,
    });
    const { graphPath } = await writeWorkItemGraph(graph, { rootDir: temp });

    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "scripts", "supervibe-loop.mjs"),
      "--status",
      "--file",
      graphPath,
      "--auto-ui-dry-run",
      "--ui-port",
      "3999",
    ], { cwd: temp });

    assert.match(stdout, /SUPERVIBE_AUTO_UI/);
    assert.match(stdout, /STATUS: dry-run/);
    assert.match(stdout, /URL: http:\/\/127\.0\.0\.1:3999\//);
    assert.match(stdout, /COMMAND: npm run supervibe:ui -- --daemon --port 3999 --file/);
    assert.match(stdout, /GRAPH: .*graph\.json/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("loop CLI no-auto-ui opt-out suppresses auto UI output", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-no-auto-ui-"));
  try {
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/no-auto-ui.md",
      epicId: "epic-no-auto-ui",
      planReviewPassed: true,
    });
    const { graphPath } = await writeWorkItemGraph(graph, { rootDir: temp });

    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "scripts", "supervibe-loop.mjs"),
      "--status",
      "--file",
      graphPath,
      "--auto-ui",
      "--auto-ui-dry-run",
      "--no-auto-ui",
      "--ui-port",
      "3998",
    ], { cwd: temp });

    assert.match(stdout, /SUPERVIBE_EPIC_STATUS/);
    assert.doesNotMatch(stdout, /SUPERVIBE_AUTO_UI/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("loop CLI trusted completion mode rejects untrusted graph evidence", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-trusted-completion-"));
  try {
    const graph = completedGraph("epic-loop-trusted-completion");
    const { graphPath } = await writeWorkItemGraph(graph, { rootDir: temp });

    let error;
    try {
      await execFileAsync(process.execPath, [
        join(ROOT, "scripts", "supervibe-loop.mjs"),
        "--validate-completion",
        "--file",
        graphPath,
        "--require-trusted-evidence",
      ], { cwd: temp });
    } catch (err) {
      error = err;
    }

    assert.ok(error);
    assert.match(error.stdout, /REQUIRE_TRUSTED_EVIDENCE: true/);
    assert.match(error.stdout, /untrusted-evidence/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

function completedGraph(epicId) {
  const graph = atomizePlanToWorkItems(PLAN, {
    planPath: `.supervibe/artifacts/plans/${epicId}.md`,
    epicId,
    planReviewPassed: true,
  });
  const now = "2026-05-10T00:00:00.000Z";
  const evidence = [];

  graph.items = graph.items.map((item) => {
    if (item.type === "followup") return item;
    const next = {
      ...item,
      status: "complete",
      closedAt: now,
      closeReason: "validated by loop completion gate",
    };
    if (item.type !== "epic") {
      const itemEvidence = {
        taskId: item.itemId,
        command: item.verificationCommands?.[0] || "manual-review",
        status: "pass",
        output: "verified",
      };
      next.verificationEvidence = [itemEvidence];
      evidence.push(itemEvidence);
    }
    return next;
  });
  graph.tasks = graph.tasks.map((task) => ({
    ...task,
    status: "complete",
    verificationEvidence: evidence.filter((item) => item.taskId === task.id),
  }));
  graph.evidence = evidence;
  return graph;
}
