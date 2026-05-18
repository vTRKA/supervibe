import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  applyReviewedMemoryBackfill,
  buildMemoryRelationshipGraph,
  extractCandidatesFromText,
  formatMemoryBackfillApplyReport,
  formatMemoryBackfillReport,
  formatMemoryRelationshipGraph,
  redactCandidateText,
  scanMemoryBackfill,
  backfillMemoryEntrySchema,
} from "../scripts/lib/supervibe-memory-backfill.mjs";
import { buildMemoryHealthReport, formatMemoryHealthReport } from "../scripts/lib/supervibe-memory-health.mjs";

const buildMemoryIndexScript = join(process.cwd(), "scripts", "build-memory-index.mjs");
const memoryBackfillScript = join(process.cwd(), "scripts", "supervibe-memory-backfill.mjs");
const searchMemoryScript = join(process.cwd(), "scripts", "search-memory.mjs");

test("memory backfill scanner finds decisions and bugs across artifact sources", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-memory-backfill-"));
  try {
    await writeFixture(rootDir, ".supervibe/artifacts/plans/runtime-plan.md", [
      "# Runtime plan",
      "Decision: Use workflow receipts as the source of truth for durable invocation proof.",
      "Bug: Fix missing handoff state when NEXT_STEP_HANDOFF is present.",
    ].join("\n"));
    await writeFixture(rootDir, ".supervibe/artifacts/plan-reviews/runtime-review.md", [
      "# Review",
      "Finding: regression caused reviewer receipts to be accepted without scoped agent proof.",
      "Accepted: keep the router preflight as a mandatory policy before broad source search.",
    ].join("\n"));
    await writeFixture(rootDir, ".supervibe/artifacts/_workflow-invocations/supervibe-loop/run/receipt.json", JSON.stringify({
      receipt: {
        decision: "Decision: bind worker outputs to runtime-issued workflow receipts.",
        finding: "Bug: failed receipt validation leaked a raw local path D:\\secret workspace\\repo\\file.txt.",
      },
    }, null, 2));
    await writeFixture(rootDir, ".supervibe/memory/effectiveness.jsonl", `${JSON.stringify({
      agent: "quality-gate-reviewer",
      outcome: "fix required because regression missed reviewer calibration",
    })}\n`);
    await writeFixture(rootDir, ".supervibe/confidence-log.jsonl", `${JSON.stringify({
      decision: "Decision: downgrade maturity when retrieval evidence is absent.",
      note: "bug report sent by maintainer@example.com with token=sk-123456789012345678901234567890",
    })}\n`);

    const report = await scanMemoryBackfill({
      rootDir,
      now: "2026-05-12T00:00:00.000Z",
      limit: 50,
    });

    assert.equal(report.mode, "dry-run");
    assert.equal(report.dryRun, true);
    assert.ok(report.candidates.some((candidate) => candidate.sourceKind === "plans" && candidate.candidateKind === "decision"));
    assert.ok(report.candidates.some((candidate) => candidate.sourceKind === "plans" && candidate.candidateKind === "bug"));
    assert.ok(report.candidates.some((candidate) => candidate.sourceKind === "reviews"));
    assert.ok(report.candidates.some((candidate) => candidate.sourceKind === "receipts"));
    assert.ok(report.candidates.some((candidate) => candidate.sourceKind === "effectiveness"));
    assert.ok(report.candidates.some((candidate) => candidate.sourceKind === "confidence"));
    assert.ok(report.candidates.some((candidate) => candidate.proposedMemoryType === "decision"));
    assert.ok(report.candidates.some((candidate) => candidate.proposedMemoryType === "incident"));

    const formatted = formatMemoryBackfillReport(report);
    assert.match(formatted, /MODE: dry-run/);
    assert.match(formatted, /SOURCE: \.supervibe\/artifacts\/plans\/runtime-plan\.md:2/);
    assert.match(formatted, /PROPOSED_TYPE: decision/);
    assert.match(formatted, /PROPOSED_TYPE: incident/);
    assert.doesNotMatch(formatted, /maintainer@example\.com/);
    assert.doesNotMatch(formatted, /sk-123456789012345678901234567890/);
    assert.doesNotMatch(formatted, /D:\\secret workspace/);
    assert.match(formatted, /\[REDACTED_EMAIL\]/);
    assert.match(formatted, /\[REDACTED_SECRET\]/);
    assert.match(formatted, /\[REDACTED_PATH\]/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("memory backfill scanner defaults to dry-run and only returns redacted candidate text", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-memory-backfill-redaction-"));
  try {
    await writeFixture(rootDir, ".supervibe/artifacts/plans/security-plan.md", [
      "Decision: rotate token=ghp_123456789012345678901234567890abcdef after user admin@example.com reported C:\\Users\\Ada\\repo\\secret.txt.",
    ].join("\n"));

    const report = await scanMemoryBackfill({ rootDir });
    assert.equal(report.mode, "dry-run");
    assert.equal(report.candidates.length, 1);
    assert.equal(report.candidates[0].proposedMemoryType, "decision");
    assert.doesNotMatch(report.candidates[0].evidence, /admin@example\.com/);
    assert.doesNotMatch(report.candidates[0].evidence, /ghp_/);
    assert.doesNotMatch(report.candidates[0].evidence, /C:\\Users/);
    assert.match(report.candidates[0].evidence, /\[REDACTED_EMAIL\]/);
    assert.match(report.candidates[0].evidence, /\[REDACTED_SECRET\]/);
    assert.match(report.candidates[0].evidence, /\[REDACTED_PATH\]/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("memory backfill redactor handles common standalone secrets", () => {
  const redacted = redactCandidateText([
    "Bug: Bearer eyJabcdefghij.klmnopqrst.uvwxyz123456 leaked to alice@example.com",
    "api_key=abcdef1234567890abcdef1234567890",
    "/Users/alice/private/project/file.md",
  ].join(" "));

  assert.doesNotMatch(redacted, /alice@example\.com/);
  assert.doesNotMatch(redacted, /abcdef1234567890abcdef1234567890/);
  assert.doesNotMatch(redacted, /\/Users\/alice/);
  assert.match(redacted, /\[REDACTED_EMAIL\]/);
  assert.match(redacted, /\[REDACTED_TOKEN\]|\[REDACTED_SECRET\]/);
  assert.match(redacted, /\[REDACTED_PATH\]/);
});

test("memory backfill extracts plan and review decisions, risks, blockers, and handoff questions", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-memory-backfill-plans-"));
  try {
    await writeFixture(rootDir, ".supervibe/artifacts/plans/worker-plan.md", [
      "Decision: keep handoff gates source-backed before promotion.",
      "Rejected scope: do not infer Kanban blocker closure from unreviewed notes.",
      "Accepted risk: memory thinness degrades readiness until source-backed answers exist.",
      "Handoff question: should RAG maps cite CodeGraph map freshness?",
    ].join("\n"));
    await writeFixture(rootDir, ".supervibe/artifacts/plan-reviews/worker-review.md", [
      "Blocker: provider config is missing required receipt proof.",
      "Finding: missing verification for receipt drift repair.",
    ].join("\n"));

    const report = await scanMemoryBackfill({
      rootDir,
      sourceKinds: ["plans", "reviews"],
      now: "2026-05-12T00:00:00.000Z",
      limit: 50,
    });
    const kinds = report.candidates.map((candidate) => candidate.candidateKind);

    assert.ok(kinds.includes("decision"));
    assert.ok(kinds.includes("rejected_scope"));
    assert.ok(kinds.includes("accepted_risk"));
    assert.ok(kinds.includes("handoff_question"));
    assert.ok(kinds.includes("blocker"));
    assert.ok(kinds.includes("missing_verification"));
    assert.ok(report.candidates.some((candidate) => candidate.candidateKind === "blocker" && candidate.status === "open"));
    assert.ok(!report.candidates.some((candidate) => candidate.candidateKind === "decision" && /provider config/.test(candidate.summary)));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("memory backfill extracts receipt and effectiveness signals with review dates", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-memory-backfill-logs-"));
  try {
    await writeFixture(rootDir, ".supervibe/artifacts/_workflow-invocations/loop/receipt.json", JSON.stringify({
      trustedReceiptClaim: "Trusted receipt claim: runtime-issued hostInvocation.source=codex-spawn-agent for reviewer.",
      missingVerification: "Missing verification: tests not run for workflow receipt ledger.",
      blocker: "Repeated blocker: receipt drift blocked repeatedly across three runs.",
    }, null, 2));
    await writeFixture(rootDir, ".supervibe/memory/effectiveness.jsonl", [
      JSON.stringify({ outcome: "Partial outcome: worker produced draft only", blocker: "blocked repeatedly by provider config", reviewAfter: "2026-05-20" }),
      JSON.stringify({ note: "Observation: transient queue depth changed during run" }),
    ].join("\n"));

    const report = await scanMemoryBackfill({
      rootDir,
      sourceKinds: ["receipts", "effectiveness"],
      now: "2026-05-12T00:00:00.000Z",
      limit: 50,
    });
    const kinds = report.candidates.map((candidate) => candidate.candidateKind);

    assert.ok(kinds.includes("trusted_receipt_claim"));
    assert.ok(kinds.includes("missing_verification"));
    assert.ok(kinds.includes("repeated_blocker"));
    assert.ok(kinds.includes("partial_outcome"));
    assert.ok(report.candidates.every((candidate) => candidate.reviewAfter));
    assert.ok(report.candidates.some((candidate) => candidate.reviewAfter === "2026-06-11"));
    assert.ok(report.candidates.some((candidate) => candidate.reviewAfter === "2026-05-20"));
    assert.ok(!report.candidates.some((candidate) => /transient queue depth/.test(candidate.summary)));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("memory backfill collapses duplicate candidates and does not promote open blockers to decisions", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-memory-backfill-dedupe-"));
  try {
    await writeFixture(rootDir, ".supervibe/artifacts/plans/a.md", "Decision: use source-backed handoff gates for review.");
    await writeFixture(rootDir, ".supervibe/artifacts/plans/b.md", "Decision: use source-backed handoff gates for review.");
    const report = await scanMemoryBackfill({
      rootDir,
      sourceKinds: ["plans"],
      now: "2026-05-12T00:00:00.000Z",
      limit: 50,
    });
    assert.equal(report.candidates.filter((candidate) => candidate.candidateKind === "decision").length, 1);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }

  const candidates = [
    ...extractCandidatesFromText("Blocker: provider config must be fixed before handoff gates pass.", {
      sourceKind: "reviews",
      sourcePath: ".supervibe/artifacts/plan-reviews/a.md",
      line: 1,
      now: "2026-05-12T00:00:00.000Z",
    }),
    ...extractCandidatesFromText("Observation: transient provider config must be watched during the next run.", {
      sourceKind: "reviews",
      sourcePath: ".supervibe/artifacts/plan-reviews/a.md",
      line: 2,
      now: "2026-05-12T00:00:00.000Z",
    }),
  ];

  assert.ok(candidates.some((candidate) => candidate.candidateKind === "blocker" && candidate.status === "open"));
  assert.ok(!candidates.some((candidate) => candidate.candidateKind === "decision"));
});

test("memory search orders active decisions before superseded history and flags contradictions", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-memory-search-supersession-"));
  try {
    const decisionsDir = join(rootDir, ".supervibe", "memory", "decisions");
    await mkdir(decisionsDir, { recursive: true });
    await writeFile(join(decisionsDir, "old-provider.md"), [
      "---",
      "id: provider-config-v1",
      "type: decision",
      "date: 2025-01-01",
      "tags: [provider, config]",
      "agent: test-agent",
      "confidence: 9",
      "---",
      "Provider config uses legacy receipt proof fallback defaults.",
    ].join("\n"), "utf8");
    await writeFile(join(decisionsDir, "new-provider.md"), [
      "---",
      "id: provider-config-v2",
      "type: decision",
      "date: 2026-05-12",
      "tags: [provider, config]",
      "supersedes: [provider-config-v1]",
      "agent: test-agent",
      "confidence: 10",
      "---",
      "Provider config uses source-backed defaults and receipt proof.",
    ].join("\n"), "utf8");
    await writeFile(join(decisionsDir, "contradiction.md"), [
      "---",
      "id: provider-config-conflict",
      "type: decision",
      "date: 2026-05-13",
      "tags: [provider, config]",
      "contradicts: [provider-config-v1]",
      "agent: test-agent",
      "confidence: 8",
      "---",
      "Provider config should ignore receipt proof.",
    ].join("\n"), "utf8");

    execFileSync(process.execPath, [buildMemoryIndexScript, "--now", "2026-05-13T00:00:00.000Z"], {
      cwd: rootDir,
      encoding: "utf8",
    });
    const currentOnly = execFileSync(process.execPath, [searchMemoryScript, "--query", "provider config receipt proof", "--limit", "5"], {
      cwd: rootDir,
      encoding: "utf8",
    });
    const withHistory = execFileSync(process.execPath, [searchMemoryScript, "--query", "provider config receipt proof", "--limit", "5", "--include-history"], {
      cwd: rootDir,
      encoding: "utf8",
    });
    const graphOutput = execFileSync(process.execPath, [searchMemoryScript, "--query", "provider config receipt proof", "--limit", "5", "--include-history", "--graph"], {
      cwd: rootDir,
      encoding: "utf8",
    });

    assert.match(currentOnly, /provider-config-v2/);
    assert.doesNotMatch(currentOnly, /provider-config-v1/);
    assert.doesNotMatch(currentOnly, /provider-config-conflict/);
    assert.ok(withHistory.indexOf("provider-config-v2") < withHistory.indexOf("provider-config-v1"));
    assert.match(withHistory, /provider-config-conflict/);
    assert.match(withHistory, /Review: contradiction review needed/);
    assert.match(withHistory, /Superseded by: provider-config-v2/);
    assert.match(graphOutput, /SUPERVIBE_MEMORY_RELATIONSHIP_GRAPH/);
    assert.match(graphOutput, /EDGE: memory:provider-config-v2 -supersedes-> memory:provider-config-v1 confidence=10 source=\.supervibe\/memory\/decisions\/new-provider\.md/);
    assert.match(graphOutput, /EDGE: memory:provider-config-conflict -contradicts-> memory:provider-config-v1 confidence=8 source=\.supervibe\/memory\/decisions\/contradiction\.md/);
    assert.match(graphOutput, /SUPERVIBE_MEMORY_SEARCH_QUALITY/);
    assert.match(graphOutput, /STATUS: not-mature/);
    assert.match(graphOutput, /REPAIR_COMMAND: node scripts\/supervibe-memory-backfill\.mjs --source all/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("memory golden queries cover required source-backed readiness topics", async () => {
  const raw = await readFile(join(process.cwd(), "tests", "fixtures", "memory", "golden-queries.json"), "utf8");
  const fixture = JSON.parse(raw);
  const topics = new Set(fixture.queries.map((query) => query.topic));

  for (const topic of [
    "handoff-gates",
    "kanban-blockers",
    "memory-thinness",
    "rag-maps",
    "codegraph-maps",
    "receipt-drift",
    "provider-config",
    "degrade-readiness",
  ]) {
    assert.ok(topics.has(topic), `missing golden query topic: ${topic}`);
  }
  assert.ok(fixture.queries.every((query) => query.requiresSourceBackedAnswer === true));
  assert.ok(fixture.queries.find((query) => query.topic === "degrade-readiness").expectedBehavior.toLowerCase().includes("degrade"));
});

test("memory health gate downgrades thin large-project memory and reports coverage repairs", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-memory-health-gate-"));
  try {
    const decisionsDir = join(rootDir, ".supervibe", "memory", "decisions");
    await mkdir(decisionsDir, { recursive: true });
    for (let index = 1; index <= 11; index += 1) {
      await writeFile(join(decisionsDir, `decision-${index}.md`), [
        "---",
        `id: decision-${index}`,
        "type: decision",
        "date: 2026-05-12",
        "tags: [memory]",
        "agent: test-agent",
        "confidence: 9",
        "---",
        `Decision ${index}: memory-only coverage is too thin for full Supervibe maturity.`,
      ].join("\n"), "utf8");
    }
    await writeFixture(rootDir, ".supervibe/artifacts/plans/runtime-plan.md", [
      "Decision: add RAG, CodeGraph, UI, provider config, receipt, and loop memory coverage.",
      "Bug: missing source-backed memory coverage should produce repair candidates.",
    ].join("\n"));

    const report = await buildMemoryHealthReport({
      rootDir,
      now: "2026-05-12T00:00:00.000Z",
      changedFiles: [],
    });

    assert.equal(report.pass, false);
    assert.equal(report.qualityGate.status, "not-mature");
    assert.ok(report.maturityScore < 10);
    assert.equal(report.qualityGate.minEntries, 20);
    assert.equal(report.qualityGate.entries, 11);
    assert.ok(report.qualityGate.missingSubsystems.includes("rag"));
    assert.ok(report.qualityGate.missingSubsystems.includes("codegraph"));
    assert.ok(report.qualityGate.backfillCandidateCount >= 2);
    assert.match(report.qualityGate.repairCommand, /supervibe-memory-backfill\.mjs --source all/);
    assert.equal(report.qualityGate.freshness.fresh, 11);

    const formatted = formatMemoryHealthReport(report);
    assert.match(formatted, /QUALITY_GATE: not-mature/);
    assert.match(formatted, /SUBSYSTEM_COVERAGE:/);
    assert.match(formatted, /MISSING_SUBSYSTEMS: .*rag/);
    assert.match(formatted, /BACKFILL_CANDIDATES: [2-9]\d*/);
    assert.match(formatted, /REPAIR_COMMAND: node scripts\/supervibe-memory-backfill\.mjs --source all/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("new memory entries require source-backed schema fields without breaking legacy search", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-memory-schema-"));
  try {
    const valid = join(rootDir, ".supervibe", "memory", "decisions", "valid.md");
    const invalid = join(rootDir, ".supervibe", "memory", "decisions", "invalid.md");
    await mkdir(dirname(valid), { recursive: true });
    await writeFile(valid, [
      "---",
      "id: memory-schema-valid",
      "type: decision",
      "date: 2026-05-12",
      "tags: [memory, schema]",
      "agent: test-agent",
      "confidence: 10",
      "sourceArtifact: .supervibe/artifacts/plans/runtime-plan.md",
      "owner: memory-curator",
      "freshness: current",
      "relationships: [runtime-plan]",
      "---",
      "Memory entries must carry source-backed metadata for agent retrieval.",
    ].join("\n"), "utf8");
    await writeFile(invalid, [
      "---",
      "id: memory-schema-invalid",
      "type: decision",
      "date: 2026-05-12",
      "tags: [memory]",
      "agent: test-agent",
      "confidence: 10",
      "---",
      "Missing source and relationship fields should fail new-entry validation.",
    ].join("\n"), "utf8");
    await writeFile(join(rootDir, ".supervibe", "memory", "decisions", "legacy.md"), [
      "---",
      "id: memory-schema-legacy",
      "type: decision",
      "date: 2025-01-01",
      "tags: [memory]",
      "agent: test-agent",
      "confidence: 8",
      "---",
      "Legacy memory remains readable even without the new schema fields.",
    ].join("\n"), "utf8");

    const validOutput = execFileSync(process.execPath, [searchMemoryScript, "--validate-entry", valid], {
      cwd: rootDir,
      encoding: "utf8",
    });
    assert.match(validOutput, /PASS: true/);

    let invalidOutput = "";
    assert.throws(() => {
      try {
        execFileSync(process.execPath, [searchMemoryScript, "--validate-entry", invalid], {
          cwd: rootDir,
          encoding: "utf8",
          stdio: "pipe",
        });
      } catch (error) {
        invalidOutput = `${error.stdout || ""}${error.stderr || ""}`;
        throw error;
      }
    });
    assert.match(invalidOutput, /missing required field: sourceArtifact/);

    execFileSync(process.execPath, [buildMemoryIndexScript], { cwd: rootDir, encoding: "utf8" });
    const legacySearch = execFileSync(process.execPath, [searchMemoryScript, "--query", "legacy memory readable", "--limit", "5", "--include-history"], {
      cwd: rootDir,
      encoding: "utf8",
    });
    assert.match(legacySearch, /memory-schema-legacy/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("memory schema backfill writes required retrieval fields with reversible evidence", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-memory-schema-backfill-"));
  try {
    const memoryPath = join(rootDir, ".supervibe", "memory", "decisions", "legacy-schema.md");
    await mkdir(dirname(memoryPath), { recursive: true });
    await writeFile(memoryPath, [
      "---",
      "id: legacy-schema",
      "type: decision",
      "date: 2026-05-12",
      "---",
      "Legacy entry needs schema repair.",
    ].join("\n"), "utf8");

    const report = await backfillMemoryEntrySchema({
      rootDir,
      now: "2026-05-12T00:00:00.000Z",
      dryRun: false,
    });

    assert.equal(report.writeEnabled, true);
    assert.equal(report.changed.length, 1);
    assert.ok(report.changed[0].changes.includes("tags"));
    assert.ok(report.changed[0].changes.includes("agent"));
    assert.ok(report.changed[0].changes.includes("confidence"));
    assert.ok(report.snapshotPath.endsWith(".json"));
    assert.ok(report.reportPath.endsWith(".json"));

    const repaired = await readFile(memoryPath, "utf8");
    assert.match(repaired, /tags: \[memory, decision\]/);
    assert.match(repaired, /agent: memory-curator/);
    assert.match(repaired, /confidence: 8/);
    assert.match(repaired, /sourceArtifact: \.supervibe\/memory\/decisions\/legacy-schema\.md/);
    assert.match(repaired, /relationships: \["evidence-for:\.supervibe\/memory\/decisions\/legacy-schema\.md"\]/);

    const snapshot = JSON.parse(await readFile(join(rootDir, report.snapshotPath), "utf8"));
    assert.equal(snapshot.kind, "supervibe-memory-schema-backfill-snapshot");
    assert.equal(snapshot.files[0].content.includes("Legacy entry needs schema repair."), true);
    const reportFile = JSON.parse(await readFile(join(rootDir, report.reportPath), "utf8"));
    assert.equal(reportFile.changed.length, 1);

    const validateOutput = execFileSync(process.execPath, [searchMemoryScript, "--validate-entry", memoryPath], {
      cwd: rootDir,
      encoding: "utf8",
    });
    assert.match(validateOutput, /PASS: true/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
test("memory relationship graph supports typed source-backed links for UI consumption", () => {
  const graph = buildMemoryRelationshipGraph([
    {
      id: "runtime-plan",
      type: "decision",
      date: "2026-05-12",
      tags: ["workflow"],
      confidence: 10,
      file: ".supervibe/memory/decisions/runtime-plan.md",
      sourceArtifact: ".supervibe/artifacts/plans/runtime-plan.md",
      relationships: [
        "relates-to:ui-refresh",
        { type: "caused-by", target: "handoff-question-loss", confidence: 9, source: ".supervibe/artifacts/check-logs/handoff.md" },
        { type: "fixes", target: "receipt-drift", reason: "runtime receipts become source-backed" },
        { type: "evidence-for", target: ".supervibe/artifacts/plans/runtime-plan.md" },
      ],
    },
    {
      id: "ui-refresh",
      type: "learning",
      date: "2026-05-12",
      tags: ["ui"],
      confidence: 9,
      file: ".supervibe/memory/learnings/ui-refresh.md",
      related: ["runtime-plan"],
      supersedes: ["old-kanban"],
      contradicts: ["sparse-memory-map"],
    },
  ], {
    rootId: "runtime-plan",
    maxNodes: 8,
    maxEdges: 8,
  });

  assert.equal(graph.kind, "supervibe-memory-relationship-map");
  assert.equal(graph.relationshipMapRole, "source-backed-neighborhood");
  assert.equal(graph.bounded, true);
  assert.equal(graph.completeness, "declared-links-only");
  assert.deepEqual(graph.supportedRelationshipTypes, [
    "relates-to",
    "supersedes",
    "contradicts",
    "caused-by",
    "fixes",
    "evidence-for",
  ]);

  const edgeTypes = new Set(graph.edges.map((edge) => edge.type));
  for (const type of graph.supportedRelationshipTypes) assert.ok(edgeTypes.has(type), `missing edge type: ${type}`);
  assert.ok(graph.edges.every((edge) => Number.isFinite(edge.confidence)));
  assert.ok(graph.edges.every((edge) => edge.source));
  assert.ok(graph.edges.some((edge) => edge.type === "caused-by" && edge.confidence === 9));
  assert.ok(graph.summary.relationshipTypes["relates-to"] >= 1);
  assert.match(graph.uiHints.sparseGraphPolicy, /declared/i);

  const formatted = formatMemoryRelationshipGraph(graph);
  assert.match(formatted, /SUPERVIBE_MEMORY_RELATIONSHIP_GRAPH/);
  assert.match(formatted, /ROLE: source-backed-neighborhood/);
  assert.match(formatted, /SPARSE_POLICY:/);
  assert.match(formatted, /EDGE: memory:runtime-plan -fixes-> memory:receipt-drift confidence=10/);
});

test("reviewed memory backfill apply writes receipt-bound entries with snapshot and report", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-memory-apply-"));
  try {
    await writeFixture(rootDir, ".supervibe/artifacts/plans/runtime-plan.md", [
      "Decision: keep source-backed memory gates for durable handoffs.",
      "Decision: duplicate candidate should not be imported twice.",
      "Decision: token=sk-123456789012345678901234567890 should be rejected.",
    ].join("\n"));
    await writeFixture(rootDir, ".supervibe/memory/decisions/legacy-memory-gates.md", [
      "---",
      "id: legacy-memory-gates",
      "type: decision",
      "date: 2025-01-01",
      "tags: [memory]",
      "agent: test-agent",
      "confidence: 8",
      "---",
      "Legacy memory gates did not require reviewed source citations.",
    ].join("\n"));

    const candidates = [
      {
        id: "candidate-reviewed",
        memoryId: "source-backed-memory-gates",
        candidateKind: "decision",
        proposedMemoryType: "decision",
        reviewStatus: "approved",
        sourceKind: "plans",
        sourcePath: ".supervibe/artifacts/plans/runtime-plan.md",
        line: 1,
        summary: "Keep source-backed memory gates for durable handoffs.",
        evidence: "Decision: keep source-backed memory gates for durable handoffs.",
        supersedes: ["legacy-memory-gates"],
        relationships: ["fixes:handoff-memory-loss"],
        tags: ["memory", "handoff"],
      },
      {
        id: "candidate-duplicate",
        memoryId: "source-backed-memory-gates",
        candidateKind: "decision",
        proposedMemoryType: "decision",
        reviewed: true,
        sourceKind: "plans",
        sourcePath: ".supervibe/artifacts/plans/runtime-plan.md",
        line: 2,
        summary: "Duplicate candidate should not be imported twice.",
        evidence: "Decision: duplicate candidate should not be imported twice.",
      },
      {
        id: "candidate-not-reviewed",
        candidateKind: "decision",
        proposedMemoryType: "decision",
        sourceKind: "plans",
        sourcePath: ".supervibe/artifacts/plans/runtime-plan.md",
        line: 1,
        summary: "Unreviewed candidate.",
        evidence: "Decision: unreviewed candidate.",
      },
      {
        id: "candidate-source-less",
        candidateKind: "decision",
        proposedMemoryType: "decision",
        reviewed: true,
        summary: "Source-less candidate.",
        evidence: "Decision: source-less candidate.",
      },
      {
        id: "candidate-secret",
        candidateKind: "decision",
        proposedMemoryType: "decision",
        reviewed: true,
        sourceKind: "plans",
        sourcePath: ".supervibe/artifacts/plans/runtime-plan.md",
        line: 3,
        summary: "Secret candidate.",
        evidence: "Decision: token=sk-123456789012345678901234567890 should be rejected.",
      },
    ];

    const result = await applyReviewedMemoryBackfill({
      rootDir,
      candidates,
      receiptId: "workflow-test-receipt",
      now: "2026-05-12T00:00:00.000Z",
    });

    assert.equal(result.mode, "apply");
    assert.equal(result.added.length, 1);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.rejected.length, 3);
    assert.deepEqual(result.superseded.map((item) => item.id), ["legacy-memory-gates"]);
    assert.ok(result.snapshotPath.endsWith(".json"));
    assert.ok(result.reportPath.endsWith(".json"));

    const memoryEntry = await readFile(join(rootDir, ".supervibe/memory/decisions/source-backed-memory-gates.md"), "utf8");
    assert.match(memoryEntry, /receiptId: workflow-test-receipt/);
    assert.match(memoryEntry, /sourceArtifact: "\.supervibe\/artifacts\/plans\/runtime-plan\.md:1"/);
    assert.match(memoryEntry, /relationships: \["fixes:handoff-memory-loss", "evidence-for:\.supervibe\/artifacts\/plans\/runtime-plan\.md:1"\]/);
    assert.match(memoryEntry, /supersedes: \[legacy-memory-gates\]/);
    assert.doesNotMatch(memoryEntry, /sk-123456789012345678901234567890/);

    const snapshot = JSON.parse(await readFile(join(rootDir, result.snapshotPath), "utf8"));
    assert.equal(snapshot.receiptId, "workflow-test-receipt");
    assert.equal(snapshot.files[0].path, ".supervibe/memory/decisions/source-backed-memory-gates.md");
    assert.equal(snapshot.files[0].existed, false);

    const reportFile = JSON.parse(await readFile(join(rootDir, result.reportPath), "utf8"));
    assert.equal(reportFile.added.length, 1);
    assert.equal(reportFile.skipped[0].reason, "duplicate-memory-id");
    assert.ok(reportFile.rejected.some((item) => item.reason === "not-reviewed"));
    assert.ok(reportFile.rejected.some((item) => item.reason === "missing-source-citation"));
    assert.ok(reportFile.rejected.some((item) => item.reason === "unredacted-secret"));

    const formatted = formatMemoryBackfillApplyReport(result);
    assert.match(formatted, /SUPERVIBE_MEMORY_BACKFILL_APPLY/);
    assert.match(formatted, /RECEIPT_ID: workflow-test-receipt/);
    assert.match(formatted, /ADDED: 1/);
    assert.match(formatted, /REJECTED: 3/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("memory backfill CLI apply requires reviewed candidates and receipt id", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-memory-apply-cli-"));
  try {
    await writeFixture(rootDir, ".supervibe/artifacts/plans/runtime-plan.md", "Decision: CLI apply keeps reviewed memory.");
    const reviewFile = join(rootDir, "reviewed-candidates.json");
    await writeFile(reviewFile, JSON.stringify({
      candidates: [
        {
          id: "candidate-cli",
          memoryId: "cli-reviewed-memory",
          candidateKind: "decision",
          proposedMemoryType: "decision",
          reviewed: true,
          sourceKind: "plans",
          sourcePath: ".supervibe/artifacts/plans/runtime-plan.md",
          line: 1,
          summary: "CLI apply keeps reviewed memory.",
          evidence: "Decision: CLI apply keeps reviewed memory.",
        },
      ],
    }, null, 2), "utf8");

    const output = execFileSync(process.execPath, [
      memoryBackfillScript,
      "--apply",
      "--root",
      rootDir,
      "--reviewed",
      reviewFile,
      "--receipt",
      "workflow-cli-receipt",
      "--now",
      "2026-05-12T00:00:00.000Z",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    assert.match(output, /SUPERVIBE_MEMORY_BACKFILL_APPLY/);
    assert.match(output, /ADDED: 1/);
    assert.match(await readFile(join(rootDir, ".supervibe/memory/decisions/cli-reviewed-memory.md"), "utf8"), /receiptId: workflow-cli-receipt/);

    assert.throws(() => {
      execFileSync(process.execPath, [memoryBackfillScript, "--apply", "--root", rootDir, "--reviewed", reviewFile], {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: "pipe",
      });
    });
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

async function writeFixture(rootDir, relativePath, content) {
  const fullPath = join(rootDir, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, `${content}\n`, "utf8");
}
