import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { CodeStore, CODE_RAG_CHUNK_METADATA_VERSION } from "../scripts/lib/code-store.mjs";
import { vectorToBuffer } from "../scripts/lib/embeddings.mjs";
import {
  formatHybridRetrievalEvidence,
  rankHybridCodeSearchResults,
  runHybridCodeSearch,
} from "../scripts/lib/supervibe-code-search.mjs";
import {
  buildSharedEvidencePacket,
  validateEvidencePacket,
} from "../scripts/lib/supervibe-evidence-packet.mjs";
import {
  formatRetrievalGoldenEvalReport,
  runRetrievalGoldenEval,
} from "../scripts/lib/supervibe-retrieval-golden-eval.mjs";
import { buildCompactContextPack as buildSearchCompactContextPack } from "../scripts/search-code.mjs";

test("RAG chunks carry metadata contract and old index initialization remains searchable", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-rag-metadata-"));
  let store = null;
  let reopened = null;
  try {
    await writeFixture(rootDir, "src/workflow-service.ts", [
      "export function reconcileWorkflowReceipt() {",
      "  return 'source-backed receipt reconciliation';",
      "}",
    ].join("\n"));

    store = new CodeStore(rootDir, { useEmbeddings: false, useGraph: false });
    await store.init();
    const columns = store.db.prepare("PRAGMA table_info(code_chunks)").all().map((row) => row.name);
    for (const column of ["file_role", "heading", "symbol_hints_json", "artifact_type", "freshness", "metadata_version"]) {
      assert.ok(columns.includes(column), `missing metadata column: ${column}`);
    }

    await store.indexFile(join(rootDir, "src", "workflow-service.ts"), { force: true });
    const chunk = store.db.prepare(`
      SELECT file_role, heading, symbol_hints_json, artifact_type, freshness, metadata_version
      FROM code_chunks
      WHERE path = ?
      LIMIT 1
    `).get("src/workflow-service.ts");

    assert.equal(chunk.file_role, "source");
    assert.equal(chunk.artifact_type, "source-code");
    assert.equal(chunk.freshness, "current");
    assert.equal(chunk.metadata_version, CODE_RAG_CHUNK_METADATA_VERSION);
    assert.match(chunk.heading, /reconcileWorkflowReceipt/);
    assert.ok(JSON.parse(chunk.symbol_hints_json).includes("reconcileWorkflowReceipt"));

    const results = await store.search({
      query: "source-backed receipt reconciliation",
      semantic: false,
      limit: 1,
    });
    assert.equal(results[0].metadata.fileRole, "source");
    assert.equal(results[0].metadata.artifactType, "source-code");
    assert.equal(results[0].metadata.freshness, "current");
    assert.ok(results[0].metadata.symbolHints.includes("reconcileWorkflowReceipt"));
    store.close();
    store = null;

    reopened = new CodeStore(rootDir, { useEmbeddings: false, useGraph: false });
    await reopened.init();
    const reopenedResults = await reopened.search({
      query: "source-backed receipt reconciliation",
      semantic: false,
      limit: 1,
    });
    assert.equal(reopenedResults.length, 1);
    assert.equal(reopenedResults[0].metadata.metadataVersion, CODE_RAG_CHUNK_METADATA_VERSION);
    reopened.close();
    reopened = null;
  } finally {
    store?.close();
    reopened?.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("artifact RAG indexes Supervibe docs with roles, entity links, and derived anchors", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-rag-artifacts-"));
  const store = new CodeStore(rootDir, { useEmbeddings: false, useGraph: true });
  try {
    await writeFixture(rootDir, "AGENTS.md", "# AGENTS\n\nUse workflow receipts for every reviewer.");
    await writeFixture(rootDir, "commands/supervibe-demo.md", "# /supervibe-demo\n\nDemo command routes workflow receipts.");
    await writeFixture(rootDir, "skills/demo/SKILL.md", "---\nname: demo\n---\n# Demo Skill\n\nHandles receipt routing.");
    await writeFixture(rootDir, "registry.yaml", "plugins:\n  - name: supervibe\n");
    await writeFixture(rootDir, "references/internal-commands/supervibe-loop.md", "# Loop\n\nRuntime command reference.");
    await writeFixture(rootDir, "templates/approval-markers/prototype-approval.json.tpl", "{\n  \"approved\": true\n}\n");
    await writeFixture(rootDir, "questionnaires/01-stack-foundation.yaml", "name: stack-foundation\n");
    await writeFixture(rootDir, "confidence-rubrics/plan.yaml", "name: plan\n");
    await writeFixture(rootDir, "hooks/hooks.json", "{\n  \"hooks\": {}\n}\n");
    await store.init();
    await store.indexAll(rootDir);

    const rows = store.db.prepare(`
      SELECT path, file_role AS fileRole, artifact_type AS artifactType
      FROM code_chunks
      WHERE path IN (?, ?, ?, ?)
      ORDER BY path
    `).all("AGENTS.md", "commands/supervibe-demo.md", "registry.yaml", "skills/demo/SKILL.md");
    const byPath = new Map(rows.map((row) => [row.path, row]));
    assert.equal(byPath.get("AGENTS.md")?.fileRole, "docs");
    assert.equal(byPath.get("commands/supervibe-demo.md")?.fileRole, "command");
    assert.equal(byPath.get("commands/supervibe-demo.md")?.artifactType, "supervibe-command");
    assert.equal(byPath.get("skills/demo/SKILL.md")?.fileRole, "skill");
    assert.equal(byPath.get("registry.yaml")?.fileRole, "registry");

    const laneRows = store.db.prepare(`
      SELECT path, file_role AS fileRole, artifact_type AS artifactType
      FROM code_chunks
      WHERE path IN (?, ?, ?, ?, ?)
      ORDER BY path
    `).all(
      "confidence-rubrics/plan.yaml",
      "hooks/hooks.json",
      "questionnaires/01-stack-foundation.yaml",
      "references/internal-commands/supervibe-loop.md",
      "templates/approval-markers/prototype-approval.json.tpl",
    );
    const lanesByPath = new Map(laneRows.map((row) => [row.path, row]));
    assert.equal(lanesByPath.get("confidence-rubrics/plan.yaml")?.fileRole, "rubric");
    assert.equal(lanesByPath.get("hooks/hooks.json")?.fileRole, "hook");
    assert.equal(lanesByPath.get("questionnaires/01-stack-foundation.yaml")?.fileRole, "questionnaire");
    assert.equal(lanesByPath.get("references/internal-commands/supervibe-loop.md")?.artifactType, "supervibe-reference");
    assert.equal(lanesByPath.get("templates/approval-markers/prototype-approval.json.tpl")?.artifactType, "supervibe-template");

    const entityHealth = store.getChunkEntityHealth();
    assert.equal(entityHealth.rebuildRequired, false);
    assert.ok(entityHealth.linkedChunks >= rows.length);
    const commandEntity = store.db.prepare(`
      SELECT entity_type AS entityType, entity_name AS entityName
      FROM code_chunk_entities
      WHERE path = ? AND entity_type = 'command'
      LIMIT 1
    `).get("commands/supervibe-demo.md");
    assert.deepEqual({ ...commandEntity }, { entityType: "command", entityName: "supervibe-demo" });

    const anchorHealth = store.getSemanticAnchorHealth();
    assert.ok(anchorHealth.derivedAnchors > 0, `expected derived anchors, got ${JSON.stringify(anchorHealth)}`);
  } finally {
    store.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("semantic search scores the full embedded corpus instead of the first chunk window", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-rag-full-corpus-"));
  const store = new CodeStore(rootDir, { useEmbeddings: false, useGraph: false });
  try {
    for (let index = 0; index < 260; index += 1) {
      const name = String(index).padStart(3, "0");
      await writeFixture(rootDir, `src/item-${name}.ts`, `export const item${name} = "filler ${name}";`);
    }
    await store.init();
    await store.indexAll(rootDir);

    const fillerVector = new Float32Array([0, 1, 0]);
    const targetVector = new Float32Array([1, 0, 0]);
    store.db.prepare("UPDATE code_chunks SET embedding = ?").run(vectorToBuffer(fillerVector));
    store.db.prepare("UPDATE code_chunks SET embedding = ? WHERE path = ?").run(vectorToBuffer(targetVector), "src/item-259.ts");
    store.useEmbeddings = true;

    const results = await store.search({
      query: "vector only corpus reachability",
      semantic: true,
      queryVector: targetVector,
      limit: 1,
    });
    assert.equal(results[0]?.file, "src/item-259.ts");
    assert.equal(results[0]?.retrievalMode, "semantic");
  } finally {
    store.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("entity and semantic-anchor candidates participate in non-semantic retrieval", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-rag-entity-anchor-"));
  const store = new CodeStore(rootDir, { useEmbeddings: false, useGraph: true });
  try {
    const relPath = "commands/supervibe-hidden.md";
    await writeFixture(rootDir, relPath, "# /supervibe-hidden\n\nRuntime command routing without external alias text.");
    await store.init();
    await store.indexFile(join(rootDir, relPath), { force: true });

    const entity = store.db.prepare(`
      SELECT chunk_id AS chunkId, entity_type AS entityType, entity_id AS entityId, derivation_source AS derivationSource
      FROM code_chunk_entities
      WHERE path = ?
      LIMIT 1
    `).get(relPath);
    assert.ok(entity, "fixture should have at least one derived chunk entity");
    store.db.prepare(`
      UPDATE code_chunk_entities
      SET entity_type = 'alias', entity_id = 'alias:external-only', entity_name = 'ExternalAliasOnly', confidence = 0.99
      WHERE chunk_id = ? AND entity_type = ? AND entity_id = ? AND derivation_source = ?
    `).run(entity.chunkId, entity.entityType, entity.entityId, entity.derivationSource);

    const results = await store.search({ query: "ExternalAliasOnly", semantic: false, limit: 1 });
    assert.equal(results[0]?.file, relPath);
    assert.equal(results[0]?.retrievalMode, "entity-anchor");
  } finally {
    store.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});
test("entity-anchor retrieval avoids chunk-wide left join scans", async () => {
  const source = await readFile(join(process.cwd(), "scripts", "lib", "code-store.mjs"), "utf8");
  assert.doesNotMatch(source, /LEFT JOIN code_chunk_entities[\s\S]+LEFT JOIN code_semantic_anchors/);
  assert.match(source, /idx_chunk_entities_chunk/);
  assert.match(source, /idx_anchor_path_range/);
  assert.match(source, /SUPERVIBE_ENTITY_ANCHOR_CANDIDATE_LIMIT/);
});

test("hybrid code search exposes lexical, semantic, and merged scoring evidence", async () => {
  const store = fakeStore({
    lexical: [
      result({ file: "scripts/search-code.mjs", retrievalMode: "fts", bm25: 6, score: -6 }),
    ],
    semantic: [
      result({
        file: "scripts/lib/noisy-generated-runtime-fixture.mjs",
        retrievalMode: "hybrid",
        bm25: 8,
        semantic: 0.86,
        score: 0.04,
        generatedSource: true,
      }),
      result({
        file: "scripts/lib/supervibe-code-search.mjs",
        name: "runHybridCodeSearch",
        retrievalMode: "hybrid",
        bm25: 5,
        semantic: 0.91,
        score: 0.03,
        snippet: "runHybridCodeSearch hybrid lexical embedding retrieval policy",
      }),
    ],
  });

  const output = await runHybridCodeSearch(store, {
    query: "hybrid lexical embedding retrieval policy",
    limit: 2,
    semantic: true,
  });

  assert.deepEqual(store.calls.map((call) => call.semantic), [false, true]);
  assert.deepEqual(output.retrieval.usedModes, ["lexical", "semantic", "merged-scoring"]);
  assert.equal(output.retrieval.fallback.used, false);
  assert.equal(output.retrieval.routing.intent, "source");
  assert.equal(output.results[0].file, "scripts/lib/supervibe-code-search.mjs");
  assert.equal(output.results[0].sourceBacked, true);
  assert.equal(output.results[0].ownerMatch, true);
  assert.match(formatHybridRetrievalEvidence(output.retrieval), /Retrieval modes used: lexical, semantic, merged-scoring/);
  assert.match(formatHybridRetrievalEvidence(output.retrieval), /routing=source\/source/);
});

test("shared evidence packet validates memory RAG CodeGraph citation redaction and budget contracts", () => {
  const packet = buildSharedEvidencePacket({
    query: "shared evidence packet",
    memory: [{
      id: "memory-rag-quality",
      path: ".supervibe/memory/decisions/memory-rag-quality.md",
      summary: "Memory decision with source citation",
      confidence: 8,
      freshness: "current",
    }],
    rag: [{
      path: "scripts/lib/supervibe-code-search.mjs",
      startLine: 10,
      endLine: 22,
      kind: "function",
      name: "runHybridCodeSearch",
      snippet: "runHybridCodeSearch source citation",
      freshness: "current",
    }],
    codeGraph: [{
      path: "scripts/lib/supervibe-codegraph-context.mjs",
      startLine: 5,
      kind: "function",
      name: "buildCodeGraphContext",
      distance: 0,
      freshness: "current",
    }],
    confidence: { score: 0.82, level: "high", reasons: ["all sources present"] },
    redactionStatus: "not-needed",
    tokenBudget: { maxTokens: 1200, estimatedTokens: 180, pass: true, trimmed: false },
  });

  assert.equal(packet.kind, "supervibe-shared-evidence-packet");
  assert.equal(packet.evidence.memory.length, 1);
  assert.equal(packet.evidence.rag.length, 1);
  assert.equal(packet.evidence.codeGraph.length, 1);
  assert.deepEqual(packet.citations.map((citation) => citation.id), ["M1", "R1", "G1"]);
  assert.equal(packet.freshness.memory, "current");
  assert.equal(packet.redactionStatus, "not-needed");
  assert.equal(validateEvidencePacket(packet).pass, true);

  const missingCitation = structuredClone(packet);
  missingCitation.citations = [];
  assert.deepEqual(validateEvidencePacket(missingCitation).issues, [
    "memory evidence missing source citation: memory-rag-quality",
    "RAG evidence missing source citation: scripts/lib/supervibe-code-search.mjs:10",
    "CodeGraph evidence missing source citation: scripts/lib/supervibe-codegraph-context.mjs:5",
  ]);

  const missingRedaction = structuredClone(packet);
  delete missingRedaction.redactionStatus;
  assert.ok(validateEvidencePacket(missingRedaction).issues.includes("missing redactionStatus"));

  const missingBudget = structuredClone(packet);
  delete missingBudget.tokenBudget;
  assert.ok(validateEvidencePacket(missingBudget).issues.includes("missing tokenBudget"));
});

test("hybrid code search records lexical fallback when semantic signal is unavailable", async () => {
  const lexical = [
    result({
      file: "scripts/search-code.mjs",
      retrievalMode: "fts-relaxed",
      bm25: 3,
      score: -3,
      snippet: "search-code lexical fallback",
    }),
  ];
  const store = fakeStore({ lexical, semantic: lexical });

  const output = await runHybridCodeSearch(store, {
    query: "embedding runtime unavailable fallback",
    limit: 1,
    semantic: true,
  });

  assert.deepEqual(output.retrieval.usedModes, ["lexical"]);
  assert.equal(output.retrieval.fallback.used, true);
  assert.equal(output.retrieval.fallback.reason, "semantic-unavailable-or-zero-signal");
  assert.match(formatHybridRetrievalEvidence(output.retrieval), /fallback=semantic-unavailable-or-zero-signal/);
});

test("hybrid code search records semantic fallback when lexical retrieval is empty", async () => {
  const store = fakeStore({
    lexical: [],
    semantic: [
      result({
        file: "scripts/lib/supervibe-code-search.mjs",
        retrievalMode: "semantic",
        semantic: 0.89,
        score: 0.02,
        snippet: "semantic embedding retrieval",
      }),
    ],
  });

  const output = await runHybridCodeSearch(store, {
    query: "semantic only retrieval",
    limit: 1,
    semantic: true,
  });

  assert.deepEqual(output.retrieval.usedModes, ["semantic"]);
  assert.equal(output.retrieval.fallback.used, true);
  assert.equal(output.retrieval.fallback.reason, "lexical-empty-semantic-fallback");
});

test("golden queries prefer source-backed owner modules over noisy matches", () => {
  const ranked = rankHybridCodeSearchResults([
    result({
      file: "tests/fixtures/hybrid-retrieval-policy-copy.test.mjs",
      retrievalMode: "hybrid",
      bm25: 10,
      semantic: 0.92,
      score: 0.06,
      snippet: "hybrid lexical embedding retrieval policy copied fixture",
    }),
    result({
      file: "scripts/lib/supervibe-code-search.mjs",
      name: "runHybridCodeSearch",
      retrievalMode: "hybrid",
      bm25: 6,
      semantic: 0.9,
      score: 0.03,
      snippet: "runHybridCodeSearch hybrid lexical embedding retrieval policy",
    }),
  ], {
    query: "hybrid lexical embedding retrieval policy",
    limit: 2,
  });

  assert.equal(ranked[0].file, "scripts/lib/supervibe-code-search.mjs");
  assert.equal(ranked[0].sourceBacked, true);
  assert.equal(ranked[0].ownerMatch, true);
});

test("artifact queries prefer Supervibe artifact lanes over source-only matches", () => {
  const ranked = rankHybridCodeSearchResults([
    result({
      file: "scripts/lib/workflow-receipts.mjs",
      retrievalMode: "hybrid",
      bm25: 8,
      semantic: 0.9,
      score: 0.06,
      snippet: "workflow receipt command routing implementation",
    }),
    result({
      file: "commands/supervibe-receipts.md",
      language: "markdown",
      kind: "section",
      name: "supervibe-receipts",
      retrievalMode: "hybrid",
      bm25: 5,
      semantic: 0.83,
      score: 0.03,
      snippet: "receipt command workflow docs",
      metadata: { fileRole: "command", artifactType: "supervibe-command", heading: "/supervibe-receipts", symbolHints: [] },
    }),
  ], {
    query: "receipt command workflow",
    limit: 2,
  });

  assert.equal(ranked[0].file, "commands/supervibe-receipts.md");
  assert.equal(ranked[0].artifactBacked, true);
  assert.equal(ranked[0].retrievalLane, "artifact");
});

test("retrieval golden dataset covers critical Supervibe surfaces and passes aggregate eval", async () => {
  const fixturePath = "tests/fixtures/rag/golden-queries.json";
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const areas = new Set((fixture.cases || []).map((testCase) => testCase.area));
  assert.deepEqual([...areas].sort(), [
    "atomizer",
    "codegraph",
    "memory",
    "provider-configs",
    "rag",
    "receipts",
    "scheduler",
    "ui-board",
    "user-gates",
  ]);

  const report = await runRetrievalGoldenEval({
    rootDir: process.cwd(),
    caseFile: fixturePath,
    now: "2026-05-12T00:00:00.000Z",
  });
  assert.equal(report.pass, true, formatRetrievalGoldenEvalReport(report));
  assert.equal(report.summary.total, 9);
  assert.equal(report.summary.averageScore, 10);

  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  assert.match(packageJson.scripts["supervibe:rag-golden"], /tests\/fixtures\/rag\/golden-queries\.json/);
});

test("compact code search context pack includes cited memory, RAG, CodeGraph, confidence, and graph warnings", () => {
  const pack = buildSearchCompactContextPack({
    query: "context pack rerank graph warnings",
    memoryResults: [
      {
        id: "rag-index-health",
        file: ".supervibe/memory/decisions/rag-index-health.md",
        summary: "RAG context packs must cite omitted evidence and index health.",
        score: 5,
        confidence: 8,
      },
    ],
    ragResults: [
      result({
        file: "scripts/lib/supervibe-code-search.mjs",
        name: "runHybridCodeSearch",
        retrievalMode: "hybrid",
        bm25: 4,
        semantic: 0.88,
        score: 0.04,
        scoreComponents: { adjusted: 0.24 },
        snippet: "runHybridCodeSearch returns ranked code search evidence",
      }),
    ],
    codeGraphContext: {
      graphEvidence: [
        {
          path: "scripts/lib/supervibe-code-search.mjs",
          startLine: 12,
          kind: "function",
          name: "runHybridCodeSearch",
          distance: 0,
          seed: "runHybridCodeSearch",
        },
      ],
      impact: { nodes: [] },
      entrySymbols: [],
      quality: { warnings: ["low cross-file edge resolution"] },
      taskTypeGate: { warnings: ["agent handoff has source evidence but no graph neighborhood"] },
    },
    retrieval: {
      policy: "hybrid-lexical-embedding-v1",
      usedModes: ["lexical", "semantic", "merged-scoring"],
      fallback: { used: false, reason: "merged-lexical-semantic" },
      routing: { intent: "source", lane: "source" },
    },
    maxTokens: 1000,
  });

  assert.equal(pack.kind, "supervibe-code-search-context-pack");
  assert.deepEqual(pack.citations.map((citation) => citation.id), ["M1", "R1", "G1"]);
  assert.equal(pack.confidence.level, "high");
  assert.match(pack.markdown, /\[M1\].*rag-index-health/);
  assert.match(pack.markdown, /\[R1\].*scripts\/lib\/supervibe-code-search\.mjs:1-12/);
  assert.match(pack.markdown, /\[G1\].*runHybridCodeSearch/);
  assert.match(pack.markdown, /low cross-file edge resolution/);
  assert.match(pack.markdown, /routing=source\/source/);
  assert.equal(pack.omittedEvidence.length, 0);
  assert.equal(pack.tokenBudget.pass, true);
  assert.equal(pack.evidencePacket.kind, "supervibe-shared-evidence-packet");
  assert.equal(pack.evidencePacket.validation.pass, true);
});

test("compact code search context pack records omitted evidence reasons and trims to token budget deterministically", () => {
  const pack = buildSearchCompactContextPack({
    query: "missing graph memory",
    memoryResults: [],
    ragResults: Array.from({ length: 8 }, (_, index) => result({
      file: `scripts/lib/result-${index}.mjs`,
      startLine: index + 1,
      endLine: index + 2,
      score: 0.1 - index / 100,
      snippet: `long snippet ${index} ${"x".repeat(220)}`,
    })),
    codeGraphContext: null,
    retrieval: {
      policy: "hybrid-lexical-embedding-v1",
      usedModes: ["lexical"],
      fallback: { used: true, reason: "semantic-unavailable-or-zero-signal" },
    },
    maxTokens: 180,
  });

  assert.deepEqual(
    pack.omittedEvidence.map((entry) => `${entry.source}:${entry.reason}`),
    [
      "budget:trimmed to 180 token budget",
      "codegraph:CodeGraph context unavailable",
      "memory:no matching project memory entries found",
    ],
  );
  assert.equal(pack.tokenBudget.trimmed, true);
  assert.equal(pack.evidence.rag.length, 4);
  assert.deepEqual(pack.citations.map((citation) => citation.id), ["R1", "R2", "R3", "R4"]);
  assert.match(pack.markdown, /fallback=semantic-unavailable-or-zero-signal/);
});

function fakeStore({ lexical = [], semantic = [] } = {}) {
  return {
    calls: [],
    async search(options) {
      this.calls.push(options);
      return options.semantic === false ? lexical : semantic;
    },
  };
}

function result(overrides = {}) {
  const row = {
    file: "scripts/lib/example.mjs",
    language: "javascript",
    lineCount: 100,
    kind: "function",
    name: "example",
    startLine: 1,
    endLine: 12,
    snippet: "example snippet",
    score: 0.01,
    semantic: 0,
    bm25: 0,
    retrievalMode: "fts",
    generatedSource: false,
    ...overrides,
  };
  row.scoreComponents = {
    bm25: row.bm25,
    semantic: row.semantic,
    rrf: row.score,
    ...(overrides.scoreComponents || {}),
  };
  return row;
}

async function writeFixture(rootDir, relativePath, content) {
  const fullPath = join(rootDir, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, `${content}\n`, "utf8");
}
