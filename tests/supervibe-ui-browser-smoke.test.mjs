import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { CodeStore } from "../scripts/lib/code-store.mjs";
import { MemoryStore } from "../scripts/lib/memory-store.mjs";
import { createSupervibeUiServer } from "../scripts/lib/supervibe-ui-server.mjs";

test("UI browser smoke surfaces load nonblank data without leaking private screenshots", async () => {
  const root = await makeTempRoot("supervibe-ui-browser-smoke-");
  const graphRel = ".supervibe/memory/work-items/epic-smoke/graph.json";
  const stateRel = ".supervibe/memory/loops/run-smoke/state.json";
  const failures = [];

  await writeJson(join(root, graphRel), smokeGraph());
  await writeJson(join(root, stateRel), smokeRunState());
  await writeIndexes(root);

  const { server } = createSupervibeUiServer({ rootDir: root, graphPath: graphRel });
  await listen(server);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const html = await fetchText(`${baseUrl}/`, failures, "root-html");
    const graph = await fetchJson(`${baseUrl}/api/graph?file=${encodeURIComponent(graphRel)}`, failures, "graph-api");
    const run = await fetchJson(`${baseUrl}/api/run?file=${encodeURIComponent(stateRel)}`, failures, "run-api");
    const index = await fetchJson(`${baseUrl}/api/index-status`, failures, "index-api");

    record(failures, "overview opens", () => {
      assertTab(html, "overview", "Overview");
      assertNonblank([index?.overall?.status, graph?.title, graph?.flow?.activeId], "overview model");
      assert.ok((graph?.items || []).length > 0, "overview work summary has work items");
    });

    record(failures, "loop run opens", () => {
      assertTab(html, "run", "Loop run");
      assert.equal(run?.runId, "run-smoke");
      assert.equal(run?.status, "IN_PROGRESS");
      assert.ok((run?.tasks || []).length > 0, "loop run includes tasks");
      assertNonblank([run?.flow?.activeId, run?.waves?.status], "loop run model");
    });

    record(failures, "work items opens", () => {
      assertTab(html, "items", "Work items");
      assert.ok((graph?.epicGroups?.epics || []).length > 0, "work items include epic groups");
      assert.ok(Object.keys(graph?.itemDetails || {}).length > 0, "work items include drawer details");
    });

    record(failures, "kanban opens", () => {
      assertTab(html, "kanban", "Kanban");
      assert.ok((graph?.kanban?.columns || []).length > 0, "kanban columns are present");
      assert.ok(flattenKanbanCards(graph).length > 0, "kanban has cards");
      assert.ok(findKanbanCard(graph, "completed-setup"), "done dependency card is visible");
    });

    record(failures, "RAG opens", () => {
      assertTab(html, "rag", "RAG");
      assertIndexPanel(index?.codeRag, "Code RAG");
    });

    record(failures, "Memory opens", () => {
      assertTab(html, "memory", "Memory");
      assertIndexPanel(index?.memory, "Memory");
    });

    record(failures, "CodeGraph opens", () => {
      assertTab(html, "codegraph", "CodeGraph");
      assertIndexPanel(index?.codeGraph, "CodeGraph");
    });

    record(failures, "done dependency cards do not show active blocker text", () => {
      const doneDependency = findKanbanCard(graph, "completed-setup");
      const detail = graph?.itemDetails?.["completed-setup"];
      assert.equal(doneDependency?.column, "done");
      assert.equal(doneDependency?.status, "done");
      assert.deepEqual(detail?.blockers || [], []);
      assert.equal((graph?.panels?.blockers || []).some((item) => item.id === "completed-setup"), false);
      assert.doesNotMatch(JSON.stringify(doneDependency), /\b(blocked|blocker|missing dependency|why blocked)\b/i);
      assert.equal(findKanbanCard(graph, "ready-after-completed-dependency")?.column, "ready");
    });

    assert.deepEqual(failures, [], `UI browser smoke failures:\n${JSON.stringify(failures, null, 2)}`);
  } finally {
    await close(server);
    await rm(root, { recursive: true, force: true });
  }
});

function assertTab(html, tabId, label) {
  assert.match(html, new RegExp(`data-tab="${escapeRegExp(tabId)}"[^>]*>${escapeRegExp(label)}<`));
  assert.match(html, new RegExp(`id="tab-${escapeRegExp(tabId)}"`));
}

function assertIndexPanel(panel, label) {
  assert.equal(panel?.label, label);
  assert.ok(["ready", "empty", "partial", "not_initialized", "unavailable"].includes(panel?.status), `${label} has a known status`);
  assertNonblank([panel?.message, panel?.nextAction, panel?.map?.label], `${label} panel`);
  assert.ok((panel?.map?.nodes || []).length > 0, `${label} relationship map has nodes`);
}

function assertNonblank(values, label) {
  for (const value of values) {
    assert.notEqual(String(value ?? "").trim(), "", `${label} contains nonblank content`);
  }
}

function flattenKanbanCards(graph) {
  return (graph?.kanban?.columns || []).flatMap((column) => column.items || []);
}

function findKanbanCard(graph, id) {
  return flattenKanbanCards(graph).find((card) => card.id === id) || null;
}

async function fetchText(url, failures, surface) {
  try {
    const response = await fetch(url);
    const body = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
    assert.notEqual(body.trim(), "", `${surface} response is nonblank`);
    return body;
  } catch (error) {
    failures.push({ surface, error: error.message });
    return "";
  }
}

async function fetchJson(url, failures, surface) {
  try {
    const response = await fetch(url);
    const body = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
    assert.notEqual(body.trim(), "", `${surface} response is nonblank`);
    return JSON.parse(body);
  } catch (error) {
    failures.push({ surface, error: error.message });
    return {};
  }
}

function record(failures, surface, fn) {
  try {
    fn();
  } catch (error) {
    failures.push({ surface, error: error.message });
  }
}

function smokeGraph() {
  return {
    kind: "supervibe-work-item-graph",
    graph_id: "epic-smoke",
    title: "UI Browser Smoke",
    items: [
      { itemId: "epic-smoke", type: "epic", status: "open", title: "UI Browser Smoke" },
      {
        itemId: "completed-setup",
        type: "task",
        parentId: "epic-smoke",
        status: "complete",
        title: "Completed setup",
        verificationEvidence: [{ taskId: "completed-setup", command: "node --test setup.test.mjs", status: "pass", output: "ok" }],
      },
      {
        itemId: "ready-after-completed-dependency",
        type: "task",
        parentId: "epic-smoke",
        status: "open",
        title: "Ready after completed dependency",
      },
      {
        itemId: "active-missing-dependency",
        type: "task",
        parentId: "epic-smoke",
        status: "open",
        title: "Active missing dependency",
      },
    ],
    tasks: [
      {
        id: "completed-setup",
        parentId: "epic-smoke",
        status: "complete",
        title: "Completed setup",
        verificationEvidence: [{ taskId: "completed-setup", command: "node --test setup.test.mjs", status: "pass", output: "ok" }],
      },
      {
        id: "ready-after-completed-dependency",
        parentId: "epic-smoke",
        status: "open",
        title: "Ready after completed dependency",
        dependencies: ["completed-setup"],
      },
      {
        id: "active-missing-dependency",
        parentId: "epic-smoke",
        status: "open",
        title: "Active missing dependency",
        dependencies: ["missing-work"],
      },
    ],
    claims: [],
    gates: [],
    evidence: [{ taskId: "completed-setup", command: "node --test setup.test.mjs", status: "pass", output: "ok" }],
  };
}

function smokeRunState() {
  return {
    schema_version: 1,
    run_id: "run-smoke",
    status: "IN_PROGRESS",
    next_action: "dispatch",
    active_task: "ready-after-completed-dependency",
    tasks: [
      { id: "completed-setup", status: "complete", title: "Completed setup" },
      { id: "ready-after-completed-dependency", status: "open", title: "Ready after completed dependency" },
    ],
    gates: [],
    evidence: [{ taskId: "completed-setup", command: "node --test setup.test.mjs", status: "pass", output: "ok" }],
  };
}

async function writeIndexes(root) {
  const sourcePath = join(root, "src", "smoke.js");
  await mkdir(dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, [
    "export function smokeTitle(value) {",
    "  return normalize(value);",
    "}",
    "function normalize(value) {",
    "  return String(value || 'smoke').trim();",
    "}",
  ].join("\n"), "utf8");

  const codeStore = new CodeStore(root, { useEmbeddings: false });
  await codeStore.init();
  await codeStore.indexFile(sourcePath);
  codeStore.resolveAllEdges();
  codeStore.close();

  const memoryPath = join(root, ".supervibe", "memory", "decisions", "ui-browser-smoke.md");
  await mkdir(dirname(memoryPath), { recursive: true });
  await writeFile(memoryPath, [
    "---",
    "id: ui-browser-smoke",
    "type: decision",
    "date: 2026-05-13",
    "tags: [ui, smoke]",
    "agent: worker-ui-browser-smoke",
    "confidence: 9",
    "---",
    "UI smoke checks verify Overview, Loop run, Work items, Kanban, RAG, Memory, and CodeGraph without screenshots.",
  ].join("\n"), "utf8");

  const memoryStore = new MemoryStore(root, { useEmbeddings: false });
  await memoryStore.init();
  await memoryStore.rebuildIndex();
  memoryStore.close();
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
