import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOrchestratedContextPack,
  formatContextSourceDiagnostics,
} from "../scripts/lib/supervibe-context-orchestrator.mjs";

test("context orchestrator merges memory, source chunks and graph neighborhood", () => {
  const pack = buildOrchestratedContextPack({
    query: "genesis host adapter codegraph",
    memoryResults: [{ id: "ADR-1", summary: "Host adapter decision", file: "memory/decisions/adr.md", score: 0.9 }],
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
