import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
import {
  issueWorkflowInvocationReceipt,
  readWorkflowReceipts,
} from "../scripts/lib/supervibe-workflow-receipt-runtime.mjs";
import { buildTaskGraphMaturityReport } from "../scripts/lib/supervibe-task-graph-maturity.mjs";

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

test("loop CLI close records structured verification evidence", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-close-evidence-"));
  try {
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/close-evidence.md",
      epicId: "epic-close-evidence",
      planReviewPassed: true,
    });
    const { graphPath } = await writeWorkItemGraph(graph, { rootDir: temp });

    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "scripts", "supervibe-loop.mjs"),
      "--close",
      "epic-close-evidence-t1",
      "--file",
      graphPath,
      "--reason",
      "verified",
      "--verification",
      "node --test tests/first.test.mjs",
      "--evidence",
      "targeted test passed",
      "--actor",
      "tester",
    ], { cwd: ROOT });

    assert.match(stdout, /ACTION: closed/);
    const saved = JSON.parse(await readFile(graphPath, "utf8"));
    const first = saved.items.find((item) => item.itemId === "epic-close-evidence-t1");
    const task = saved.tasks.find((item) => item.id === "epic-close-evidence-t1");
    assert.equal(first.verificationEvidence[0].command, "node --test tests/first.test.mjs");
    assert.equal(first.verificationEvidence[0].outputSummary, "targeted test passed");
    assert.equal(task.verificationEvidence[0].status, "pass");
    assert.equal(saved.events.at(-1).verificationEvidence[0].source, "supervibe-loop");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("atomization mirrors scope and requirement traceability into loop tasks", () => {
  const graph = atomizePlanToWorkItems(`# Traceability Plan

## Task T1: Traceable implementation
**Scope IDs:** ASK-AUDIT-001, ASK-AUDIT-002
**Requirement IDs:** REQ-loop-review
**Contract rows touched:** final-review-sweep
**Files:**
- Modify: \`scripts/supervibe-loop.mjs\`
**Acceptance Criteria:**
- Traceability ids are visible to loop workers and reviewers.
\`\`\`bash
node --test tests/supervibe-loop-work-items.test.mjs
\`\`\`
`, {
    planPath: ".supervibe/artifacts/plans/traceability.md",
    epicId: "epic-traceability",
    planReviewPassed: true,
  });

  const task = graph.tasks.find((item) => item.id === "epic-traceability-t1");
  assert.deepEqual(task.scopeIds, ["ASK-AUDIT-001", "ASK-AUDIT-002"]);
  assert.deepEqual(task.requirementIds, ["REQ-loop-review"]);
  assert.deepEqual(task.contractRows, ["final-review-sweep"]);
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

test("loop CLI status prints selected epic task list with statuses and blockers", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-status-tasks-"));
  try {
    const graph = atomizePlanToWorkItems(`Critical path: T1 -> T2\n\n${PLAN}`, {
      planPath: ".supervibe/artifacts/plans/status-tasks.md",
      epicId: "epic-status-tasks",
      planReviewPassed: true,
    });
    const { graphPath } = await writeWorkItemGraph(graph, { rootDir: temp });

    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "scripts", "supervibe-loop.mjs"),
      "--status",
      "--file",
      graphPath,
    ], { cwd: temp });

    assert.match(stdout, /TASKS: 2/);
    assert.match(stdout, /TASK: epic-status-tasks-t1 STATUS: ready .* NEXT: claim/);
    assert.match(stdout, /TASK: epic-status-tasks-t2 STATUS: blocked .* BLOCKED_BY: epic-status-tasks-t1/);
    assert.match(stdout, /NEXT_ACTION: claim epic-status-tasks-t1 or run \/supervibe-loop --claim-ready/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("loop CLI status does not recommend dispatch when ready work overlaps active claim locks", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-status-claim-locks-"));
  try {
    const graphPath = join(temp, "graph.json");
    await writeFile(graphPath, JSON.stringify({
      kind: "supervibe-work-item-graph",
      epicId: "epic-status-locks",
      items: [
        { itemId: "epic-status-locks", type: "epic", status: "open", title: "Claim locks" },
        { itemId: "task-active", type: "task", status: "claimed", title: "Active", parentId: "epic-status-locks", blockedBy: [], blocks: [], writeScope: [{ action: "modify", path: "docs/shared.md" }] },
        { itemId: "task-ready", type: "task", status: "ready", title: "Ready conflict", parentId: "epic-status-locks", blockedBy: [], blocks: [], writeScope: [{ action: "modify", path: "docs/shared.md" }] },
      ],
      tasks: [
        { id: "task-active", status: "claimed", dependencies: [], writeScope: [{ action: "modify", path: "docs/shared.md" }] },
        { id: "task-ready", status: "ready", dependencies: [], writeScope: [{ action: "modify", path: "docs/shared.md" }] },
      ],
      claims: [
        {
          claimId: "claim-active",
          taskId: "task-active",
          agentId: "codex-wave",
          status: "claimed",
          writeSet: ["docs/shared.md"],
        },
      ],
    }, null, 2), "utf8");

    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "scripts", "supervibe-loop.mjs"),
      "--status",
      "--file",
      graphPath,
    ], { cwd: temp });

    assert.match(stdout, /NEXT_ACTION: wait for current claimed wave or complete\/recover active claims before dispatching ready items; blocked ready items: task-ready/);
    assert.doesNotMatch(stdout, /NEXT_ACTION: claim task-ready/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("loop CLI status recommends archive for completed epic", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-status-archive-"));
  try {
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/status-archive.md",
      epicId: "epic-status-archive",
      planReviewPassed: true,
    });
    const evidence = { taskId: "all", command: "node --test", status: "pass", output: "verified" };
    const completed = {
      ...graph,
      items: graph.items.map((item) => ({
        ...item,
        status: "complete",
        verificationEvidence: [{ ...evidence, taskId: item.itemId }],
      })),
      tasks: graph.tasks.map((task) => ({
        ...task,
        status: "complete",
        verificationEvidence: [{ ...evidence, taskId: task.id }],
      })),
      evidence: graph.tasks.map((task) => ({ ...evidence, taskId: task.id })),
    };
    const { graphPath } = await writeWorkItemGraph(completed, { rootDir: temp });

    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "scripts", "supervibe-loop.mjs"),
      "--status",
      "--file",
      graphPath,
    ], { cwd: temp });

    assert.match(stdout, /NEXT_ACTION: finish\/archive completed epic/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("loop CLI archive handles completed work-item graph and clears active registry", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-work-item-archive-"));
  try {
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/archive-work-item.md",
      epicId: "epic-archive-work-item",
      planReviewPassed: true,
    });
    const completed = {
      ...graph,
      status: "closed",
      items: graph.items.map((item) => ({
        ...item,
        status: "complete",
        verificationEvidence: [{ taskId: item.itemId, command: "node --check", status: "pass", output: "verified" }],
      })),
      tasks: graph.tasks.map((task) => ({
        ...task,
        status: "complete",
        verificationEvidence: [{ taskId: task.id, command: "node --check", status: "pass", output: "verified" }],
      })),
    };
    const { graphPath } = await writeWorkItemGraph(completed, { rootDir: temp });

    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "scripts", "supervibe-loop.mjs"),
      "--archive",
      "--file",
      graphPath,
    ], { cwd: temp });

    assert.match(stdout, /SUPERVIBE_WORK_ITEM_ARCHIVE/);
    assert.match(stdout, /GRAPH_ID: epic-archive-work-item/);
    assert.match(stdout, /REGISTRY_ACTIVE: none/);
    await assert.rejects(readFile(graphPath, "utf8"));
    const registry = JSON.parse(await readFile(join(temp, ".supervibe", "memory", "work-items", "index.json"), "utf8"));
    assert.equal(registry.activeEpicId, null);
    assert.equal(registry.activeGraphPath, null);
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
    assert.match(stdout, /NEXT_ACTION: finish\/archive completed epic/);
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

test("loop CLI close-eligible accepts trusted graph-level release receipt as graph-wide evidence", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-batch-close-completion-"));
  try {
    const epicId = "epic-loop-batch-close-completion";
    const graph = completedGraph(epicId);
    graph.evidence = [];
    graph.items = graph.items.map((item) => ({ ...item, verificationEvidence: [] }));
    graph.tasks = graph.tasks.map((task) => ({ ...task, verificationEvidence: [] }));
    const { graphPath } = await writeWorkItemGraph(graph, { rootDir: temp });
    const invocationId = "test-supervibe-orchestrator-release-completion";
    await writeTestAgentInvocation(temp, {
      agentId: "supervibe-orchestrator",
      invocationId,
      taskSummary: "graph-level release completion evidence",
    });

    await issueWorkflowInvocationReceipt({
      rootDir: temp,
      command: "/supervibe-loop",
      subjectType: "agent",
      subjectId: "supervibe-orchestrator",
      agentId: "supervibe-orchestrator",
      stage: "release-completion",
      invocationReason: "graph-level release completion evidence",
      outputArtifacts: [graphPath],
      startedAt: "2026-05-10T00:00:00.000Z",
      completedAt: "2026-05-10T00:01:00.000Z",
      handoffId: "release-completion-proof",
      graphId: epicId,
      hostInvocation: {
        source: "codex-spawn-agent",
        invocationId,
        agentId: "supervibe-orchestrator",
      },
    });

    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "scripts", "supervibe-loop.mjs"),
      "--close-eligible",
      "--non-production",
      "--file",
      graphPath,
    ], { cwd: temp });

    assert.match(stdout, /SUPERVIBE_EPIC_COMPLETION/);
    assert.match(stdout, /PASS: true/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});


test("loop CLI complete adopts a trusted bound worker receipt without reissuing it", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-adopt-bound-receipt-"));
  try {
    const epicId = "epic-loop-adopt-bound-receipt";
    const taskId = epicId + "-t1";
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/adopt-bound-receipt.md",
      epicId,
      planReviewPassed: true,
    });
    const { graphPath } = await writeWorkItemGraph(graph, { rootDir: temp });

    await execFileAsync(process.execPath, [
      join(ROOT, "scripts", "supervibe-loop.mjs"),
      "--claim",
      taskId,
      "--file",
      graphPath,
      "--actor",
      "worker",
    ], { cwd: temp });

    const invocationId = "codex-adopt-bound-worker";
    const outputArtifact = ".supervibe/artifacts/worker-output/adopt-bound.json";
    await writeStableArtifact(temp, outputArtifact, {
      status: "pass",
      taskId,
      summary: "Worker completed the first task outside the active loop.",
    });
    await writeTestAgentInvocation(temp, {
      agentId: "implementation-worker",
      invocationId,
      taskSummary: "completed task outside active loop",
    });
    const { receipt } = await issueWorkflowInvocationReceipt({
      rootDir: temp,
      command: "/supervibe-loop",
      subjectType: "worker",
      subjectId: "implementation-worker",
      agentId: "implementation-worker",
      stage: "work-item-execution",
      invocationReason: "completed task outside active loop",
      outputArtifacts: [outputArtifact],
      startedAt: "2026-05-10T00:00:00.000Z",
      completedAt: "2026-05-10T00:01:00.000Z",
      handoffId: "adopt-bound-receipt",
      graphId: epicId,
      taskId,
      hostInvocation: {
        source: "codex-spawn-agent",
        invocationId,
        agentId: "implementation-worker",
      },
    });
    const beforeReceipts = readWorkflowReceipts(temp).length;

    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "scripts", "supervibe-loop.mjs"),
      "--complete",
      taskId,
      "--file",
      graphPath,
      "--receipt",
      receipt.receiptId,
      "--evidence",
      "trusted worker receipt adopted for completed task",
      "--actor",
      "receipt-adoption",
    ], { cwd: temp });

    assert.match(stdout, /ACTION: complete/);
    assert.match(stdout, new RegExp("RECEIPT_ADOPTED: " + receipt.receiptId));
    assert.match(stdout, /RECEIPT_TRUSTED: true/);
    assert.equal(readWorkflowReceipts(temp).length, beforeReceipts);

    const saved = JSON.parse(await readFile(graphPath, "utf8"));
    const task = saved.items.find((item) => item.itemId === taskId);
    assert.equal(task.status, "complete");
    assert.ok(task.verificationEvidence.some((item) => item.receiptId === receipt.receiptId));
    assert.equal(saved.claims.some((claim) => claim.taskId === taskId && ["active", "claimed", "in_progress"].includes(claim.status)), false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("loop CLI adopt-completed maps trusted outside-loop receipts onto existing work items", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-adopt-completed-"));
  try {
    const epicId = "epic-loop-adopt-completed";
    const taskOne = epicId + "-t1";
    const taskTwo = epicId + "-t2";
    const planPath = ".supervibe/artifacts/plans/adopt-completed.md";
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath,
      epicId,
      planReviewPassed: true,
    });
    const { graphPath } = await writeWorkItemGraph(graph, { rootDir: temp });
    const first = await issueWorkerReceipt(temp, {
      subjectId: "outside-worker-one",
      invocationId: "codex-outside-worker-one",
      outputArtifact: ".supervibe/artifacts/worker-output/outside-one.json",
      taskId: null,
      graphId: null,
      stage: "T1-outside-loop",
      handoffId: "adopt-completed",
      inputEvidence: [planPath],
    });
    const second = await issueWorkerReceipt(temp, {
      subjectId: "outside-worker-two",
      invocationId: "codex-outside-worker-two",
      outputArtifact: ".supervibe/artifacts/worker-output/outside-two.json",
      taskId: null,
      graphId: null,
      stage: "T2-outside-loop",
      handoffId: "adopt-completed",
      inputEvidence: [planPath],
    });
    const beforeReceipts = readWorkflowReceipts(temp).length;

    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "scripts", "supervibe-loop.mjs"),
      "--adopt-completed",
      "--apply",
      "--file",
      graphPath,
      "--map",
      taskOne + "=" + first.receipt.receiptId + "," + taskTwo + "=" + second.receipt.receiptId,
      "--actor",
      "receipt-adoption",
    ], { cwd: temp });

    assert.match(stdout, /SUPERVIBE_WORK_ITEM_RECEIPT_ADOPTION/);
    assert.match(stdout, /APPLIED: true/);
    assert.match(stdout, /ADOPTED: 2/);
    assert.equal(readWorkflowReceipts(temp).length, beforeReceipts);

    const saved = JSON.parse(await readFile(graphPath, "utf8"));
    for (const [taskId, receiptId] of [[taskOne, first.receipt.receiptId], [taskTwo, second.receipt.receiptId]]) {
      const item = saved.items.find((entry) => entry.itemId === taskId);
      assert.equal(item.status, "complete");
      assert.ok(item.verificationEvidence.some((entry) => entry.receiptId === receiptId));
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("loop CLI receipt adoption rejects receipts bound to a different task", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-adopt-wrong-task-"));
  try {
    const epicId = "epic-loop-adopt-wrong-task";
    const taskOne = epicId + "-t1";
    const taskTwo = epicId + "-t2";
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/adopt-wrong-task.md",
      epicId,
      planReviewPassed: true,
    });
    const { graphPath } = await writeWorkItemGraph(graph, { rootDir: temp });
    const { receipt } = await issueWorkerReceipt(temp, {
      subjectId: "wrong-task-worker",
      invocationId: "codex-wrong-task-worker",
      outputArtifact: ".supervibe/artifacts/worker-output/wrong-task.json",
      graphId: epicId,
      taskId: taskTwo,
      stage: "work-item-execution",
      handoffId: "adopt-wrong-task",
    });

    let error;
    try {
      await execFileAsync(process.execPath, [
        join(ROOT, "scripts", "supervibe-loop.mjs"),
        "--complete",
        taskOne,
        "--file",
        graphPath,
        "--receipt",
        receipt.receiptId,
      ], { cwd: temp });
    } catch (err) {
      error = err;
    }

    assert.ok(error);
    assert.match(error.stdout, /SUPERVIBE_RECEIPT_ADOPTION_FAILED/);
    assert.match(error.stdout, new RegExp("receipt taskId " + taskTwo + " does not match " + taskOne));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});


test("loop CLI receipt adoption rejects unrelated unbound receipts by default", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-adopt-unbound-reject-"));
  try {
    const epicId = "epic-loop-adopt-unbound-reject";
    const taskId = epicId + "-t1";
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/adopt-unbound-source.md",
      epicId,
      planReviewPassed: true,
    });
    const { graphPath } = await writeWorkItemGraph(graph, { rootDir: temp });
    const { receipt } = await issueWorkerReceipt(temp, {
      subjectId: "unrelated-unbound-worker",
      invocationId: "codex-unrelated-unbound-worker",
      outputArtifact: ".supervibe/artifacts/worker-output/unrelated-unbound.json",
      graphId: null,
      taskId: null,
      stage: "T1-outside-loop",
      handoffId: "unrelated-unbound",
      inputEvidence: [".supervibe/artifacts/plans/other-source.md"],
    });

    let error;
    try {
      await execFileAsync(process.execPath, [
        join(ROOT, "scripts", "supervibe-loop.mjs"),
        "--complete",
        taskId,
        "--file",
        graphPath,
        "--receipt",
        receipt.receiptId,
      ], { cwd: temp });
    } catch (err) {
      error = err;
    }

    assert.ok(error);
    assert.match(error.stdout, /SUPERVIBE_RECEIPT_ADOPTION_FAILED/);
    assert.match(error.stdout, /unbound receipt does not match graph source plan/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("loop CLI adopt-completed infers same-plan outside-loop receipts from source plan", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-adopt-source-infer-"));
  try {
    const epicId = "epic-loop-adopt-source-infer";
    const planPath = ".supervibe/artifacts/plans/adopt-source-infer.md";
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath,
      epicId,
      planReviewPassed: true,
    });
    const { graphPath } = await writeWorkItemGraph(graph, { rootDir: temp });
    const first = await issueWorkerReceipt(temp, {
      command: "/supervibe-execute-plan",
      subjectId: "source-infer-worker-one",
      invocationId: "codex-source-infer-worker-one",
      outputArtifact: ".supervibe/artifacts/worker-output/source-infer-one.json",
      graphId: null,
      taskId: null,
      stage: "T1-source-infer",
      handoffId: "adopt-source-infer",
      inputEvidence: [planPath],
    });
    const second = await issueWorkerReceipt(temp, {
      command: "/supervibe-execute-plan",
      subjectId: "source-infer-worker-two",
      invocationId: "codex-source-infer-worker-two",
      outputArtifact: ".supervibe/artifacts/worker-output/source-infer-two.json",
      graphId: null,
      taskId: null,
      stage: "T2-source-infer",
      handoffId: "adopt-source-infer",
      inputEvidence: [planPath],
    });

    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "scripts", "supervibe-loop.mjs"),
      "--adopt-completed",
      "--apply",
      "--file",
      graphPath,
      "--from-receipts",
      first.receipt.receiptId + "," + second.receipt.receiptId,
      "--actor",
      "receipt-adoption",
    ], { cwd: temp });

    assert.match(stdout, /ADOPTED: 2/);
    assert.match(stdout, /SOURCE: source-plan-stage-inference/);

    const validation = await execFileAsync(process.execPath, [
      join(ROOT, "scripts", "supervibe-loop.mjs"),
      "--validate-completion",
      "--file",
      graphPath,
      "--require-trusted-evidence",
      "--allow-open-epic",
      "--non-production",
      "--trusted-receipts",
      first.receipt.receiptId + "," + second.receipt.receiptId,
    ], { cwd: temp });
    assert.match(validation.stdout, /PASS: true/);

    const maturity = buildTaskGraphMaturityReport(temp, { requireActiveGraph: true });
    const traceability = maturity.dimensions.find((item) => item.id === "active-traceability");
    const trustedCompletion = maturity.dimensions.find((item) => item.id === "active-trusted-completion");
    assert.equal(traceability.pass, true);
    assert.equal(trustedCompletion.pass, true);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("loop CLI reconcile-receipts alias adopts same-plan receipts", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-reconcile-receipts-"));
  try {
    const epicId = "epic-loop-reconcile-receipts";
    const planPath = ".supervibe/artifacts/plans/reconcile-receipts.md";
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath,
      epicId,
      planReviewPassed: true,
    });
    const { graphPath } = await writeWorkItemGraph(graph, { rootDir: temp });
    const { receipt } = await issueWorkerReceipt(temp, {
      command: "/supervibe-execute-plan",
      subjectId: "reconcile-worker",
      invocationId: "codex-reconcile-worker",
      outputArtifact: ".supervibe/artifacts/worker-output/reconcile.json",
      graphId: null,
      taskId: null,
      stage: "T1-reconcile",
      handoffId: "reconcile-receipts",
      inputEvidence: [planPath],
    });

    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "scripts", "supervibe-loop.mjs"),
      "--reconcile-receipts",
      "--apply",
      "--file",
      graphPath,
      "--from-receipts",
      receipt.receiptId,
    ], { cwd: temp });

    assert.match(stdout, /SUPERVIBE_WORK_ITEM_RECEIPT_ADOPTION/);
    assert.match(stdout, /ADOPTED: 1/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("loop CLI receipt adoption rejects graph-level receipts for task completion", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-adopt-graph-only-reject-"));
  try {
    const epicId = "epic-loop-adopt-graph-only-reject";
    const taskId = epicId + "-t2";
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/adopt-graph-only-reject.md",
      epicId,
      planReviewPassed: true,
    });
    const { graphPath } = await writeWorkItemGraph(graph, { rootDir: temp });
    const { receipt } = await issueWorkerReceipt(temp, {
      subjectId: "graph-only-worker",
      invocationId: "codex-graph-only-worker",
      outputArtifact: ".supervibe/artifacts/worker-output/graph-only.json",
      graphId: epicId,
      taskId: null,
      stage: "release-completion",
      handoffId: "adopt-graph-only-reject",
    });

    let error;
    try {
      await execFileAsync(process.execPath, [
        join(ROOT, "scripts", "supervibe-loop.mjs"),
        "--complete",
        taskId,
        "--file",
        graphPath,
        "--receipt",
        receipt.receiptId,
      ], { cwd: temp });
    } catch (err) {
      error = err;
    }

    assert.ok(error);
    assert.match(error.stdout, /graph-level receipt cannot be adopted as task completion evidence/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("loop CLI receipt adoption rejects validator receipts", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-adopt-validator-reject-"));
  try {
    const epicId = "epic-loop-adopt-validator-reject";
    const taskId = epicId + "-t1";
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/adopt-validator-reject.md",
      epicId,
      planReviewPassed: true,
    });
    const { graphPath } = await writeWorkItemGraph(graph, { rootDir: temp });
    const outputArtifact = ".supervibe/artifacts/validator-output/adopt-validator.json";
    await writeStableArtifact(temp, outputArtifact, { status: "pass", taskId });
    const { receipt } = await issueWorkflowInvocationReceipt({
      rootDir: temp,
      command: "/supervibe-loop",
      subjectType: "validator",
      subjectId: "validator-output",
      stage: "work-item-execution",
      invocationReason: "validator output cannot close implementation task",
      outputArtifacts: [outputArtifact],
      startedAt: "2026-05-10T00:00:00.000Z",
      completedAt: "2026-05-10T00:01:00.000Z",
      handoffId: "adopt-validator-reject",
      graphId: epicId,
      taskId,
    });

    let error;
    try {
      await execFileAsync(process.execPath, [
        join(ROOT, "scripts", "supervibe-loop.mjs"),
        "--complete",
        taskId,
        "--file",
        graphPath,
        "--receipt",
        receipt.receiptId,
      ], { cwd: temp });
    } catch (err) {
      error = err;
    }

    assert.ok(error);
    assert.match(error.stdout, /receipt subject type is not adoptable: validator/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

async function issueWorkerReceipt(root, {
  command = "/supervibe-loop",
  subjectId,
  invocationId,
  outputArtifact,
  graphId = null,
  taskId = null,
  stage = "work-item-execution",
  handoffId = "worker-receipt",
  inputEvidence = [],
} = {}) {
  await writeStableArtifact(root, outputArtifact, {
    status: "pass",
    subjectId,
    taskId,
    summary: "Worker output eligible for receipt adoption.",
  });
  await writeTestAgentInvocation(root, {
    agentId: subjectId,
    invocationId,
    taskSummary: "worker output eligible for receipt adoption",
  });
  return issueWorkflowInvocationReceipt({
    rootDir: root,
    command,
    subjectType: "worker",
    subjectId,
    agentId: subjectId,
    stage,
    invocationReason: "worker output eligible for receipt adoption",
    inputEvidence,
    outputArtifacts: [outputArtifact],
    startedAt: "2026-05-10T00:00:00.000Z",
    completedAt: "2026-05-10T00:01:00.000Z",
    handoffId,
    graphId,
    taskId,
    hostInvocation: {
      source: "codex-spawn-agent",
      invocationId,
      agentId: subjectId,
    },
  });
}

async function writeStableArtifact(root, relativePath, value) {
  const absPath = join(root, ...String(relativePath).split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function writeTestAgentInvocation(root, { agentId, invocationId, taskSummary }) {
  const outputJson = `.supervibe/artifacts/_agent-outputs/${invocationId}/agent-output.json`;
  await mkdir(join(root, ".supervibe", "memory"), { recursive: true });
  await mkdir(dirname(join(root, ...outputJson.split("/"))), { recursive: true });
  await writeFile(join(root, ...outputJson.split("/")), `${JSON.stringify({
    schemaVersion: 1,
    invocationId,
    agentId,
    taskSummary,
  }, null, 2)}\n`, "utf8");
  await appendFile(join(root, ".supervibe", "memory", "agent-invocations.jsonl"), `${JSON.stringify({
    schemaVersion: 1,
    ts: "2026-05-10T00:00:00.000Z",
    invocation_id: invocationId,
    agent_id: agentId,
    task_summary: taskSummary,
    confidence_score: 10,
    structured_output: { json: outputJson },
  })}\n`, "utf8");
}

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
