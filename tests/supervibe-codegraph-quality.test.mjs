import assert from "node:assert/strict";
import test from "node:test";

import {
  applyGoldenRetrievalMaturityGate,
  buildCompactLinkedEvidencePacket,
  buildCodeGraphReadinessUi,
  buildLinkedEvidencePacket,
  buildQueryCenteredCodeGraphMap,
  buildUnresolvedEdgeDiagnostics,
  classifyUnresolvedEdge,
  formatCodeGraphReadinessUi,
  formatLinkedEvidencePacket,
  formatUnresolvedEdgeDiagnostics,
} from "../scripts/lib/supervibe-codegraph-ui-map.mjs";
import {
  extractCandidatesFromText,
  extractLinkedEvidenceRefs,
} from "../scripts/lib/supervibe-memory-backfill.mjs";

test("unresolved edge diagnostics classify limitations and top affected files", () => {
  const diagnostics = buildUnresolvedEdgeDiagnostics([
    { fromPath: "scripts/a.mjs", toName: "sharedName", edgeKind: "call", candidateCount: 3, count: 11 },
    { fromPath: "scripts/a.mjs", toName: "node:path", edgeKind: "import", candidateCount: 0, count: 7 },
    { fromPath: "scripts/b.mjs", toName: "this", edgeKind: "call", candidateCount: 0, count: 5 },
    { fromPath: "scripts/c.mjs", toName: "missingThing", edgeKind: "call", candidateCount: 0, count: 2 },
  ]);

  assert.equal(classifyUnresolvedEdge({ toName: "sharedName", candidateCount: 2 }), "ambiguous-local-symbol");
  assert.equal(classifyUnresolvedEdge({ toName: "String", candidateCount: 0 }), "language-builtin-or-runtime-api");
  assert.equal(classifyUnresolvedEdge({ toName: "readFileSync", candidateCount: 0 }), "language-builtin-or-runtime-api");
  assert.equal(classifyUnresolvedEdge({ toName: "run", candidateCount: 0 }), "missing-symbol");
  assert.equal(diagnostics.total, 25);
  assert.deepEqual(diagnostics.classBreakdown.map((item) => item.name), [
    "ambiguous-local-symbol",
    "external-or-reexport",
    "dynamic-language-pattern",
    "missing-symbol",
  ]);
  assert.equal(diagnostics.topAffectedFiles[0].path, "scripts/a.mjs");
  assert.match(formatUnresolvedEdgeDiagnostics(diagnostics), /JavaScript dynamic dispatch/);
  assert.match(formatUnresolvedEdgeDiagnostics(diagnostics), /scripts\/a\.mjs/);
});

test("codegraph readiness uses stale freshness and actionable hotspots, not raw percent alone", () => {
  const ui = buildCodeGraphReadinessUi({
    indexGate: {
      ready: true,
      failedGates: [],
      warnings: [{ code: "cross-resolution" }],
    },
    unresolvedDiagnostics: {
      topAffectedFiles: [
        { path: "scripts/hot.mjs", count: 22, classes: "ambiguous-local-symbol:22" },
        { path: "scripts/noise.mjs", count: 3, classes: "dynamic-language-pattern:3" },
      ],
    },
    watcherDiagnostics: {
      heartbeat: { status: "stale" },
    },
    graphStats: { edgeResolutionRate: 0.08 },
  });

  assert.equal(ui.ready, false);
  assert.equal(ui.stale, true);
  assert.equal(ui.actionableHotspots.length, 1);
  assert.match(formatCodeGraphReadinessUi(ui), /STALE: true/);
  assert.match(formatCodeGraphReadinessUi(ui), /scripts\/hot\.mjs/);

  const runtimeOnly = buildCodeGraphReadinessUi({
    indexGate: { ready: true, failedGates: [], warnings: [] },
    unresolvedDiagnostics: {
      topAffectedFiles: [{ path: "scripts/runtime-api.mjs", count: 22, classes: "language-builtin-or-runtime-api:22" }],
    },
    graphStats: { edgeResolutionRate: 0.2 },
  });
  assert.equal(runtimeOnly.actionableHotspots.length, 0);
});

test("query-centered CodeGraph map selects relevant neighborhood over arbitrary top symbols", () => {
  const map = buildQueryCenteredCodeGraphMap({
    query: "index status health projection",
    stats: {
      totalFiles: 12,
      filesWithSymbols: 9,
      totalSymbols: 20,
      totalEdges: 30,
      resolvedEdges: 21,
      edgeResolutionRate: 0.7,
    },
    unresolvedDiagnostics: {
      topAffectedFiles: [{ path: "scripts/noisy.mjs", count: 14, classes: "dynamic-language-pattern:14" }],
    },
    symbols: [
      { id: "central", name: "unrelatedCentral", kind: "function", path: "scripts/noise.mjs", startLine: 1, inDegree: 30, outDegree: 30 },
      { id: "build-index-status", name: "buildIndexStatus", kind: "function", path: "scripts/lib/supervibe-ui-server.mjs", startLine: 1715, inDegree: 2, outDegree: 4 },
      { id: "rag-health", name: "buildRagHealthProjection", kind: "function", path: "scripts/lib/supervibe-ui-server.mjs", startLine: 1911, inDegree: 1, outDegree: 1 },
      { id: "memory-health", name: "buildMemoryHealthProjection", kind: "function", path: "scripts/lib/supervibe-ui-server.mjs", startLine: 1990, inDegree: 1, outDegree: 1 },
    ],
    edges: [
      { fromId: "build-index-status", toId: "rag-health", kind: "calls" },
      { fromId: "build-index-status", toId: "memory-health", kind: "calls" },
    ],
    maxNodes: 3,
    maxEdges: 4,
  });

  assert.equal(map.kind, "supervibe-query-centered-codegraph-map");
  assert.equal(map.selection.mode, "query-centered");
  assert.deepEqual(map.nodes.map((node) => node.name), [
    "buildIndexStatus",
    "buildRagHealthProjection",
    "buildMemoryHealthProjection",
  ]);
  assert.equal(map.nodes.some((node) => node.name === "unrelatedCentral"), false);
  assert.equal(map.edges.length, 2);
  assert.equal(map.health.sourceCoverage.filesWithSymbols, 9);
  assert.equal(map.health.resolvedEdges.resolved, 21);
  assert.equal(map.health.unresolvedHotspots[0].path, "scripts/noisy.mjs");
  assert.equal(map.projectionLimit.maxNodes, 3);
  assert.equal(map.projectionLimit.truncated, false);
});

test("golden retrieval failures cap maturity and block 10 of 10 projections", () => {
  const base = {
    score: 10,
    maxScore: 10,
    pass: true,
    status: "10-of-10-ready",
    globalMaturity: {
      score: 10,
      maxScore: 10,
      pass: true,
      status: "global-10-of-10-ready",
    },
    dimensions: [
      { id: "code-graph-readiness", score: 1, max: 1, pass: true, evidence: "source=10/10, retrievalTelemetry=10/10", nextAction: "none" },
      { id: "other", score: 9, max: 9, pass: true, evidence: "ok", nextAction: "none" },
    ],
    blockers: [],
  };

  const report = applyGoldenRetrievalMaturityGate(base, {
    pass: false,
    summary: { total: 4, failed: 1 },
  });

  assert.equal(report.pass, false);
  assert.equal(report.globalMaturity.pass, false);
  assert.equal(report.score, 9.5);
  assert.ok(report.blockers.some((item) => item.id === "code-graph-readiness"));
  assert.match(report.dimensions[0].evidence, /ragGolden=golden retrieval eval pass=false/);
});

test("golden retrieval pass is visible in maturity evidence", () => {
  const base = {
    score: 10,
    maxScore: 10,
    pass: true,
    globalMaturity: { score: 10, maxScore: 10, pass: true },
    dimensions: [
      { id: "code-graph-readiness", score: 1, max: 1, pass: true, evidence: "source=10/10" },
    ],
    blockers: [],
  };

  const report = applyGoldenRetrievalMaturityGate(base, {
    pass: true,
    summary: { total: 4, failed: 0 },
  });

  assert.equal(report.pass, true);
  assert.equal(report.ragGolden.pass, true);
  assert.match(report.dimensions[0].evidence, /ragGolden=pass total=4/);
});

test("linked evidence packet connects files symbols work items receipts and memory", () => {
  const packet = buildLinkedEvidencePacket({
    query: "T37 evidence",
    now: "2026-05-13T00:00:00.000Z",
    files: [
      { path: "scripts/lib/supervibe-codegraph-ui-map.mjs", updatedAt: "2026-05-13T00:00:00.000Z" },
    ],
    symbols: [
      { name: "buildLinkedEvidencePacket", path: "scripts/lib/supervibe-codegraph-ui-map.mjs", startLine: 100 },
    ],
    workItems: [
      {
        id: "T37",
        status: "claimed",
        files: ["scripts/lib/supervibe-codegraph-ui-map.mjs"],
        symbols: ["buildLinkedEvidencePacket"],
        receiptIds: ["receipt-T37"],
        memoryIds: ["workflow-hardening-memory-context-reliability"],
      },
    ],
    receipts: [
      {
        receiptId: "receipt-T37",
        status: "completed",
        inputEvidence: [
          "scripts/lib/supervibe-codegraph-ui-map.mjs:100",
          ".supervibe/memory/learnings/2026-05-12-workflow-hardening-memory-context-reliability.md",
        ],
        graphSymbols: ["buildLinkedEvidencePacket"],
      },
    ],
    memory: [
      {
        id: "workflow-hardening-memory-context-reliability",
        file: ".supervibe/memory/learnings/2026-05-12-workflow-hardening-memory-context-reliability.md",
        files: ["scripts/lib/supervibe-codegraph-ui-map.mjs"],
        symbols: ["buildLinkedEvidencePacket"],
        confidence: 10,
        date: "2026-05-12",
      },
    ],
  });

  assert.equal(packet.kind, "supervibe-linked-evidence-packet");
  assert.equal(packet.summary.files, 1);
  assert.equal(packet.summary.symbols, 1);
  assert.equal(packet.summary.workItems, 1);
  assert.equal(packet.summary.receipts, 1);
  assert.equal(packet.summary.memory, 1);
  assert.ok(packet.links.some((link) => link.type === "touches-file"));
  assert.ok(packet.links.some((link) => link.type === "touches-symbol"));
  assert.ok(packet.links.some((link) => link.type === "backed-by-receipt"));
  assert.ok(packet.links.some((link) => link.type === "uses-memory"));
  assert.match(formatLinkedEvidencePacket(packet), /SUPERVIBE_LINKED_EVIDENCE_PACKET/);
});

test("compact linked evidence packet flags stale and missing links", () => {
  const compact = buildCompactLinkedEvidencePacket({
    now: "2026-05-13T00:00:00.000Z",
    files: [{ path: "scripts/present.mjs" }],
    workItems: [
      {
        id: "T37",
        status: "claimed",
        updatedAt: "2026-03-01T00:00:00.000Z",
        files: ["scripts/missing.mjs"],
        receiptIds: ["missing-receipt"],
      },
    ],
  });

  assert.equal(compact.kind, "supervibe-compact-linked-evidence-packet");
  assert.ok(compact.summary.staleLinks >= 2);
  assert.ok(compact.evidence.staleLinks.some((link) => link.reason === "missing-file-link-target"));
  assert.ok(compact.evidence.staleLinks.some((link) => link.reason === "work-item-older-than-30-days"));
});

test("memory backfill extracts linked evidence references for candidates", () => {
  const text = "Decision: T37 accepted; use scripts/lib/supervibe-codegraph-ui-map.mjs:120, symbol:buildLinkedEvidencePacket, receipt:receipt-T37 and .supervibe/memory/learnings/2026-05-12-workflow-hardening-memory-context-reliability.md.";
  const refs = extractLinkedEvidenceRefs(text);
  assert.deepEqual(refs.workItems, ["T37"]);
  assert.ok(refs.files.includes("scripts/lib/supervibe-codegraph-ui-map.mjs:120"));
  assert.ok(refs.files.some((item) => item.includes(".supervibe/memory/learnings/2026-05-12-workflow-hardening-memory-context-reliability.md")));
  assert.ok(refs.symbols.includes("buildLinkedEvidencePacket"));
  assert.ok(refs.receipts.includes("receipt-T37"));

  const candidates = extractCandidatesFromText(text, {
    sourceKind: "plans",
    sourcePath: ".supervibe/memory/work-items/T37.md",
    line: 1,
    now: "2026-05-13T00:00:00.000Z",
  });
  assert.equal(candidates[0].candidateKind, "decision");
  assert.ok(candidates[0].linkedEvidence.files.includes("scripts/lib/supervibe-codegraph-ui-map.mjs:120"));
  assert.ok(candidates[0].linkedEvidence.symbols.includes("buildLinkedEvidencePacket"));
});
