import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { CodeStore } from "../scripts/lib/code-store.mjs";
import { buildCodeGraphContext, evaluateCodeGraphTaskTypeGate } from "../scripts/lib/supervibe-codegraph-context.mjs";

const execFileAsync = promisify(execFile);

test("agent-facing codegraph context combines RAG chunks, graph neighbors, impact, and anchors", async () => {
  const root = await makeFixture();
  try {
    const context = await buildCodeGraphContext({
      rootDir: root,
      query: "IdeasPage useUserVPNConfigQuery",
      useEmbeddings: false,
      limit: 8,
    });
    assert.ok(context.ragChunks.some((row) => row.file === "src/IdeasPage.tsx"));
    assert.ok(context.entrySymbols.some((row) => row.name === "IdeasPage"));
    assert.ok(context.graphEvidence.some((row) => row.name === "useUserVPNConfigQuery"));
    assert.ok(context.relatedFiles.includes("src/hooks/vpn.ts"));
    assert.ok(context.semanticAnchors.some((row) => row.anchorId === "ideas-page"));
    assert.equal(context.quality.pass, true);
    assert.equal(context.taskTypeGate.pass, true);
    assert.ok(context.retrievalPipeline.stages.some((stage) => stage.name === "rerank"));
    assert.match(context.markdown, /Supervibe CodeGraph Context/);
    assert.match(context.markdown, /Retrieval Quality/);
    assert.match(context.markdown, /Graph Quality Gates/);
    assert.match(context.markdown, /Task-Type Graph Gate/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("task-type CodeGraph gate blocks structural work without graph evidence", () => {
  const gate = evaluateCodeGraphTaskTypeGate({
    taskType: "refactor",
    quality: { pass: true, symbolCoverage: 0.5, edgeResolutionRate: 0.5, warnings: [] },
    graphHealth: { crossResolvedEdges: { total: 30, rate: 0.5 } },
    stats: { ragChunks: 2, entrySymbols: 1, graphNodes: 0, impactNodes: 0 },
  });

  assert.equal(gate.pass, false);
  assert.ok(gate.failures.some((item) => item.includes("graph neighborhood")));
});

test("search-code auto-refreshes stale files before returning RAG results", async () => {
  const root = await makeFixture();
  const cli = join(process.cwd(), "scripts", "search-code.mjs");
  const target = join(root, "src", "IdeasPage.tsx");
  try {
    await writeFile(target, `
import { useUserVPNConfigQuery } from './hooks/vpn';

export const IdeasPage = () => {
  const config = useUserVPNConfigQuery();
  const runtimeFreshnessSentinel = 'fresh-rag-before-agent-query';
  return config.enabled ? runtimeFreshnessSentinel : null;
};
`);
    const future = new Date(Date.now() + 5000);
    await utimes(target, future, future);

    const result = await execFileAsync(process.execPath, [cli, "--query", "fresh-rag-before-agent-query", "--no-semantic"], { cwd: root });

    assert.match(result.stdout, /src\/IdeasPage\.tsx/);
    const refreshed = new CodeStore(root, { useEmbeddings: false });
    await refreshed.init();
    try {
      const rows = refreshed.db.prepare("SELECT chunk_text FROM code_chunks WHERE path = ?").all("src/IdeasPage.tsx");
      assert.match(rows.map((row) => row.chunk_text).join("\n"), /fresh-rag-before-agent-query/);
    } finally {
      refreshed.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("search-code exposes context, impact, files, and symbol-search modes for agents", async () => {
  const root = await makeFixture();
  const cli = join(process.cwd(), "scripts", "search-code.mjs");
  try {
    const context = await execFileAsync(process.execPath, [cli, "--context", "IdeasPage useUserVPNConfigQuery", "--no-semantic"], { cwd: root });
    assert.match(context.stdout, /Graph Neighborhood/);
    assert.match(context.stdout, /Retrieval Quality/);
    assert.match(context.stdout, /useUserVPNConfigQuery/);

    const impact = await execFileAsync(process.execPath, [cli, "--impact", "useUserVPNConfigQuery", "--no-semantic"], { cwd: root });
    assert.match(impact.stdout, /IdeasPage/);

    const files = await execFileAsync(process.execPath, [cli, "--files", ".", "--no-semantic"], { cwd: root });
    assert.match(files.stdout, /src\/IdeasPage\.tsx/);
    assert.match(files.stdout, /symbols=/);

    const symbols = await execFileAsync(process.execPath, [cli, "--symbol-search", "IdeasPage", "--no-semantic"], { cwd: root });
    assert.match(symbols.stdout, /src\/IdeasPage\.tsx/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function makeFixture() {
  const root = await mkdtemp("supervibe-codegraph-agent-tools-");
  await mkdir(join(root, "src", "hooks"), { recursive: true });
  await writeFile(join(root, "src", "hooks", "vpn.ts"), `
export const useUserVPNConfigQuery = () => ({ enabled: true });
`);
  await writeFile(join(root, "src", "IdeasPage.tsx"), `
import { useUserVPNConfigQuery } from './hooks/vpn';

// @supervibe-anchor id=ideas-page symbol=IdeasPage responsibility="Ideas page behavior" verify="npm test -- ideas"
export const IdeasPage = () => {
  const config = useUserVPNConfigQuery();
  return config.enabled ? null : null;
};
`);
  const store = new CodeStore(root, { useEmbeddings: false });
  await store.init();
  try {
    await store.indexAll(root);
  } finally {
    store.close();
  }
  return root;
}

async function mkdtemp(prefix) {
  const { mkdtemp: make } = await import("node:fs/promises");
  return make(join(tmpdir(), prefix));
}
