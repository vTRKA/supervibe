import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createKanbanModel,
  createSupervibeUiServer,
  createWorkflowFlowModel,
  renderSupervibeUiHtml,
} from "../scripts/lib/supervibe-ui-server.mjs";
import { CodeStore } from "../scripts/lib/code-store.mjs";
import { MemoryStore } from "../scripts/lib/memory-store.mjs";
import { mutateWorkItemGraph } from "../scripts/lib/supervibe-work-item-actions.mjs";

test("UI server renders local control plane and keeps actions preview-first", async () => {
  const root = await makeTempRoot("supervibe-ui-");
  const graphRel = ".claude/memory/work-items/epic-ui/graph.json";
  const stateRel = ".claude/memory/loops/run-ui/state.json";
  const graphPath = join(root, graphRel);
  const statePath = join(root, stateRel);
  await writeGraph(graphPath);
  await writeState(statePath);
  await writeIndexes(root);
  const { server } = createSupervibeUiServer({ rootDir: root, graphPath: graphRel });
  await listen(server);
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const html = await (await fetch(`${baseUrl}/`)).text();
    assert.match(html, /Supervibe Control Plane/);
    assert.match(html, /CodeGraph/);
    assert.match(html, /Kanban/);
    assert.match(html, /kanban-board/);
    assert.match(html, /flow-step/);
    assert.match(html, /overflow-wrap:anywhere/);
    assert.match(html, /selectMapNode/);
    assert.match(html, /map-wrap/);
    assert.match(html, /Auth: local only/);
    assert.doesNotMatch(html, /x-supervibe-ui-token|\?token=|TOKEN:/);
    assert.match(renderSupervibeUiHtml({ graphPath: graphRel }), /api\/action/);

    const indexStatus = await (await fetch(`${baseUrl}/api/index-status`)).json();
    assert.equal(indexStatus.overall.total, 3);
    assert.ok(indexStatus.codeRag);
    assert.ok(indexStatus.memory);
    assert.ok(indexStatus.codeGraph);
    assert.ok(indexStatus.codeRag.map.nodes.length >= 2);
    assert.ok(indexStatus.codeRag.map.edges.length >= 1);
    assert.ok(indexStatus.memory.map.nodes.some((node) => node.type === "entry"));
    assert.ok(indexStatus.codeGraph.map.nodes.some((node) => node.type === "symbol"));

    const graph = await (await fetch(`${baseUrl}/api/graph?file=${encodeURIComponent(graphRel)}`)).json();
    assert.equal(graph.graphId, "epic-ui");
    assert.equal(graph.grouped.ready.length, 1);
    assert.equal(graph.kanban.project.graphId, "epic-ui");
    assert.equal(graph.kanban.epics[0].id, "epic-ui");
    assert.equal(graph.flow.activeId, "execute");
    assert.equal(graph.flow.steps.find((step) => step.id === "atomize").state, "complete");
    assert.equal(graph.flow.steps.find((step) => step.id === "execute").hint, "no run loaded; ready 1, claimed 0, blocked 0");
    assert.doesNotMatch(JSON.stringify(graph.flow), /undefined/);
    assert.equal(graph.kanban.columns.some((column) => column.id === "ready" && column.items.some((item) => item.id === "design-kanban-cards" && item.title === "Design Kanban cards for agent work" && item.epicId === "epic-ui")), true);
    assert.equal(mutateWorkItemGraph(JSON.parse(await readFile(graphPath, "utf8")), {
      itemId: "design-kanban-cards",
      type: "claim",
      actor: "test",
      now: "2026-04-30T00:00:00.000Z",
    }).action, "claim");

    const run = await (await fetch(`${baseUrl}/api/run?file=${encodeURIComponent(stateRel)}`)).json();
    assert.equal(run.runId, "run-ui");
    assert.equal(run.waves.status, "ready");
    assert.equal(run.flow.activeId, "execute");
    assert.equal(run.reports.length, 1);

    const report = await (await fetch(`${baseUrl}/api/report?file=${encodeURIComponent(graphRel)}&type=sla`)).json();
    assert.match(report.markdown, /Supervibe Sla Report/);

    const rejected = await (await fetch(`${baseUrl}/api/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file: graphRel, itemId: "design-kanban-cards", type: "close", apply: true }),
    })).json();
    assert.match(rejected.error, /confirm=apply-local/);

    const preview = await (await fetch(`${baseUrl}/api/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file: graphRel, itemId: "design-kanban-cards", type: "close", apply: false }),
    })).json();
    assert.equal(preview.dryRun, true);
    assert.equal(JSON.parse(await readFile(graphPath, "utf8")).items[1].status, "open");

    const applied = await (await fetch(`${baseUrl}/api/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file: graphRel, itemId: "design-kanban-cards", type: "close", apply: true, confirm: "apply-local" }),
    })).json();
    assert.equal(applied.dryRun, false);
    assert.equal(JSON.parse(await readFile(graphPath, "utf8")).items[1].status, "closed");
  } finally {
    await close(server);
    await rm(root, { recursive: true, force: true });
  }
});

async function writeGraph(graphPath) {
  await mkdir(join(graphPath, ".."), { recursive: true });
  const graph = {
    kind: "supervibe-work-item-graph",
    graph_id: "epic-ui",
    title: "UI Epic",
    items: [
      { itemId: "epic-ui", type: "epic", status: "open", title: "UI Epic" },
      { itemId: "design-kanban-cards", type: "task", status: "open", title: "Design Kanban cards for agent work" },
    ],
    tasks: [{ id: "design-kanban-cards", status: "open" }],
  };
  await writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
}

test("kanban model keeps tasks tied to epics and agents", () => {
  const longTaskTitle = "Audit router failover behavior with an extremely long unbroken diagnostic identifier SUPERLONGNETWORKROUTERFAILOVERDIAGNOSTICIDENTIFIERWITHOUTSPACES";
  const model = createKanbanModel({
    graph: { graph_id: "epic-ui", title: "UI Epic With Long Visibility Requirements", epicId: "epic-ui" },
    index: [
      { itemId: "epic-ui", type: "epic", title: "UI Epic With Long Visibility Requirements", effectiveStatus: "summary" },
      { itemId: "design-kanban-cards", type: "task", title: longTaskTitle, epicId: "epic-ui", effectiveStatus: "claimed", owner: "agent-1", priority: "high" },
      { itemId: "resolve-dependency-labels", type: "task", title: "Resolve dependency labels", epicId: "epic-ui", effectiveStatus: "blocked", task: { dependencies: ["design-kanban-cards"] } },
    ],
  });

  assert.equal(model.project.totalTasks, 2);
  assert.equal(model.epics[0].title, "UI Epic With Long Visibility Requirements");
  assert.deepEqual(model.agents[0], { agent: "agent-1", count: 1 });
  assert.equal(model.columns.find((column) => column.id === "claimed").items[0].epicId, "epic-ui");
  assert.equal(model.columns.find((column) => column.id === "claimed").items[0].title, longTaskTitle);
  assert.deepEqual(model.columns.find((column) => column.id === "blocked").items[0].blockedBy, ["design-kanban-cards"]);
  assert.deepEqual(model.columns.find((column) => column.id === "blocked").items[0].blockedByLabels, [longTaskTitle]);
});

test("workflow flow model derives real phase state from graph, run, gates, and archive markers", () => {
  assert.equal(createWorkflowFlowModel().activeId, "plan");

  const emptyGraph = createWorkflowFlowModel({
    graph: { graph_id: "epic-empty", title: "Empty Epic", items: [] },
  });
  assert.equal(emptyGraph.activeId, "atomize");
  assert.equal(emptyGraph.steps.find((step) => step.id === "plan").state, "complete");

  const executing = createWorkflowFlowModel({
    graph: {
      graph_id: "epic-run",
      items: [
        { itemId: "epic-run", type: "epic", status: "open" },
        { itemId: "build-ui", type: "task", status: "open", title: "Build UI" },
      ],
      tasks: [{ id: "build-ui", status: "open" }],
    },
  });
  assert.equal(executing.activeId, "execute");
  assert.equal(executing.steps.find((step) => step.id === "execute").state, "current");

  const blocked = createWorkflowFlowModel({
    graph: {
      graph_id: "epic-blocked",
      items: [
        { itemId: "epic-blocked", type: "epic", status: "open" },
        { itemId: "blocked-task", type: "task", status: "blocked", title: "Blocked Task" },
      ],
      tasks: [{ id: "blocked-task", status: "blocked" }],
    },
  });
  assert.equal(blocked.activeId, "execute");
  assert.equal(blocked.status, "blocked");

  const runOnly = createWorkflowFlowModel({
    run: {
      status: "IN_PROGRESS",
      active_task: "build-ui",
      tasks: [{ id: "build-ui", status: "open", goal: "Build UI" }],
    },
  });
  assert.equal(runOnly.activeId, "execute");
  assert.equal(runOnly.metrics.claimed, 1);
  assert.equal(runOnly.steps.find((step) => step.id === "execute").state, "current");

  const verifying = createWorkflowFlowModel({
    run: {
      status: "COMPLETE",
      tasks: [{ id: "build-ui", status: "complete" }],
      gates: [{ gateId: "review-ui", taskId: "build-ui", status: "open" }],
    },
    index: [
      { itemId: "build-ui", type: "task", effectiveStatus: "done" },
    ],
  });
  assert.equal(verifying.activeId, "verify");
  assert.equal(verifying.metrics.openGates, 1);

  const closing = createWorkflowFlowModel({
    run: { status: "COMPLETE", tasks: [{ id: "build-ui", status: "complete" }], gates: [] },
    index: [{ itemId: "build-ui", type: "task", effectiveStatus: "done" }],
  });
  assert.equal(closing.activeId, "close");

  const archived = createWorkflowFlowModel({
    graph: { graph_id: "epic-archived", archivedAt: "2026-04-30T00:00:00.000Z" },
    index: [{ itemId: "build-ui", type: "task", effectiveStatus: "done" }],
  });
  assert.equal(archived.activeId, "archive");
  assert.equal(archived.steps.find((step) => step.id === "close").state, "complete");
});

async function writeState(statePath) {
  await mkdir(join(statePath, ".."), { recursive: true });
  const state = {
    schema_version: 1,
    run_id: "run-ui",
    status: "IN_PROGRESS",
    next_action: "dispatch",
    tasks: [
      { id: "design-kanban-cards", status: "open", title: "Design Kanban cards for agent work", verificationCommands: ["npm test"], writeScope: [{ path: "src/ui.ts" }] },
    ],
    gates: [{ gateId: "verify-kanban-workflow", taskId: "design-kanban-cards", status: "open" }],
  };
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function writeIndexes(root) {
  const sourcePath = join(root, "src", "ui.js");
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(sourcePath, [
    "export function formatTitle(value) {",
    "  return helper(value).trim();",
    "}",
    "function helper(value) {",
    "  return String(value || 'Untitled');",
    "}",
  ].join("\n"), "utf8");
  const codeStore = new CodeStore(root, { useEmbeddings: false });
  await codeStore.init();
  await codeStore.indexFile(sourcePath);
  codeStore.resolveAllEdges();
  codeStore.close();

  const memoryDir = join(root, ".claude", "memory", "decisions");
  await mkdir(memoryDir, { recursive: true });
  await writeFile(join(memoryDir, "ui-map.md"), [
    "---",
    "id: ui-map",
    "type: decision",
    "date: 2026-04-30",
    "tags: [ui, graph]",
    "agent: test",
    "confidence: 9",
    "---",
    "Render RAG and CodeGraph as visible relationship maps.",
  ].join("\n"), "utf8");
  const memoryStore = new MemoryStore(root, { useEmbeddings: false });
  await memoryStore.init();
  await memoryStore.rebuildIndex();
  memoryStore.close();
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

async function makeTempRoot(prefix) {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(join(tmpdir(), prefix));
}
