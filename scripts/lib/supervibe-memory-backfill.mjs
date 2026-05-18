import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, extname, join, relative, sep } from "node:path";
import matter from "gray-matter";

const DEFAULT_LIMIT = 100;
const DEFAULT_MAX_FILE_BYTES = 512 * 1024;
const MEMORY_APPLY_SNAPSHOT_DIR = ".supervibe/memory/backfill-snapshots";
const MEMORY_APPLY_REPORT_DIR = ".supervibe/memory/backfill-reports";
const MEMORY_TYPE_DIRS = Object.freeze({
  decision: "decisions",
  incident: "incidents",
  learning: "learnings",
  pattern: "patterns",
  solution: "solutions",
});

const MEMORY_BACKFILL_SOURCES = Object.freeze({
  plans: Object.freeze([
    ".supervibe/artifacts/plans",
    ".supervibe/memory/work-items",
  ]),
  reviews: Object.freeze([
    ".supervibe/artifacts/plan-reviews",
    ".supervibe/artifacts/check-logs",
  ]),
  receipts: Object.freeze([
    ".supervibe/artifacts/_workflow-invocations",
    ".supervibe/artifacts/_workflow-transactions",
    ".supervibe/memory/workflow-receipts",
    ".supervibe/memory/policy",
  ]),
  effectiveness: Object.freeze([
    ".supervibe/memory/effectiveness.jsonl",
    ".supervibe/memory/agent-invocations.jsonl",
  ]),
  confidence: Object.freeze([
    ".supervibe/confidence-log.jsonl",
    ".supervibe/memory/confidence-log.jsonl",
  ]),
});

const SUPPORTED_EXTENSIONS = new Set([".md", ".txt", ".json", ".jsonl"]);
const DECISION_PATTERNS = [
  /\bdecision\b/i,
  /\bdecided\b/i,
  /\bchoose\b/i,
  /\bchosen\b/i,
  /\bapproved\b/i,
  /\baccepted\b/i,
  /\bpolicy\b/i,
  /\bsource of truth\b/i,
];
const BUG_PATTERNS = [
  /\bbug\b/i,
  /\bfix(?:ed|es)?\b/i,
  /\bfailure\b/i,
  /\bfailed\b/i,
  /\bregression\b/i,
  /\bincident\b/i,
  /\bbroken\b/i,
  /\bmissing\b/i,
  /\berror\b/i,
  /\broot cause\b/i,
  /\bleak(?:ed|s)?\b/i,
];
const REJECTED_SCOPE_PATTERNS = [
  /\brejected scope\b/i,
  /\bout of scope\b/i,
  /\bnot in scope\b/i,
  /\bdefer(?:red)?\b/i,
  /\bwill not\b/i,
  /\bwon't\b/i,
];
const ACCEPTED_RISK_PATTERNS = [
  /\baccepted risk\b/i,
  /\brisk accepted\b/i,
  /\bknown risk\b/i,
  /\bresidual risk\b/i,
];
const BLOCKER_PATTERNS = [
  /\bblocker\b/i,
  /\bblocked\b/i,
  /\bhard stop\b/i,
  /\bcannot proceed\b/i,
  /\bcan't proceed\b/i,
  /\bwaiting on\b/i,
];
const HANDOFF_QUESTION_PATTERNS = [
  /\bhandoff question\b/i,
  /\bopen question\b/i,
  /\bquestion for\b/i,
  /\bneeds answer\b/i,
  /\?\s*$/i,
];
const PARTIAL_OUTCOME_PATTERNS = [
  /\bpartial outcome\b/i,
  /\bpartially complete\b/i,
  /\bpartially done\b/i,
  /\bincomplete\b/i,
  /\bnot complete\b/i,
];
const MISSING_VERIFICATION_PATTERNS = [
  /\bmissing verification\b/i,
  /\bnot verified\b/i,
  /\bunverified\b/i,
  /\bverification absent\b/i,
  /\bwithout verification\b/i,
  /\bno verification\b/i,
  /\btests? not run\b/i,
];
const TRUSTED_RECEIPT_PATTERNS = [
  /\btrusted receipt\b/i,
  /\bruntime-issued\b/i,
  /\bworkflow receipt\b/i,
  /\breceipt claim\b/i,
  /\bhostInvocation\b/i,
  /\bcodex-spawn-agent\b/i,
];
const REPEATED_BLOCKER_PATTERNS = [
  /\brepeated blocker\b/i,
  /\brecurring blocker\b/i,
  /\bblocked repeatedly\b/i,
  /\bmultiple blockers\b/i,
  /\bblocker count\b/i,
];
const LOW_SIGNAL_PATTERNS = [
  /^items_detail:/i,
  /^ready:/i,
  /^scope=/i,
  /^gates=/i,
  /^blockedby=/i,
];
const TRANSIENT_OBSERVATION_PATTERNS = [
  /^\s*(?:note|observation|status|progress)\s*[:=-]/i,
  /\btransient\b/i,
  /\btemporary observation\b/i,
];
const LOG_DERIVED_SOURCE_KINDS = new Set(["receipts", "effectiveness", "confidence"]);
const FILE_REF_PATTERN = /(?:\b(?:AGENTS\.md|README\.md|package\.json|agents\/[A-Za-z0-9._/-]+|skills\/[A-Za-z0-9._/-]+|rules\/[A-Za-z0-9._/-]+|commands\/[A-Za-z0-9._/-]+|scripts\/[A-Za-z0-9._/-]+|tests\/[A-Za-z0-9._/-]+|docs\/[A-Za-z0-9._/-]+)|\.supervibe\/memory\/[A-Za-z0-9._/-]+)(?::\d+(?:-\d+)?)?/g;
const WORK_ITEM_REF_PATTERN = /\b(?:T\d+[A-Za-z0-9._-]*|work-item:[A-Za-z0-9._:-]+|epic-[A-Za-z0-9._:-]+)\b/g;
const RECEIPT_REF_PATTERN = /\b(?:receipt:[A-Za-z0-9._:-]+|workflow-receipt:[A-Za-z0-9._:-]+|[A-Za-z0-9._-]*receipt[A-Za-z0-9._:-]*)\b/g;
const SYMBOL_REF_PATTERN = /\bsymbol:[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)?|\b[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)?\(\)?\b/g;
const SYMBOL_STOP_WORDS = new Set([
  "decision", "decided", "choose", "chosen", "approved", "accepted", "policy", "source",
  "truth", "bug", "fix", "failure", "failed", "regression", "incident", "broken",
  "missing", "error", "root", "cause", "blocker", "blocked", "receipt", "workflow",
  "memory", "evidence", "status", "review", "after", "tests", "not", "run",
]);
const MEMORY_RELATIONSHIP_TYPES = Object.freeze([
  "relates-to",
  "supersedes",
  "contradicts",
  "caused-by",
  "fixes",
  "evidence-for",
]);
const MEMORY_RELATIONSHIP_TYPE_SET = new Set(MEMORY_RELATIONSHIP_TYPES);

export async function scanMemoryBackfill({
  rootDir = process.cwd(),
  sourceKinds = Object.keys(MEMORY_BACKFILL_SOURCES),
  limit = DEFAULT_LIMIT,
  now = new Date().toISOString(),
  maxFileBytes = DEFAULT_MAX_FILE_BYTES,
} = {}) {
  const normalizedKinds = normalizeSourceKinds(sourceKinds);
  const files = [];
  for (const sourceKind of normalizedKinds) {
    for (const sourceRoot of MEMORY_BACKFILL_SOURCES[sourceKind] || []) {
      files.push(...await collectSourceFiles({
        rootDir,
        sourceKind,
        sourceRoot,
        maxFileBytes,
      }));
    }
  }

  const candidates = [];
  for (const file of files) {
    const raw = await readFile(file.absPath, "utf8");
    for (const record of recordsFromFile(raw, file)) {
      candidates.push(...extractCandidatesFromText(record.text, {
        sourceKind: file.sourceKind,
        sourcePath: file.sourcePath,
        line: record.line,
        now,
      }));
    }
  }

  const deduped = dedupeCandidates(candidates).slice(0, positiveInt(limit, DEFAULT_LIMIT));
  return {
    schemaVersion: 1,
    generatedAt: now,
    mode: "dry-run",
    dryRun: true,
    scannedFiles: files.length,
    sourceCounts: countBy(files, "sourceKind"),
    candidateCounts: countBy(deduped, "candidateKind"),
    candidates: deduped,
  };
}

export async function applyReviewedMemoryBackfill({
  rootDir = process.cwd(),
  candidates = [],
  reviewedFile = null,
  receiptId = "",
  now = new Date().toISOString(),
  dryRun = false,
} = {}) {
  const reviewedCandidates = reviewedFile
    ? await readReviewedCandidatesFile(reviewedFile)
    : (Array.isArray(candidates) ? candidates : []);
  const normalizedReceiptId = String(receiptId || "").trim();
  if (!normalizedReceiptId) throw new Error("apply requires receipt id");

  const report = {
    schemaVersion: 1,
    mode: dryRun ? "dry-run-apply" : "apply",
    generatedAt: now,
    rootDir,
    receiptId: normalizedReceiptId,
    reviewedOnly: true,
    added: [],
    skipped: [],
    superseded: [],
    rejected: [],
    snapshotPath: "",
    reportPath: "",
  };

  const accepted = [];
  const plannedIds = new Set();
  const existingIds = await readExistingMemoryIds({ rootDir });
  for (const candidate of reviewedCandidates) {
    const decision = validateReviewedMemoryCandidate(candidate, {
      receiptId: normalizedReceiptId,
      existingIds,
      plannedIds,
    });
    if (!decision.pass) {
      report.rejected.push(buildApplyReportItem(candidate, decision.reason));
      continue;
    }
    if (decision.skip) {
      report.skipped.push(buildApplyReportItem(candidate, decision.reason, decision.entry));
      continue;
    }
    accepted.push(decision.entry);
    plannedIds.add(decision.entry.memoryId);
    for (const supersededId of decision.entry.supersedes) {
      report.superseded.push({
        id: supersededId,
        by: decision.entry.memoryId,
        source: decision.entry.sourceArtifact,
      });
    }
  }

  const snapshot = await createMemoryBackfillSnapshot({
    rootDir,
    entries: accepted,
    receiptId: normalizedReceiptId,
    now,
  });
  report.snapshotPath = snapshot.path;

  if (!dryRun) {
    for (const entry of accepted) {
      await ensureParentDir(join(rootDir, entry.path));
      await writeFile(join(rootDir, entry.path), renderMemoryBackfillEntry(entry), "utf8");
      report.added.push({
        id: entry.memoryId,
        path: entry.path,
        type: entry.type,
        source: entry.sourceArtifact,
        receiptId: normalizedReceiptId,
      });
    }
  } else {
    for (const entry of accepted) {
      report.added.push({
        id: entry.memoryId,
        path: entry.path,
        type: entry.type,
        source: entry.sourceArtifact,
        receiptId: normalizedReceiptId,
        dryRun: true,
      });
    }
  }

  report.reportPath = await writeMemoryBackfillApplyReport({ rootDir, report, now, dryRun });
  return report;
}

export async function backfillMemoryEntrySchema({
  rootDir = process.cwd(),
  now = new Date().toISOString(),
  dryRun = true,
} = {}) {
  const files = await collectMemoryEntryMarkdownFiles({ rootDir });
  const writeEnabled = dryRun === false;
  const report = {
    schemaVersion: 1,
    mode: "schema-backfill",
    dryRun: !writeEnabled,
    writeEnabled,
    generatedAt: now,
    scannedFiles: files.length,
    changed: [],
    unchanged: [],
    snapshotPath: "",
    reportPath: "",
  };
  const pendingWrites = [];

  for (const file of files) {
    const raw = await readFile(file.absPath, "utf8");
    const parsed = matter(raw);
    const normalized = normalizeMemoryEntrySchemaData(parsed.data || {}, {
      relPath: file.relPath,
      fallbackType: file.type,
    });
    const needsInlineArrayFormat = memoryFrontmatterHasBlockArrays(raw);
    if (!normalized.changed && !needsInlineArrayFormat) {
      report.unchanged.push({ path: file.relPath });
      continue;
    }
    if (needsInlineArrayFormat) normalized.changes.push("frontmatter-array-format");
    const nextRaw = renderMemoryEntryMarkdown(parsed.content || "", normalized.data);
    report.changed.push({
      path: file.relPath,
      changes: normalized.changes,
    });
    pendingWrites.push({
      path: file.relPath,
      absPath: file.absPath,
      previousContent: raw,
      nextContent: nextRaw.endsWith("\n") ? nextRaw : `${nextRaw}\n`,
    });
  }

  if (writeEnabled) {
    if (pendingWrites.length > 0) {
      const snapshot = await createMemorySchemaBackfillSnapshot({ rootDir, writes: pendingWrites, now });
      report.snapshotPath = snapshot.path;
    }
    report.reportPath = await writeMemorySchemaBackfillReport({ rootDir, report, now });
    for (const pending of pendingWrites) {
      await writeFile(pending.absPath, pending.nextContent, "utf8");
    }
  }

  return report;
}

export function formatMemorySchemaBackfillReport(report = {}) {
  const lines = [
    "SUPERVIBE_MEMORY_SCHEMA_BACKFILL",
    `MODE: ${report.mode || "schema-backfill"}`,
    `DRY_RUN: ${report.dryRun !== false}`,
    `SCANNED_FILES: ${report.scannedFiles || 0}`,
    `CHANGED: ${(report.changed || []).length}`,
    `UNCHANGED: ${(report.unchanged || []).length}`,
    `SNAPSHOT: ${report.snapshotPath || "none"}`,
    `REPORT: ${report.reportPath || "none"}`,
  ];
  for (const item of (report.changed || []).slice(0, 25)) {
    lines.push(`FILE: ${item.path}`);
    lines.push(`CHANGES: ${(item.changes || []).join(",") || "none"}`);
  }
  if ((report.changed || []).length > 25) lines.push(`OMITTED_CHANGED: ${(report.changed || []).length - 25}`);
  return lines.join("\n");
}

export function formatMemoryBackfillApplyReport(report = {}) {
  return [
    "SUPERVIBE_MEMORY_BACKFILL_APPLY",
    `MODE: ${report.mode || "unknown"}`,
    `RECEIPT_ID: ${report.receiptId || "missing"}`,
    `REVIEWED_ONLY: ${report.reviewedOnly === true}`,
    `SNAPSHOT: ${report.snapshotPath || "none"}`,
    `REPORT: ${report.reportPath || "none"}`,
    `ADDED: ${(report.added || []).length}`,
    `SKIPPED: ${(report.skipped || []).length}`,
    `SUPERSEDED: ${(report.superseded || []).length}`,
    `REJECTED: ${(report.rejected || []).length}`,
  ].join("\n");
}

export function extractCandidatesFromText(text = "", {
  sourceKind = "unknown",
  sourcePath = "unknown",
  line = 1,
  now = new Date().toISOString(),
} = {}) {
  const raw = String(text || "").trim();
  if (!raw || raw.length < 18) return [];
  if (LOW_SIGNAL_PATTERNS.some((pattern) => pattern.test(raw))) return [];

  const candidates = [];
  const decisionScore = patternScore(raw, DECISION_PATTERNS);
  const bugScore = patternScore(raw, BUG_PATTERNS);
  const rejectedScopeScore = patternScore(raw, REJECTED_SCOPE_PATTERNS);
  const acceptedRiskScore = patternScore(raw, ACCEPTED_RISK_PATTERNS);
  const blockerScore = patternScore(raw, BLOCKER_PATTERNS);
  const handoffQuestionScore = patternScore(raw, HANDOFF_QUESTION_PATTERNS);
  const partialOutcomeScore = patternScore(raw, PARTIAL_OUTCOME_PATTERNS);
  const missingVerificationScore = patternScore(raw, MISSING_VERIFICATION_PATTERNS);
  const trustedReceiptScore = patternScore(raw, TRUSTED_RECEIPT_PATTERNS);
  const repeatedBlockerScore = patternScore(raw, REPEATED_BLOCKER_PATTERNS);
  const transientObservation = TRANSIENT_OBSERVATION_PATTERNS.some((pattern) => pattern.test(raw));

  if (decisionScore > 0 && !transientObservation && blockerScore === 0 && missingVerificationScore === 0) {
    candidates.push(buildCandidate({
      raw,
      sourceKind,
      sourcePath,
      line,
      candidateKind: "decision",
      proposedMemoryType: "decision",
      score: decisionScore,
      now,
    }));
  }
  if (bugScore > 0) {
    candidates.push(buildCandidate({
      raw,
      sourceKind,
      sourcePath,
      line,
      candidateKind: "bug",
      proposedMemoryType: "incident",
      score: bugScore,
      now,
    }));
  }
  if (rejectedScopeScore > 0) {
    candidates.push(buildCandidate({
      raw,
      sourceKind,
      sourcePath,
      line,
      candidateKind: "rejected_scope",
      proposedMemoryType: "decision",
      score: rejectedScopeScore,
      now,
    }));
  }
  if (acceptedRiskScore > 0) {
    candidates.push(buildCandidate({
      raw,
      sourceKind,
      sourcePath,
      line,
      candidateKind: "accepted_risk",
      proposedMemoryType: "decision",
      score: acceptedRiskScore,
      now,
    }));
  }
  if (blockerScore > 0 || repeatedBlockerScore > 0) {
    candidates.push(buildCandidate({
      raw,
      sourceKind,
      sourcePath,
      line,
      candidateKind: repeatedBlockerScore > 0 ? "repeated_blocker" : "blocker",
      proposedMemoryType: "incident",
      score: Math.max(blockerScore, repeatedBlockerScore),
      status: "open",
      now,
    }));
  }
  if (handoffQuestionScore > 0) {
    candidates.push(buildCandidate({
      raw,
      sourceKind,
      sourcePath,
      line,
      candidateKind: "handoff_question",
      proposedMemoryType: "learning",
      score: handoffQuestionScore,
      status: "review-needed",
      now,
    }));
  }
  if (partialOutcomeScore > 0) {
    candidates.push(buildCandidate({
      raw,
      sourceKind,
      sourcePath,
      line,
      candidateKind: "partial_outcome",
      proposedMemoryType: "learning",
      score: partialOutcomeScore,
      status: "review-needed",
      now,
    }));
  }
  if (missingVerificationScore > 0) {
    candidates.push(buildCandidate({
      raw,
      sourceKind,
      sourcePath,
      line,
      candidateKind: "missing_verification",
      proposedMemoryType: "incident",
      score: missingVerificationScore,
      status: "review-needed",
      now,
    }));
  }
  if (trustedReceiptScore > 0) {
    candidates.push(buildCandidate({
      raw,
      sourceKind,
      sourcePath,
      line,
      candidateKind: "trusted_receipt_claim",
      proposedMemoryType: "decision",
      score: trustedReceiptScore,
      now,
    }));
  }
  return candidates;
}

export function redactCandidateText(value = "") {
  let text = String(value || "");

  text = text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]");
  text = text.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi, "Bearer [REDACTED_TOKEN]");
  text = text.replace(/\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/g, "[REDACTED_TOKEN]");
  text = text.replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_TOKEN]");
  text = text.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_TOKEN]");
  text = text.replace(/\b([A-Za-z0-9_.-]*(?:api[_-]?key|token|secret|password|passwd|pwd)[A-Za-z0-9_.-]*)(\s*[:=]\s*)("[^"]+"|'[^']+'|[^\s,;}\]]+)/gi, "$1$2[REDACTED_SECRET]");
  text = text.replace(/\b[A-Fa-f0-9]{32,}\b/g, "[REDACTED_TOKEN]");
  text = text.replace(/\b(?=[A-Za-z0-9+/=_-]{28,}\b)(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9+/=_-]{28,}\b/g, "[REDACTED_TOKEN]");
  text = text.replace(/[A-Za-z]:\\[^\r\n"'`<>|]*/g, "[REDACTED_PATH]");
  text = text.replace(/(?:\/Users|\/home)\/[^\s"'`<>]+/g, "[REDACTED_PATH]");

  return text;
}

export function extractLinkedEvidenceRefs(value = "") {
  const text = String(value || "").replace(/\\/g, "/");
  return pruneEmptyRefGroups({
    files: uniqueMatches(text, FILE_REF_PATTERN).map((item) => item.replace(/[,.;)]$/, "")),
    workItems: uniqueMatches(text, WORK_ITEM_REF_PATTERN).map(stripEvidencePrefix),
    receipts: uniqueMatches(text, RECEIPT_REF_PATTERN).map(stripEvidencePrefix),
    symbols: uniqueMatches(text, SYMBOL_REF_PATTERN)
      .map((item) => item.replace(/\(\)$/, "").replace(/^symbol:/, ""))
      .filter((item) => item.length > 2)
      .filter((item) => !SYMBOL_STOP_WORDS.has(item.toLowerCase()))
      .slice(0, 8),
  });
}

export function buildMemoryRelationshipGraph(entries = [], {
  rootId = null,
  maxNodes = 32,
  maxEdges = 48,
  generatedAt = new Date().toISOString(),
} = {}) {
  const nodeLimit = positiveInt(maxNodes, 32);
  const edgeLimit = positiveInt(maxEdges, 48);
  const nodeMap = new Map();
  const allEdges = [];
  const seenEdges = new Set();

  for (const entry of Array.isArray(entries) ? entries : []) {
    const sourceNode = addMemoryRelationshipNode(nodeMap, entry);
    for (const relationship of normalizeMemoryRelationships(entry)) {
      const targetNode = addMemoryRelationshipTargetNode(nodeMap, relationship.target);
      const edge = {
        id: stableRelationshipEdgeId(sourceNode.id, relationship.type, targetNode.id),
        from: sourceNode.id,
        to: targetNode.id,
        type: relationship.type,
        label: relationship.type,
        confidence: relationship.confidence,
        source: relationship.source,
        sourceCitation: relationship.source,
        reason: relationship.reason,
        declared: true,
      };
      const key = `${edge.from}:${edge.type}:${edge.to}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      allEdges.push(edge);
    }
  }

  const rootNodeId = rootId ? `memory:${String(rootId).replace(/^memory:/, "")}` : null;
  const selectedEdges = selectRelationshipEdges(allEdges, { rootNodeId, edgeLimit });
  const selectedNodeIds = selectRelationshipNodeIds(selectedEdges, {
    rootNodeId,
    nodeLimit,
  });
  const nodes = [...nodeMap.values()]
    .filter((node) => selectedNodeIds.has(node.id))
    .sort((left, right) => relationshipNodeRank(left, rootNodeId) - relationshipNodeRank(right, rootNodeId)
      || left.id.localeCompare(right.id));
  const known = new Set(nodes.map((node) => node.id));
  const edges = selectedEdges
    .filter((edge) => known.has(edge.from) && known.has(edge.to))
    .slice(0, edgeLimit);

  return {
    schemaVersion: 1,
    kind: "supervibe-memory-relationship-map",
    generatedAt,
    relationshipMapRole: "source-backed-neighborhood",
    supportedRelationshipTypes: [...MEMORY_RELATIONSHIP_TYPES],
    bounded: true,
    completeness: "declared-links-only",
    sparseGraphPolicy: "Do not infer missing links from empty space; render only declared memory relationships and show coverage gaps separately.",
    limits: {
      maxNodes: nodeLimit,
      maxEdges: edgeLimit,
    },
    nodes,
    edges,
    summary: summarizeMemoryRelationships(nodes, edges, allEdges),
    uiHints: {
      preferredLayout: "bounded-neighborhood",
      relationshipMapRole: "source-backed-neighborhood",
      sparseGraphPolicy: "Render declared links only; an absent edge means no source-backed relationship has been recorded.",
      emptyState: "No declared memory relationships matched this query.",
    },
  };
}

export function formatMemoryRelationshipGraph(graph = {}) {
  const lines = [
    "SUPERVIBE_MEMORY_RELATIONSHIP_GRAPH",
    `ROLE: ${graph.relationshipMapRole || "unknown"}`,
    `BOUNDED: ${graph.bounded === true}`,
    `COMPLETENESS: ${graph.completeness || "unknown"}`,
    `SUPPORTED_TYPES: ${(graph.supportedRelationshipTypes || []).join(",") || "none"}`,
    `NODES: ${(graph.nodes || []).length}`,
    `EDGES: ${(graph.edges || []).length}`,
    `SPARSE_POLICY: ${graph.sparseGraphPolicy || graph.uiHints?.sparseGraphPolicy || "none"}`,
  ];
  for (const edge of graph.edges || []) {
    lines.push(`EDGE: ${edge.from} -${edge.type}-> ${edge.to} confidence=${edge.confidence} source=${edge.source || "unknown"}`);
  }
  return lines.join("\n");
}

export function formatMemoryBackfillReport(report = {}) {
  const candidates = report.candidates || [];
  const sourceCounts = report.sourceCounts || {};
  const candidateCounts = report.candidateCounts || {};
  const lines = [
    "SUPERVIBE_MEMORY_BACKFILL",
    `MODE: ${report.mode || "dry-run"}`,
    `DRY_RUN: ${report.dryRun !== false}`,
    `SCANNED_FILES: ${report.scannedFiles || 0}`,
    `CANDIDATES: ${candidates.length}`,
    `SOURCE_COUNTS: ${formatCounts(sourceCounts)}`,
    `CANDIDATE_COUNTS: ${formatCounts(candidateCounts)}`,
  ];

  for (const candidate of candidates) {
    lines.push(
      `CANDIDATE: ${candidate.id}`,
      `SOURCE: ${candidate.sourcePath}:${candidate.line}`,
      `SOURCE_KIND: ${candidate.sourceKind}`,
      `KIND: ${candidate.candidateKind}`,
      `PROPOSED_TYPE: ${candidate.proposedMemoryType}`,
      `STATUS: ${candidate.status || "final"}`,
      ...(candidate.reviewAfter ? [`REVIEW_AFTER: ${candidate.reviewAfter}`] : []),
      `SUMMARY: ${candidate.summary}`,
      `EVIDENCE: ${candidate.evidence}`,
    );
  }

  return lines.join("\n");
}

async function readReviewedCandidatesFile(file) {
  const raw = JSON.parse(await readFile(file, "utf8"));
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.candidates)) return raw.candidates;
  if (Array.isArray(raw.reviewedCandidates)) return raw.reviewedCandidates;
  if (Array.isArray(raw.approved)) return raw.approved;
  return [];
}

async function readExistingMemoryIds({ rootDir }) {
  const ids = new Set();
  const memoryRoot = join(rootDir, ".supervibe", "memory");
  for (const dir of Object.values(MEMORY_TYPE_DIRS)) {
    const categoryDir = join(memoryRoot, dir);
    let entries = [];
    try {
      entries = await readdir(categoryDir, { withFileTypes: true });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const file = join(categoryDir, entry.name);
      const markdown = await readFile(file, "utf8");
      const frontmatterId = /^---\r?\n[\s\S]*?\bid\s*:\s*([^\r\n]+)[\s\S]*?\r?\n---/m.exec(markdown)?.[1];
      ids.add(slugifyMemoryId(frontmatterId || basename(entry.name, ".md")));
    }
  }
  return ids;
}

function validateReviewedMemoryCandidate(candidate = {}, { receiptId, existingIds, plannedIds } = {}) {
  if (!isReviewedCandidate(candidate)) return { pass: false, reason: "not-reviewed" };
  const sourceArtifact = sourceCitationForCandidate(candidate);
  if (!sourceArtifact) return { pass: false, reason: "missing-source-citation" };
  const evidence = String(candidate.evidence || candidate.summary || "");
  const summary = String(candidate.summary || candidate.evidence || "").trim();
  if (containsUnredactedSecret(evidence) || containsUnredactedSecret(summary)) return { pass: false, reason: "unredacted-secret" };

  const memoryId = slugifyMemoryId(candidate.memoryId || candidate.memoryID || candidate.id || stableCandidateId({
    sourcePath: candidate.sourcePath || sourceArtifact,
    line: candidate.line || 1,
    candidateKind: candidate.candidateKind || "memory",
    evidence,
  }));
  if (existingIds?.has(memoryId) || plannedIds?.has(memoryId)) {
    return {
      pass: true,
      skip: true,
      reason: "duplicate-memory-id",
      entry: { memoryId, sourceArtifact },
    };
  }

  const type = normalizeMemoryType(candidate.proposedMemoryType || candidate.type);
  const path = `.supervibe/memory/${MEMORY_TYPE_DIRS[type]}/${memoryId}.md`;
  return {
    pass: true,
    entry: {
      memoryId,
      type,
      path,
      date: String(candidate.date || new Date().toISOString().slice(0, 10)),
      tags: normalizeApplyTags(candidate),
      agent: "supervibe-memory-backfill",
      confidence: normalizeRelationshipConfidence(candidate.confidence, candidate.proposedConfidence, 9),
      sourceArtifact,
      owner: "memory-curator",
      freshness: "current",
      relationships: normalizeApplyRelationships(candidate, sourceArtifact),
      supersedes: normalizeList(candidate.supersedes).map((item) => slugifyMemoryId(item)),
      receiptId,
      summary: redactCandidateText(summary || evidence),
      evidence: redactCandidateText(evidence),
      candidateId: candidate.id || null,
    },
  };
}

function isReviewedCandidate(candidate = {}) {
  const reviewState = String(candidate.reviewStatus || candidate.approvalStatus || candidate.review?.status || candidate.approval || "").toLowerCase();
  return candidate.reviewed === true
    || candidate.approved === true
    || ["approved", "accepted", "reviewed", "pass", "passed"].includes(reviewState);
}

function sourceCitationForCandidate(candidate = {}) {
  const sourcePath = String(candidate.sourcePath || "").trim();
  if (sourcePath) {
    const line = Number(candidate.line || candidate.sourceLine || 0);
    return line > 0 ? `${sourcePath}:${line}` : sourcePath;
  }
  return String(candidate.sourceCitation || candidate.sourceArtifact || "").trim();
}

function containsUnredactedSecret(value = "") {
  const text = String(value || "");
  if (!text) return false;
  return redactCandidateText(text) !== text;
}

function normalizeMemoryType(type = "learning") {
  const normalized = String(type || "learning").trim().toLowerCase();
  return MEMORY_TYPE_DIRS[normalized] ? normalized : "learning";
}

function normalizeApplyTags(candidate = {}) {
  return [...new Set([
    "backfill",
    candidate.sourceKind ? String(candidate.sourceKind) : "",
    ...(Array.isArray(candidate.tags) ? candidate.tags.map(String) : []),
  ].filter(Boolean).map((tag) => slugifyMemoryTag(tag)))].slice(0, 8);
}

function normalizeApplyRelationships(candidate = {}, sourceArtifact = "") {
  const relationships = [
    ...normalizeList(candidate.relationships).map(String),
    sourceArtifact ? `evidence-for:${sourceArtifact}` : "",
  ].filter(Boolean);
  return [...new Set(relationships)];
}

function buildApplyReportItem(candidate = {}, reason, entry = {}) {
  return {
    candidateId: candidate.id || null,
    memoryId: entry.memoryId || candidate.memoryId || null,
    reason,
    source: sourceCitationForCandidate(candidate) || null,
  };
}

async function createMemoryBackfillSnapshot({ rootDir, entries, receiptId, now }) {
  const snapshotId = `${timestampForPath(now)}-${fnv1a(`${receiptId}:${entries.map((entry) => entry.path).join(",")}`)}`;
  const relPath = `${MEMORY_APPLY_SNAPSHOT_DIR}/${snapshotId}.json`;
  const files = [];
  for (const entry of entries) {
    const absPath = join(rootDir, entry.path);
    const existed = existsSync(absPath);
    files.push({
      path: entry.path,
      existed,
      content: existed ? await readFile(absPath, "utf8") : null,
    });
  }
  const snapshot = {
    schemaVersion: 1,
    generatedAt: now,
    kind: "supervibe-memory-backfill-snapshot",
    receiptId,
    reversible: true,
    files,
  };
  await ensureParentDir(join(rootDir, relPath));
  await writeFile(join(rootDir, relPath), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return { path: relPath, snapshot };
}

async function createMemorySchemaBackfillSnapshot({ rootDir, writes = [], now }) {
  const snapshotId = `${timestampForPath(now)}-${fnv1a(`schema:${writes.map((entry) => entry.path).join(",")}`)}`;
  const relPath = `${MEMORY_APPLY_SNAPSHOT_DIR}/${snapshotId}.json`;
  const snapshot = {
    schemaVersion: 1,
    generatedAt: now,
    kind: "supervibe-memory-schema-backfill-snapshot",
    reversible: true,
    files: writes.map((entry) => ({
      path: entry.path,
      existed: true,
      content: entry.previousContent,
    })),
  };
  await ensureParentDir(join(rootDir, relPath));
  await writeFile(join(rootDir, relPath), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return { path: relPath, snapshot };
}

async function writeMemorySchemaBackfillReport({ rootDir, report, now }) {
  const reportId = `${timestampForPath(now)}-${fnv1a(`schema:${report.changed.length}:${report.unchanged.length}:${report.writeEnabled}`)}`;
  const relPath = `${MEMORY_APPLY_REPORT_DIR}/${reportId}.json`;
  await ensureParentDir(join(rootDir, relPath));
  await writeFile(join(rootDir, relPath), `${JSON.stringify({ ...report, reportPath: relPath }, null, 2)}\n`, "utf8");
  return relPath;
}
async function writeMemoryBackfillApplyReport({ rootDir, report, now, dryRun }) {
  const reportId = `${timestampForPath(now)}-${fnv1a(`${report.receiptId}:${report.added.length}:${report.rejected.length}:${dryRun}`)}`;
  const relPath = `${MEMORY_APPLY_REPORT_DIR}/${reportId}.json`;
  await ensureParentDir(join(rootDir, relPath));
  await writeFile(join(rootDir, relPath), `${JSON.stringify({ ...report, reportPath: relPath }, null, 2)}\n`, "utf8");
  return relPath;
}

function renderMemoryBackfillEntry(entry) {
  const frontmatter = [
    "---",
    `id: ${formatMemoryFrontmatterValue("id", entry.memoryId)}`,
    `type: ${formatMemoryFrontmatterValue("type", entry.type)}`,
    `date: ${formatMemoryFrontmatterValue("date", entry.date)}`,
    `tags: ${formatYamlArray(entry.tags)}`,
    `agent: ${formatMemoryFrontmatterValue("agent", entry.agent)}`,
    `confidence: ${entry.confidence}`,
    `sourceArtifact: ${formatMemoryFrontmatterValue("sourceArtifact", entry.sourceArtifact)}`,
    `owner: ${formatMemoryFrontmatterValue("owner", entry.owner)}`,
    `freshness: ${formatMemoryFrontmatterValue("freshness", entry.freshness)}`,
    `relationships: ${formatYamlArray(entry.relationships)}`,
    ...(entry.supersedes.length ? [`supersedes: ${formatYamlArray(entry.supersedes)}`] : []),
    `receiptId: ${formatMemoryFrontmatterValue("receiptId", entry.receiptId)}`,
    "---",
  ];
  return [
    ...frontmatter,
    entry.summary,
    "",
    `Evidence: ${entry.evidence}`,
    "",
    `Backfill candidate: ${entry.candidateId || "unknown"}`,
  ].join("\n");
}

function formatYamlArray(items = []) {
  return `[${items.map(formatYamlFlowScalar).join(", ")}]`;
}

async function ensureParentDir(file) {
  await mkdir(dirname(file), { recursive: true });
}

function timestampForPath(value) {
  const date = new Date(value);
  const iso = Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  return iso.replace(/[:.]/g, "-");
}

function slugifyMemoryId(value = "") {
  return String(value || "memory")
    .trim()
    .toLowerCase()
    .replace(/^['"]|['"]$/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "memory";
}

function slugifyMemoryTag(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function addMemoryRelationshipNode(nodeMap, entry = {}) {
  const id = String(entry.id || entry.memoryId || entry.file || "unknown").replace(/^memory:/, "");
  const nodeId = `memory:${id}`;
  if (!nodeMap.has(nodeId)) {
    nodeMap.set(nodeId, {
      id: nodeId,
      label: id,
      type: String(entry.type || "memory"),
      confidence: normalizeRelationshipConfidence(entry.confidence),
      source: entry.sourceArtifact || entry.file || null,
      sourceCitation: entry.sourceArtifact || entry.file || null,
      freshness: entry.freshness || null,
      tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
    });
  }
  return nodeMap.get(nodeId);
}

function addMemoryRelationshipTargetNode(nodeMap, target) {
  const targetText = String(target || "").trim();
  const artifactLike = isArtifactRelationshipTarget(targetText);
  const nodeId = artifactLike ? `artifact:${targetText.replace(/\\/g, "/")}` : `memory:${targetText.replace(/^memory:/, "")}`;
  if (!nodeMap.has(nodeId)) {
    nodeMap.set(nodeId, {
      id: nodeId,
      label: artifactLike ? basename(targetText) : targetText.replace(/^memory:/, ""),
      type: artifactLike ? "artifact" : "memory",
      confidence: 0,
      source: artifactLike ? targetText.replace(/\\/g, "/") : null,
      sourceCitation: artifactLike ? targetText.replace(/\\/g, "/") : null,
      inferred: true,
      tags: [],
    });
  }
  return nodeMap.get(nodeId);
}

function normalizeMemoryRelationships(entry = {}) {
  const relationships = [];
  for (const item of normalizeList(entry.relationships)) {
    const relationship = normalizeMemoryRelationshipItem(item, entry);
    if (relationship) relationships.push(relationship);
  }
  for (const target of normalizeList(entry.related)) {
    relationships.push(buildMemoryRelationship({ entry, type: "relates-to", target, reason: "legacy related field" }));
  }
  for (const target of normalizeList(entry.supersedes)) {
    relationships.push(buildMemoryRelationship({ entry, type: "supersedes", target, reason: "legacy supersedes field" }));
  }
  for (const target of normalizeList(entry.contradicts)) {
    relationships.push(buildMemoryRelationship({ entry, type: "contradicts", target, reason: "legacy contradicts field" }));
  }
  return relationships.filter((relationship) => relationship.target);
}

function normalizeMemoryRelationshipItem(item, entry = {}) {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    return buildMemoryRelationship({
      entry,
      type: item.type || item.kind || "relates-to",
      target: item.target || item.to || item.id || item.ref,
      confidence: item.confidence,
      source: item.source || item.sourceArtifact || item.file,
      reason: item.reason || item.label || "declared relationship object",
    });
  }
  const text = String(item || "").trim();
  if (!text) return null;
  const typed = /^([a-z][a-z0-9-]*)\s*:\s*(.+)$/.exec(text);
  if (typed) {
    return buildMemoryRelationship({
      entry,
      type: typed[1],
      target: typed[2],
      reason: "declared relationship string",
    });
  }
  return buildMemoryRelationship({
    entry,
    type: "relates-to",
    target: text,
    reason: "declared relationship string",
  });
}

function buildMemoryRelationship({ entry = {}, type, target, confidence, source, reason }) {
  const relationshipType = normalizeRelationshipType(type);
  return {
    type: relationshipType,
    target: String(target || "").trim(),
    confidence: normalizeRelationshipConfidence(confidence, entry.confidence),
    source: source || entry.sourceArtifact || entry.file || `memory:${entry.id || "unknown"}`,
    reason: reason || `${entry.id || "memory"} declares ${relationshipType}`,
  };
}

function normalizeRelationshipType(type) {
  const normalized = String(type || "").trim().toLowerCase();
  return MEMORY_RELATIONSHIP_TYPE_SET.has(normalized) ? normalized : "relates-to";
}

function normalizeRelationshipConfidence(...values) {
  for (const value of values) {
    const score = Number(value);
    if (Number.isFinite(score)) return Math.max(0, Math.min(10, score));
  }
  return 0;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function isArtifactRelationshipTarget(target = "") {
  const text = String(target || "").replace(/\\/g, "/");
  return text.startsWith(".supervibe/")
    || text.startsWith("scripts/")
    || text.startsWith("tests/")
    || text.startsWith("docs/")
    || text.includes("/")
    || /\.[A-Za-z0-9]+$/.test(text);
}

function stableRelationshipEdgeId(from, type, to) {
  return `rel:${fnv1a(`${from}:${type}:${to}`)}`;
}

function selectRelationshipEdges(edges = [], { rootNodeId = null, edgeLimit = 48 } = {}) {
  return [...edges]
    .sort((left, right) => relationshipEdgeRank(left, rootNodeId) - relationshipEdgeRank(right, rootNodeId)
      || MEMORY_RELATIONSHIP_TYPES.indexOf(left.type) - MEMORY_RELATIONSHIP_TYPES.indexOf(right.type)
      || `${left.from}:${left.to}`.localeCompare(`${right.from}:${right.to}`))
    .slice(0, edgeLimit);
}

function relationshipEdgeRank(edge, rootNodeId) {
  if (!rootNodeId) return 1;
  if (edge.from === rootNodeId) return 0;
  if (edge.to === rootNodeId) return 1;
  return 2;
}

function selectRelationshipNodeIds(edges = [], { rootNodeId = null, nodeLimit = 32 } = {}) {
  const selected = new Set();
  if (rootNodeId) selected.add(rootNodeId);
  for (const edge of edges) {
    if (selected.size < nodeLimit) selected.add(edge.from);
    if (selected.size < nodeLimit) selected.add(edge.to);
    if (selected.size >= nodeLimit) break;
  }
  return selected;
}

function relationshipNodeRank(node, rootNodeId) {
  if (rootNodeId && node.id === rootNodeId) return 0;
  if (node.inferred) return 2;
  return 1;
}

function summarizeMemoryRelationships(nodes = [], edges = [], allEdges = []) {
  return {
    visibleNodes: nodes.length,
    visibleEdges: edges.length,
    declaredEdges: allEdges.length,
    hiddenEdges: Math.max(0, allEdges.length - edges.length),
    relationshipTypes: countBy(edges, "type"),
    sourceCount: new Set(edges.map((edge) => edge.source).filter(Boolean)).size,
  };
}

async function collectSourceFiles({
  rootDir,
  sourceKind,
  sourceRoot,
  maxFileBytes,
}) {
  const absRoot = join(rootDir, sourceRoot);
  if (!existsSync(absRoot)) return [];
  const rootStats = await stat(absRoot);
  if (rootStats.isFile()) {
    return await sourceFileEntry({ rootDir, absPath: absRoot, sourceKind, maxFileBytes });
  }
  if (!rootStats.isDirectory()) return [];

  const out = [];
  const entries = await readdir(absRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".archive" || entry.name === "node_modules" || entry.name === ".git") continue;
    const absPath = join(absRoot, entry.name);
    if (entry.isDirectory()) {
      out.push(...await collectSourceFiles({
        rootDir,
        sourceKind,
        sourceRoot: toRelativePath(rootDir, absPath),
        maxFileBytes,
      }));
    } else if (entry.isFile()) {
      out.push(...await sourceFileEntry({ rootDir, absPath, sourceKind, maxFileBytes }));
    }
  }
  return out.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
}

async function sourceFileEntry({ rootDir, absPath, sourceKind, maxFileBytes }) {
  const ext = extname(absPath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) return [];
  const fileStats = await stat(absPath);
  if (fileStats.size > maxFileBytes) return [];
  return [{
    absPath,
    sourceKind,
    sourcePath: toRelativePath(rootDir, absPath),
  }];
}

function recordsFromFile(raw, file) {
  const ext = extname(file.sourcePath).toLowerCase();
  if (ext === ".jsonl") return recordsFromJsonl(raw);
  if (ext === ".json") return recordsFromJson(raw);
  return raw.split(/\r?\n/).map((line, index) => ({ line: index + 1, text: line }));
}

function recordsFromJsonl(raw) {
  const records = [];
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line);
      records.push(...recordsFromParsedJson(parsed, { line: i + 1 }));
    } catch {
      records.push({ line: i + 1, text: line });
    }
  }
  return records;
}

function recordsFromJson(raw) {
  try {
    return recordsFromParsedJson(JSON.parse(raw), { line: 1 });
  } catch {
    return raw.split(/\r?\n/).map((line, index) => ({ line: index + 1, text: line }));
  }
}

function recordsFromParsedJson(value, { line = 1 } = {}) {
  const records = [];
  if (value && typeof value === "object") {
    records.push({ line, text: JSON.stringify(value) });
  }
  records.push(...flattenJsonRecord(value, { line }));
  return records;
}

function flattenJsonRecord(value, { line = 1, path = "" } = {}) {
  if (value === null || value === undefined) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [{ line, text: `${path}: ${String(value)}`.replace(/^: /, "") }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flattenJsonRecord(item, {
      line,
      path: path ? `${path}.${index}` : String(index),
    }));
  }
  if (typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => flattenJsonRecord(item, {
      line,
      path: path ? `${path}.${key}` : key,
    }));
  }
  return [];
}

function buildCandidate({
  raw,
  sourceKind,
  sourcePath,
  line,
  candidateKind,
  proposedMemoryType,
  score,
  status = "final",
  now = new Date().toISOString(),
}) {
  const evidence = truncate(cleanCandidateText(redactCandidateText(raw)), 320);
  const summary = truncate(stripCandidatePrefix(evidence, candidateKind), 180);
  const candidate = {
    id: stableCandidateId({ sourcePath, line, candidateKind, evidence }),
    sourceKind,
    sourcePath,
    line,
    candidateKind,
    proposedMemoryType,
    status,
    score,
    summary,
    evidence,
  };
  const linkedEvidence = extractLinkedEvidenceRefs(raw);
  if (Object.keys(linkedEvidence).length) candidate.linkedEvidence = linkedEvidence;
  if (LOG_DERIVED_SOURCE_KINDS.has(sourceKind)) {
    candidate.reviewAfter = extractReviewDate(raw) || addDaysIsoDate(now, 30);
  }
  return candidate;
}

function cleanCandidateText(text) {
  return String(text || "")
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/^\s*#{1,6}\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripCandidatePrefix(text, candidateKind) {
  const prefixes = {
    accepted_risk: /^(?:[A-Za-z0-9_.-]+\s*:\s*)?(?:accepted risk|risk accepted|known risk|residual risk)\s*[:=-]\s*/i,
    blocker: /^(?:[A-Za-z0-9_.-]+\s*:\s*)?(?:blocker|blocked|hard stop)\s*[:=-]\s*/i,
    bug: /^(?:[A-Za-z0-9_.-]+\s*:\s*)?(?:bug|fix|failure|regression|incident|root cause|error)\s*[:=-]\s*/i,
    decision: /^(?:[A-Za-z0-9_.-]+\s*:\s*)?(?:decision|decided|policy|approved|accepted|choice)\s*[:=-]\s*/i,
    handoff_question: /^(?:[A-Za-z0-9_.-]+\s*:\s*)?(?:handoff question|open question|question)\s*[:=-]\s*/i,
    missing_verification: /^(?:[A-Za-z0-9_.-]+\s*:\s*)?(?:missing verification|not verified|unverified)\s*[:=-]\s*/i,
    partial_outcome: /^(?:[A-Za-z0-9_.-]+\s*:\s*)?(?:partial outcome|partially complete|incomplete)\s*[:=-]\s*/i,
    rejected_scope: /^(?:[A-Za-z0-9_.-]+\s*:\s*)?(?:rejected scope|out of scope|not in scope|deferred)\s*[:=-]\s*/i,
    repeated_blocker: /^(?:[A-Za-z0-9_.-]+\s*:\s*)?(?:repeated blocker|recurring blocker|multiple blockers)\s*[:=-]\s*/i,
    trusted_receipt_claim: /^(?:[A-Za-z0-9_.-]+\s*:\s*)?(?:trusted receipt|receipt claim|workflow receipt)\s*[:=-]\s*/i,
  };
  const label = prefixes[candidateKind] || prefixes.decision;
  return String(text || "").replace(label, "").trim();
}

function patternScore(text, patterns) {
  return patterns.reduce((score, pattern) => score + (pattern.test(text) ? 1 : 0), 0);
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const out = [];
  for (const candidate of candidates.sort(compareCandidates)) {
    const key = `${candidate.candidateKind}:${normalizeDedupeText(candidate.summary)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

function compareCandidates(left, right) {
  return left.sourcePath.localeCompare(right.sourcePath)
    || left.line - right.line
    || left.candidateKind.localeCompare(right.candidateKind)
    || right.score - left.score;
}

function stableCandidateId({ sourcePath, line, candidateKind, evidence }) {
  const sourceSlug = `${sourcePath}:${line}:${candidateKind}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
  const hash = fnv1a(`${sourcePath}:${line}:${candidateKind}:${evidence}`);
  return `${candidateKind}-${sourceSlug}-${hash}`;
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeSourceKinds(sourceKinds) {
  const kinds = Array.isArray(sourceKinds) ? sourceKinds : String(sourceKinds || "").split(",");
  const normalized = kinds.map((kind) => String(kind || "").trim()).filter(Boolean);
  if (normalized.includes("all") || normalized.length === 0) return Object.keys(MEMORY_BACKFILL_SOURCES);
  const supported = new Set(Object.keys(MEMORY_BACKFILL_SOURCES));
  return normalized.filter((kind) => supported.has(kind));
}

function toRelativePath(rootDir, absPath) {
  return relative(rootDir, absPath).split(sep).join("/");
}

function countBy(items, field) {
  const counts = {};
  for (const item of items) {
    const key = item[field] || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0])));
}

function uniqueMatches(text, pattern) {
  const matches = String(text || "").match(pattern) || [];
  return [...new Set(matches.map((item) => item.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function stripEvidencePrefix(value = "") {
  return String(value || "").replace(/^(?:work-item|receipt|workflow-receipt):/, "");
}

function pruneEmptyRefGroups(groups = {}) {
  return Object.fromEntries(Object.entries(groups).filter(([, refs]) => Array.isArray(refs) && refs.length > 0));
}

function formatCounts(counts) {
  const entries = Object.entries(counts || {});
  return entries.length ? entries.map(([key, value]) => `${key}=${value}`).join(",") : "none";
}

function normalizeDedupeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[^a-z0-9а-яё]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractReviewDate(value = "") {
  const match = String(value || "").match(/\b(?:review(?:After| by| date)?|expires(?:At| on)?|expiry)["']?\s*[:=]\s*["']?(\d{4}-\d{2}-\d{2})/i);
  return match?.[1] || "";
}

function addDaysIsoDate(value, days) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function truncate(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}...`;
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
async function collectMemoryEntryMarkdownFiles({ rootDir }) {
  const files = [];
  for (const [type, dirName] of Object.entries(MEMORY_TYPE_DIRS)) {
    const absDir = join(rootDir, ".supervibe", "memory", dirName);
    if (!existsSync(absDir)) continue;
    const entries = await readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name.startsWith("_")) continue;
      const absPath = join(absDir, entry.name);
      files.push({
        absPath,
        relPath: toRelativePath(rootDir, absPath),
        type,
      });
    }
  }
  return files.sort((left, right) => left.relPath.localeCompare(right.relPath));
}

const MEMORY_ENTRY_FRONTMATTER_ORDER = Object.freeze([
  "id",
  "type",
  "date",
  "tags",
  "related",
  "supersedes",
  "supersededBy",
  "contradicts",
  "retrievedAt",
  "agent",
  "confidence",
  "sourceArtifact",
  "owner",
  "freshness",
  "relationships",
  "receiptId",
]);

function memoryFrontmatterHasBlockArrays(markdown = "") {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/m.exec(String(markdown || ""));
  if (!match) return false;
  return /^(?:tags|related|supersedes|supersededBy|contradicts|relationships):\s*\r?\n\s+-\s+/m.test(match[1]);
}

function renderMemoryEntryMarkdown(body = "", data = {}) {
  const keys = [
    ...MEMORY_ENTRY_FRONTMATTER_ORDER.filter((key) => data[key] !== undefined),
    ...Object.keys(data)
      .filter((key) => !MEMORY_ENTRY_FRONTMATTER_ORDER.includes(key))
      .sort((left, right) => left.localeCompare(right)),
  ];
  const lines = ["---"];
  for (const key of keys) lines.push(`${key}: ${formatMemoryFrontmatterValue(key, data[key])}`);
  lines.push("---");
  const normalizedBody = String(body || "");
  return `${lines.join("\n")}\n${normalizedBody.startsWith("\n") ? normalizedBody : `\n${normalizedBody}`}`;
}

function formatMemoryFrontmatterValue(key, value) {
  if (Array.isArray(value)) return `[${value.map(formatMemoryFrontmatterArrayItem).join(", ")}]`;
  if (value instanceof Date) return key === "date" ? value.toISOString().slice(0, 10) : value.toISOString();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return formatYamlFlowScalar(value);
}

function formatMemoryFrontmatterArrayItem(value) {
  return formatYamlFlowScalar(value);
}

function formatYamlFlowScalar(value) {
  const text = String(value ?? "").replace(/[\r\n]/g, " ").trim();
  if (!text) return '""';
  const needsQuoting = /[,#:\[\]{}]|^[-?]|\s$|^\s/.test(text)
    || /^(true|false|null|yes|no|on|off)$/i.test(text);
  if (!needsQuoting) return text;
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function normalizeMemoryEntrySchemaData(data = {}, { relPath = "", fallbackType = "learning" } = {}) {
  const next = { ...data };
  const changes = [];
  if (next.date instanceof Date) {
    next.date = next.date.toISOString().slice(0, 10);
  }
  if (!hasFrontmatterValue(next.type)) {
    next.type = fallbackType;
    changes.push("type");
  }
  if (!hasFrontmatterValue(next.sourceArtifact)) {
    next.sourceArtifact = relPath;
    changes.push("sourceArtifact");
  }
  if (!hasFrontmatterValue(next.tags)) {
    next.tags = uniqueList(["memory", next.type || fallbackType]);
    changes.push("tags");
  }
  if (!hasFrontmatterValue(next.agent)) {
    next.agent = "memory-curator";
    changes.push("agent");
  }
  if (!hasFrontmatterValue(next.confidence)) {
    next.confidence = 8;
    changes.push("confidence");
  }
  if (!hasFrontmatterValue(next.owner)) {
    next.owner = "memory-curator";
    changes.push("owner");
  }
  if (!hasFrontmatterValue(next.freshness)) {
    next.freshness = deriveMemoryFreshness(next);
    changes.push("freshness");
  }
  for (const field of ["tags", "related", "supersedes", "supersededBy", "contradicts"]) {
    if (next[field] === undefined) continue;
    const normalized = normalizeFrontmatterList(next[field]);
    if (JSON.stringify(normalized) !== JSON.stringify(next[field])) {
      next[field] = normalized;
      changes.push(`normalize-${field}`);
    }
  }
  if (!Array.isArray(next.relationships)) {
    next.relationships = deriveMemoryRelationships(next);
    changes.push("relationships");
  } else {
    const normalizedRelationships = uniqueList(next.relationships);
    if (normalizedRelationships.length !== next.relationships.length) {
      next.relationships = normalizedRelationships;
      changes.push("dedupe-relationships");
    }
  }
  return {
    changed: changes.length > 0,
    changes,
    data: next,
  };
}

function deriveMemoryFreshness(data = {}) {
  const supersededBy = normalizeFrontmatterList(data.supersededBy);
  if (supersededBy.length > 0) return "superseded";
  if (String(data.freshness || "").trim()) return String(data.freshness).trim();
  return "fresh";
}

function deriveMemoryRelationships(data = {}) {
  return uniqueList([
    ...normalizeFrontmatterList(data.related).map((item) => `relates-to:${item}`),
    ...normalizeFrontmatterList(data.supersedes).map((item) => `supersedes:${item}`),
    ...normalizeFrontmatterList(data.contradicts).map((item) => `contradicts:${item}`),
    data.sourceArtifact ? `evidence-for:${data.sourceArtifact}` : "",
  ].filter(Boolean));
}

function hasFrontmatterValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function normalizeFrontmatterList(value) {
  if (Array.isArray(value)) return uniqueList(value);
  if (value === undefined || value === null || value === "") return [];
  return uniqueList(String(value).split(","));
}

function uniqueList(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .map((value) => String(value).trim())
    .filter(Boolean))];
}
