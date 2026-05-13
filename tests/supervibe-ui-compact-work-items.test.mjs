import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  createKanbanModel,
  createPreLoopSummaryModel,
  createSupervibeUiServer,
  groupWorkItemsByEpic,
} from "../scripts/lib/supervibe-ui-server.mjs";
import { createWorkItemIndex } from "../scripts/lib/supervibe-work-item-query.mjs";

const execFileAsync = promisify(execFile);
const ROOT = resolve(".");

test("work item grouping uses epic relationships and exposes orphan bucket", () => {
  const graph = compactGraph();
  const index = createWorkItemIndex({ graph, claims: graph.claims, gates: graph.gates, evidence: graph.evidence });
  const groups = groupWorkItemsByEpic({ graph, index });

  assert.equal(groups.epics.length, 2);
  assert.deepEqual(groups.epics.find((epic) => epic.id === "epic-a").items.map((item) => item.id), ["task-a1", "task-a2"]);
  assert.deepEqual(groups.epics.find((epic) => epic.id === "epic-b").items.map((item) => item.id), ["task-b1"]);
  assert.deepEqual(groups.orphans.items.map((item) => item.id), ["task-orphan"]);
});

test("kanban cards are compact and keep diagnostics out of default payload", () => {
  const graph = compactGraph();
  const index = createWorkItemIndex({ graph, claims: graph.claims, gates: graph.gates, evidence: graph.evidence });
  const card = createKanbanModel({ graph, index }).columns.flatMap((column) => column.items).find((item) => item.id === "task-a2");

  assert.equal(card.title, "Blocked child");
  assert.equal(card.type, "task");
  assert.equal(card.status, "blocked");
  assert.equal(card.shortId, "A2");
  assert.equal(card.dependencyCount, 1);
  assert.equal("blockedByLabels" in card, false);
  assert.equal("verificationCount" in card, false);
  assert.equal("writeScopeCount" in card, false);
});

test("graph API returns compact items with drawer detail data", async () => {
  const root = await makeTempRoot("supervibe-ui-compact-");
  const graphRel = ".supervibe/memory/work-items/epic-a/graph.json";
  await writeJson(join(root, graphRel), compactGraph());
  const { server } = createSupervibeUiServer({ rootDir: root });
  await listen(server);
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/graph?file=${encodeURIComponent(graphRel)}`);
    const data = await response.json();
    const compact = data.items.find((item) => item.id === "task-a1");
    const detail = data.itemDetails["task-a1"];

    assert.deepEqual(Object.keys(compact).sort(), ["id", "shortId", "status", "title", "type"]);
    assert.deepEqual(detail.files, ["scripts/a.mjs"]);
    assert.equal(detail.checks[0].command, "node --test a.test.mjs");
    assert.deepEqual(detail.receipts, [{ receiptId: "receipt-a1" }]);
    assert.equal(detail.owner, "worker-a");
    assert.equal(data.preLoopSummary.startsExecution, false);
  } finally {
    await close(server);
    await rm(root, { recursive: true, force: true });
  }
});

test("resolved dependencies are hidden from active blockers but kept in detail history", async () => {
  const root = await makeTempRoot("supervibe-ui-resolved-blockers-");
  const graphRel = ".supervibe/memory/work-items/epic-a/graph.json";
  const graph = compactGraph();
  graph.items.find((item) => item.itemId === "task-a1").status = "complete";
  graph.tasks.find((item) => item.id === "task-a1").status = "complete";
  await writeJson(join(root, graphRel), graph);
  const { server } = createSupervibeUiServer({ rootDir: root });
  await listen(server);
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/graph?file=${encodeURIComponent(graphRel)}`);
    const data = await response.json();
    const card = data.kanban.columns.flatMap((column) => column.items).find((item) => item.id === "task-a2");
    const detail = data.itemDetails["task-a2"];

    assert.equal(card.dependencyCount, 0);
    assert.equal(card.resolvedDependencyCount, 1);
    assert.deepEqual(detail.blockers, []);
    assert.deepEqual(detail.resolvedBlockers.map((item) => item.id), ["task-a1"]);
    assert.equal(detail.resolvedBlockers[0].status, "done");
  } finally {
    await close(server);
    await rm(root, { recursive: true, force: true });
  }
});

test("pre-loop summary reports epics and task status counts without execution", async () => {
  const graph = compactGraph();
  const index = createWorkItemIndex({ graph, claims: graph.claims, gates: graph.gates, evidence: graph.evidence });
  const summary = createPreLoopSummaryModel({ graph, index });

  assert.equal(summary.startsExecution, false);
  assert.equal(summary.epicCount, 2);
  assert.equal(summary.taskCount, 4);
  assert.deepEqual(summary.epics.find((epic) => epic.id === "epic-a").counts, { ready: 1, blocked: 1, done: 0, stale: 0 });
  assert.deepEqual(summary.epics.find((epic) => epic.id === "epic-b").counts, { ready: 0, blocked: 0, done: 1, stale: 0 });
  assert.equal(summary.orphanBucket.taskCount, 1);
});

test("loop CLI pre-loop summary prints no-execution counts", async () => {
  const root = await makeTempRoot("supervibe-loop-pre-summary-");
  const graphRel = ".supervibe/memory/work-items/epic-a/graph.json";
  await writeJson(join(root, graphRel), compactGraph());
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "scripts", "supervibe-loop.mjs"),
      "--pre-loop-summary",
      "--file",
      graphRel,
    ], { cwd: root });

    assert.match(stdout, /SUPERVIBE_PRE_LOOP_SUMMARY/);
    assert.match(stdout, /STARTS_EXECUTION: false/);
    assert.match(stdout, /EPIC: epic-a TASKS: 2 READY: 1 BLOCKED: 1 DONE: 0 STALE: 0/);
    assert.match(stdout, /ORPHANS: 1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function compactGraph() {
  return {
    kind: "supervibe-work-item-graph",
    graph_id: "graph-compact",
    epicId: "epic-a",
    title: "Compact graph",
    items: [
      { itemId: "epic-a", type: "epic", status: "open", title: "Epic A" },
      { itemId: "epic-b", type: "epic", status: "open", title: "Epic B" },
      {
        itemId: "task-a1",
        type: "task",
        parentId: "epic-a",
        status: "open",
        title: "Ready child",
        owner: "worker-a",
        writeScope: [{ path: "scripts/a.mjs" }],
        verificationCommands: ["node --test a.test.mjs"],
        receipts: ["receipt-a1"],
      },
      { itemId: "task-a2", type: "task", parentId: "epic-a", status: "blocked", title: "Blocked child", blockedBy: ["task-a1"] },
      { itemId: "task-b1", type: "task", parentId: "epic-b", status: "complete", title: "Done child" },
      { itemId: "task-orphan", type: "task", parentId: "missing-epic", status: "open", title: "Orphan child" },
    ],
    tasks: [
      { id: "task-a1", parentId: "epic-a", status: "open", title: "Ready child", owner: "worker-a" },
      { id: "task-a2", parentId: "epic-a", status: "blocked", title: "Blocked child", dependencies: ["task-a1"] },
      { id: "task-b1", parentId: "epic-b", status: "complete", title: "Done child" },
      { id: "task-orphan", parentId: "missing-epic", status: "open", title: "Orphan child" },
    ],
    claims: [],
    gates: [],
    evidence: [{ taskId: "task-a1", command: "node --test a.test.mjs", status: "pass", receiptId: "receipt-a1" }],
  };
}

async function writeJson(file, data) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function listen(server) {
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
}

async function close(server) {
  await new Promise((resolveClose, reject) => server.close((err) => (err ? reject(err) : resolveClose())));
}

async function makeTempRoot(prefix) {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(join(tmpdir(), prefix));
}
