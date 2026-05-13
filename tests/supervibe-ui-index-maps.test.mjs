import assert from "node:assert/strict";
import { mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  buildUiApiProjectionContract,
  buildIndexStatus,
  createSupervibeUiServer,
  renderSupervibeUiHtml,
  UI_API_PROJECTION_VERSION,
  UI_API_SCHEMA_VERSION,
} from "../scripts/lib/supervibe-ui-server.mjs";
import { CodeStore } from "../scripts/lib/code-store.mjs";
import { MemoryStore } from "../scripts/lib/memory-store.mjs";

const UI_API_CONTRACT_FIXTURE = new URL("./fixtures/ui/api-projection-contract.json", import.meta.url);

test("Memory and RAG tabs prioritize actionable health over sparse maps", async () => {
  const root = await makeTempRoot("supervibe-ui-index-health-");
  try {
    await writeIndexes(root);
    await writeRetrievalEval(root, { pass: false, summary: { averageScore: 4.2, averageRecall: 0.3, averagePrecision: 0.5 } });

    const html = renderSupervibeUiHtml();
    assert.match(html, /Actionable RAG health/);
    assert.match(html, /Actionable memory health/);
    assert.match(html, /Secondary relationship mini-map/);
    assert.match(html, /Sparse mini-map is not the primary signal/);
    assert.match(html, /Many chunks can still be low usefulness if retrieval eval fails/);
    assert.ok(html.indexOf("Actionable RAG health") < html.indexOf("Sparse mini-map is not the primary signal"));

    const status = await buildIndexStatus({ rootDir: root });

    assert.equal(status.memory.health.relationshipMapRole, "secondary");
    assert.equal(status.memory.health.coverage.entries, 2);
    assert.equal(status.memory.health.coverage.tags, 4);
    assert.equal(status.memory.health.gaps.some((gap) => gap.code === "thin-memory" && /insufficient for large plugin context/.test(gap.message)), true);
    assert.deepEqual(status.memory.health.topDecisions.map((row) => row.id), ["architecture-health"]);
    assert.equal(status.memory.health.repairActions.some((action) => /build-memory-index/.test(action.command)), true);
    assert.equal(status.memory.health.repairActions.some((action) => /add-memory/.test(action.command)), true);

    assert.equal(status.codeRag.health.relationshipMapRole, "secondary");
    assert.equal(status.codeRag.health.chunkCoverage.files, 1);
    assert.ok(status.codeRag.health.chunkCoverage.chunks >= 1);
    assert.equal(status.codeRag.health.evalScore.score, 4.2);
    assert.equal(status.codeRag.health.evalScore.status, "fail");
    assert.equal(status.codeRag.health.topGaps.some((gap) => gap.code === "failing-eval" && /many chunks can still be low usefulness/i.test(gap.message)), true);
    assert.match(status.codeRag.health.repairCommand, /build-code-index/);
    assertSharedIndexMap(status, "degraded");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("knowledge tabs share health-first index-map schema across empty normal stale and degraded states", async () => {
  const emptyRoot = await makeTempRoot("supervibe-ui-index-empty-");
  try {
    const emptyStatus = await buildIndexStatus({ rootDir: emptyRoot });
    assertSharedIndexMap(emptyStatus, "empty");
    assert.equal(emptyStatus.indexMaps.codeRag.health.status, "empty");
    assert.equal(emptyStatus.indexMaps.memory.health.status, "empty");
    assert.equal(emptyStatus.indexMaps.codeGraph.health.status, "empty");
  } finally {
    await rm(emptyRoot, { recursive: true, force: true });
  }

  const normalRoot = await makeTempRoot("supervibe-ui-index-normal-");
  try {
    await writeIndexes(normalRoot);
    await writeRetrievalEval(normalRoot, { pass: true, summary: { averageScore: 10, averageRecall: 1, averagePrecision: 1 } });
    const normalStatus = await buildIndexStatus({ rootDir: normalRoot });
    assertSharedIndexMap(normalStatus, "normal");
    assert.equal(normalStatus.indexMaps.codeRag.health.status, "ready");
    assert.ok(normalStatus.indexMaps.codeRag.coverage.sourceCount >= 1);

    const oldDate = new Date("2025-01-01T00:00:00.000Z");
    await utimes(join(normalRoot, ".supervibe", "memory", "code.db"), oldDate, oldDate);
    await utimes(join(normalRoot, ".supervibe", "memory", "memory.db"), oldDate, oldDate);
    const staleStatus = await buildIndexStatus({ rootDir: normalRoot });
    assertSharedIndexMap(staleStatus, "stale");
    assert.equal(staleStatus.indexMaps.codeRag.freshness.status, "stale");
    assert.equal(staleStatus.indexMaps.memory.freshness.status, "stale");
  } finally {
    await rm(normalRoot, { recursive: true, force: true });
  }
});

test("UI API projection contract versions graph run and index payloads", async () => {
  const fixture = JSON.parse(await readFile(UI_API_CONTRACT_FIXTURE, "utf8"));
  const contract = buildUiApiProjectionContract();

  assert.equal(contract.schemaVersion, UI_API_SCHEMA_VERSION);
  assert.equal(contract.projectionVersion, UI_API_PROJECTION_VERSION);
  assert.deepEqual(
    contract.endpoints.map((endpoint) => endpoint.name).sort(),
    fixture.endpoints.map((endpoint) => endpoint.name).sort(),
  );
  for (const endpoint of fixture.endpoints) {
    const actual = contract.endpoints.find((item) => item.name === endpoint.name);
    assert.ok(actual, `${endpoint.name} must be present in the projection contract`);
    assert.equal(actual.path, endpoint.path);
    assert.equal(actual.responseKind, endpoint.responseKind);
    assert.deepEqual(actual.minimalFields, endpoint.minimalFields);
    assert.deepEqual(actual.staleStateShape, endpoint.staleStateShape);
    assert.deepEqual(actual.errorShape, endpoint.errorShape);
  }

  const root = await makeTempRoot("supervibe-ui-api-contract-");
  const graphRel = ".supervibe/memory/work-items/api-contract/graph.json";
  await writeJson(join(root, graphRel), projectionGraph());
  const { server } = createSupervibeUiServer({ rootDir: root });
  await listen(server);
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const run = await (await fetch(`${baseUrl}/api/run`)).json();
    const graph = await (await fetch(`${baseUrl}/api/graph?file=${encodeURIComponent(graphRel)}`)).json();
    const indexStatus = await (await fetch(`${baseUrl}/api/index-status`)).json();
    const missing = await fetch(`${baseUrl}/api/missing`);
    const missingPayload = await missing.json();

    assert.equal(run.uiApi.schemaVersion, UI_API_SCHEMA_VERSION);
    assert.equal(run.uiApi.endpoint, "run");
    assert.equal(run.status, "no-loop");
    assert.ok(run.uiApi.staleStateShape.includes("inspectionCommand"));

    assert.equal(graph.uiApi.endpoint, "graph");
    assert.equal(graph.graphId, "api-contract");
    assert.deepEqual(Object.keys(graph.items[0]).sort(), ["id", "shortId", "status", "title", "type"]);
    assert.equal(graph.kanban.graphSummary.graphId, "api-contract");

    assert.equal(indexStatus.uiApi.endpoint, "index-status");
    assert.ok(indexStatus.uiApi.minimalFields.includes("memory.health"));
    assert.ok(indexStatus.uiApi.minimalFields.includes("indexMaps"));
    assert.ok(indexStatus.memory.status);
    assert.ok(indexStatus.codeRag.status);
    assert.ok(indexStatus.codeGraph.status);

    assert.equal(missing.status, 404);
    assert.equal(missingPayload.uiApi.endpoint, "error");
    assert.equal(missingPayload.error.code, "not-found");
    assert.ok(missingPayload.error.repairCommand);
  } finally {
    await close(server);
    await rm(root, { recursive: true, force: true });
  }
});

async function writeIndexes(root) {
  const sourcePath = join(root, "scripts", "ui-health.mjs");
  await mkdir(dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, [
    "export function memoryCoverage(entries) {",
    "  return entries.filter(Boolean).length;",
    "}",
    "export function ragUsefulness(chunks, evalPass) {",
    "  return evalPass ? chunks.length : 0;",
    "}",
  ].join("\n"), "utf8");

  const codeStore = new CodeStore(root, { useEmbeddings: false });
  await codeStore.init();
  await codeStore.indexFile(sourcePath);
  codeStore.resolveAllEdges();
  codeStore.close();

  await writeMemoryEntry(root, "decisions", "architecture-health.md", [
    "---",
    "id: architecture-health",
    "type: decision",
    "date: 2026-05-12",
    "tags: [ui, memory, rag]",
    "agent: test",
    "confidence: 10",
    "---",
    "Prioritize actionable index health over decorative relationship maps.",
  ]);
  await writeMemoryEntry(root, "patterns", "health-panel.md", [
    "---",
    "id: health-panel",
    "type: pattern",
    "date: 2026-05-12",
    "tags: [ui, health]",
    "agent: test",
    "confidence: 9",
    "---",
    "Show gaps and repair commands before graph visualization.",
  ]);

  const memoryStore = new MemoryStore(root, { useEmbeddings: false });
  await memoryStore.init();
  await memoryStore.rebuildIndex();
  memoryStore.close();
}

function assertSharedIndexMap(status, stateLabel) {
  assert.equal(status.indexMapContract.schemaVersion, 1, stateLabel);
  assert.deepEqual(status.indexMapContract.surfaces, ["codeRag", "memory", "codeGraph"]);
  for (const surface of status.indexMapContract.surfaces) {
    const indexMap = status.indexMaps?.[surface];
    assert.equal(indexMap?.kind, "supervibe-ui-health-first-index-map", `${stateLabel}:${surface}`);
    assert.equal(indexMap.surface, surface);
    assert.ok(indexMap.health.status, `${stateLabel}:${surface}:health`);
    assert.ok(Number.isFinite(indexMap.coverage.sourceCount), `${stateLabel}:${surface}:coverage`);
    assert.ok(indexMap.freshness.status, `${stateLabel}:${surface}:freshness`);
    assert.equal(indexMap.relationshipMapRole, "secondary", `${stateLabel}:${surface}:role`);
    assert.equal(indexMap.projectionLimit.maxNodes, 32, `${stateLabel}:${surface}:nodes`);
    assert.equal(indexMap.projectionLimit.maxEdges, 48, `${stateLabel}:${surface}:edges`);
    assert.ok(indexMap.repairAction.command, `${stateLabel}:${surface}:repair`);
    assert.equal(status[surface].indexMap, indexMap, `${stateLabel}:${surface}:attached`);
  }
}

async function writeMemoryEntry(root, category, fileName, lines) {
  const file = join(root, ".supervibe", "memory", category, fileName);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${lines.join("\n")}\n`, "utf8");
}

async function writeRetrievalEval(root, report) {
  const file = join(root, ".supervibe", "memory", "retrieval-golden-eval.json");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function writeJson(file, data) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function projectionGraph() {
  return {
    kind: "supervibe-work-item-graph",
    graph_id: "api-contract",
    epicId: "epic-api",
    title: "API projection contract",
    items: [
      { itemId: "epic-api", type: "epic", status: "open", title: "API contract epic" },
      { itemId: "task-api", type: "task", parentId: "epic-api", status: "open", title: "API contract task" },
    ],
    tasks: [
      { id: "task-api", parentId: "epic-api", status: "open", title: "API contract task" },
    ],
    claims: [],
    gates: [],
    evidence: [],
  };
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
