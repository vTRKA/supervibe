import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildOrchestratedContextPack,
  buildOrchestratedContextPackFromProject,
  formatContextSourceDiagnostics,
} from "../scripts/lib/supervibe-context-orchestrator.mjs";
import { CodeStore } from "../scripts/lib/code-store.mjs";
import { vectorToBuffer } from "../scripts/lib/embeddings.mjs";

test("context orchestrator merges memory, source chunks and graph neighborhood", () => {
  const pack = buildOrchestratedContextPack({
    query: "genesis host adapter codegraph",
    memoryResults: [{ id: "DECISION-1", summary: "Host adapter decision", file: "memory/decisions/host-adapter.md", score: 0.9 }],
    ragResults: [{ path: "scripts/lib/supervibe-host-detector.mjs", startLine: 1, endLine: 20, text: "detect host", score: 0.8 }],
    graphNeighborhood: [{ symbol: "selectHostAdapter", path: "scripts/lib/supervibe-host-detector.mjs", relationships: ["resolveHostAdapter"] }],
    hostFiles: [{ path: "CLAUDE.md", summary: "Project context" }],
    maxTokens: 1200,
  });

  assert.equal(pack.sources.memory.items.length, 1, "context pack missing required memory, source chunks or graph neighborhood");
  assert.equal(pack.sources.rag.items.length, 1, "context pack missing required memory, source chunks or graph neighborhood");
  assert.equal(pack.sources.codegraph.items.length, 1, "context pack missing required memory, source chunks or graph neighborhood");
  assert.equal(pack.sources.host.items.length, 1);
  assert.ok(pack.citations.some((citation) => citation.source === "rag"));
  assert.ok(pack.tokenBudget.estimatedTokens <= pack.tokenBudget.maxTokens);
  assert.match(formatContextSourceDiagnostics(pack), /memory: included/);
});

test("project context pack falls back to memory graph nodes with domain memory types", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-context-memory-graph-"));
  try {
    const memoryPath = join(rootDir, ".supervibe", "memory", "decisions", "graph-fallback.md");
    await mkdir(join(rootDir, ".supervibe", "memory", "decisions"), { recursive: true });
    await writeFile(memoryPath, [
      "---",
      "id: graph-fallback",
      "type: decision",
      "date: 2026-05-18",
      "tags: [fallback]",
      "agent: codex",
      "confidence: 9",
      "sourceArtifact: .supervibe/artifacts/plans/context.md",
      "owner: memory-curator",
      "freshness: fresh",
      "relationships: []",
      "---",
      "Decision: Keep graph fallback evidence for non-memory typed nodes.",
      "",
    ].join("\n"), "utf8");

    const pack = await buildOrchestratedContextPackFromProject({
      rootDir,
      query: "graph fallback evidence",
      maxTokens: 1200,
    });

    assert.equal(pack.sources.memory.items[0].id, "graph-fallback");
    assert.equal(pack.sources.memory.items[0].sourceKind, "project-knowledge-graph-memory-fallback");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
test("project context pack uses indexed Code RAG and CodeGraph before inventory fallback", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-context-orchestrator-"));
  const store = new CodeStore(rootDir, { useEmbeddings: false, useGraph: true });
  try {
    await mkdir(join(rootDir, "src"), { recursive: true });
    await writeFile(join(rootDir, "src", "retrieval-target.ts"), [
      "export function orchestratedIndexedRetrievalTarget() {",
      "  return 'orchestrated indexed retrieval target';",
      "}",
      "",
    ].join("\n"), "utf8");
    await store.init();
    await store.indexFile(join(rootDir, "src", "retrieval-target.ts"), { force: true });
    const vector = new Float32Array(384);
    vector[0] = 1;
    store.db.prepare("UPDATE code_chunks SET embedding = ? WHERE path = ?").run(vectorToBuffer(vector), "src/retrieval-target.ts");
    store.close();

    const pack = await buildOrchestratedContextPackFromProject({
      rootDir,
      query: "orchestrated indexed retrieval target",
      maxTokens: 1200,
    });

    assert.equal(pack.sources.rag.items[0].path, "src/retrieval-target.ts");
    assert.equal(pack.sources.rag.items[0].sourceKind, "code-rag-hybrid");
    assert.equal(pack.sources.codegraph.items[0].path, "src/retrieval-target.ts");
    assert.match(pack.sources.codegraph.items[0].sourceKind, /codegraph-/);
  } finally {
    store.close?.();
    await rm(rootDir, { recursive: true, force: true });
  }
});
