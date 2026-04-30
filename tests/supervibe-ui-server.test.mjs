import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createSupervibeUiServer,
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
    assert.equal(mutateWorkItemGraph(JSON.parse(await readFile(graphPath, "utf8")), {
      itemId: "T1",
      type: "claim",
      actor: "test",
      now: "2026-04-30T00:00:00.000Z",
    }).action, "claim");

    const run = await (await fetch(`${baseUrl}/api/run?file=${encodeURIComponent(stateRel)}`)).json();
    assert.equal(run.runId, "run-ui");
    assert.equal(run.waves.status, "ready");
    assert.equal(run.reports.length, 1);

    const report = await (await fetch(`${baseUrl}/api/report?file=${encodeURIComponent(graphRel)}&type=sla`)).json();
    assert.match(report.markdown, /Supervibe Sla Report/);

    const rejected = await (await fetch(`${baseUrl}/api/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file: graphRel, itemId: "T1", type: "close", apply: true }),
    })).json();
    assert.match(rejected.error, /confirm=apply-local/);

    const preview = await (await fetch(`${baseUrl}/api/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file: graphRel, itemId: "T1", type: "close", apply: false }),
    })).json();
    assert.equal(preview.dryRun, true);
    assert.equal(JSON.parse(await readFile(graphPath, "utf8")).items[1].status, "open");

    const applied = await (await fetch(`${baseUrl}/api/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file: graphRel, itemId: "T1", type: "close", apply: true, confirm: "apply-local" }),
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
      { itemId: "T1", type: "task", status: "open", title: "Visible task" },
    ],
    tasks: [{ id: "T1", status: "open" }],
  };
  await writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
}

async function writeState(statePath) {
  await mkdir(join(statePath, ".."), { recursive: true });
  const state = {
    schema_version: 1,
    run_id: "run-ui",
    status: "IN_PROGRESS",
    next_action: "dispatch",
    tasks: [
      { id: "T1", status: "open", title: "Ready loop task", verificationCommands: ["npm test"], writeScope: [{ path: "src/ui.ts" }] },
    ],
    gates: [{ gateId: "G1", taskId: "T1", status: "open" }],
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
