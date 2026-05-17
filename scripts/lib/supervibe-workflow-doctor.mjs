import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

const CLASS_ORDER = ["hot", "warm", "cold", "trash"];

export function buildWorkflowDoctorReport({ rootDir = process.cwd(), activeGraphPath = null, limit = 10 } = {}) {
  const supervibeRoot = join(rootDir, ".supervibe");
  const files = existsSync(supervibeRoot) ? listFiles(supervibeRoot, rootDir) : [];
  const activeGraphRel = normalizeActiveGraphPath(rootDir, activeGraphPath || inferActiveGraphPath(rootDir));
  const buckets = Object.fromEntries(CLASS_ORDER.map((name) => [name, []]));
  for (const file of files) {
    const classification = classifySupervibePath(file.relPath, { activeGraphRel });
    buckets[classification.storageClass].push({
      path: file.relPath,
      reason: classification.reason,
      bytes: file.bytes,
      mtimeMs: file.mtimeMs,
    });
  }
  const counts = Object.fromEntries(CLASS_ORDER.map((name) => [name, buckets[name].length]));
  const bytes = Object.fromEntries(CLASS_ORDER.map((name) => [name, buckets[name].reduce((sum, item) => sum + item.bytes, 0)]));
  return {
    schemaVersion: 1,
    kind: "supervibe-workflow-doctor",
    rootDir,
    supervibeRoot: ".supervibe",
    pass: true,
    counts,
    bytes,
    activeGraphPath: activeGraphRel,
    defaultAgentContext: {
      includes: ["hot"],
      excludes: ["warm", "cold", "trash"],
      policy: "agents should prime from active graph summaries, not raw receipts, backups, traces, or historical snapshots",
    },
    cleanup: {
      userBlocking: false,
      trashCandidates: buckets.trash.length,
      coldCandidates: buckets.cold.length,
      dryRunCommand: "sv gc --artifacts --dry-run",
      applyCommand: "sv gc --artifacts --apply",
    },
    examples: {
      hot: buckets.hot.slice(0, limit),
      warm: buckets.warm.slice(0, limit),
      cold: buckets.cold.slice(0, limit),
      trash: buckets.trash.slice(0, limit),
    },
  };
}

export function formatWorkflowDoctorReport(report = {}) {
  const counts = report.counts || {};
  const bytes = report.bytes || {};
  const lines = [
    "SUPERVIBE_WORKFLOW_DOCTOR",
    "PASS: " + (report.pass === true),
    "USER_BLOCKING: false",
    "ACTIVE_GRAPH: " + (report.activeGraphPath || "none"),
    "DEFAULT_AGENT_CONTEXT: include=hot exclude=warm,cold,trash",
    "HOT: " + (counts.hot || 0) + " files " + (bytes.hot || 0) + " bytes",
    "WARM: " + (counts.warm || 0) + " files " + (bytes.warm || 0) + " bytes",
    "COLD: " + (counts.cold || 0) + " files " + (bytes.cold || 0) + " bytes",
    "TRASH: " + (counts.trash || 0) + " files " + (bytes.trash || 0) + " bytes",
    "CLEANUP_DRY_RUN: " + (report.cleanup?.dryRunCommand || "sv gc --artifacts --dry-run"),
    "CLEANUP_APPLY: " + (report.cleanup?.applyCommand || "sv gc --artifacts --apply"),
    "NEXT_SAFE_ACTION: continue development; inspect cleanup only when noise is slowing agents",
  ];
  appendExamples(lines, "HOT_EXAMPLE", report.examples?.hot);
  appendExamples(lines, "TRASH_EXAMPLE", report.examples?.trash);
  appendExamples(lines, "COLD_EXAMPLE", report.examples?.cold);
  return lines.join("\n");
}

function classifySupervibePath(relPath, { activeGraphRel = null } = {}) {
  const path = normalizeRel(relPath);
  if (!path?.startsWith(".supervibe/")) return { storageClass: "warm", reason: "outside-supervibe" };
  if (activeGraphRel && path === activeGraphRel) return { storageClass: "hot", reason: "active-work-graph" };
  if (/^\.supervibe\/memory\/(index\.json|code\.db(?:-shm|-wal)?|memory\.db|work-items\/index\.json)$/i.test(path)) return { storageClass: "hot", reason: "active-runtime-index" };
  if (/^\.supervibe\/memory\/work-items\/[^/]+\/graph\.json$/i.test(path)) return { storageClass: "warm", reason: "inactive-work-graph" };
  if (/\.bak$/i.test(path) || /\.lock$/i.test(path)) return { storageClass: "trash", reason: "backup-or-lock" };
  if (/\/(preview\.txt|source-plan\.md)$/i.test(path)) return { storageClass: "cold", reason: "optional-snapshot" };
  if (/\.log$/i.test(path)) return { storageClass: "trash", reason: "telemetry-log" };
  if (/\.trace\.|trace|span/i.test(path)) return { storageClass: "cold", reason: "runtime-trace" };
  if (/artifact-snapshots|backfill-(reports|snapshots|reviewed)|agent-reviews/i.test(path)) return { storageClass: "cold", reason: "historical-diagnostic" };
  if (path.includes("/.archive/") || path.includes("/archive/") || path.includes("/.archived/")) return { storageClass: "cold", reason: "archive" };
  if (/workflow-(receipt|invocation)|artifact-links|ledger|agent-invocations|effectiveness/i.test(path)) return { storageClass: "cold", reason: "receipt-or-ledger" };
  if (/^\.supervibe\/artifacts\/(plans|specs|brainstorm|prd|prototypes)\//i.test(path)) return { storageClass: "warm", reason: "durable-artifact" };
  if (/^\.supervibe\/artifacts\/_agent-outputs\//i.test(path)) return { storageClass: "cold", reason: "agent-output-evidence" };
  return { storageClass: "warm", reason: "project-context" };
}

function appendExamples(lines, prefix, items = []) {
  for (const item of items || []) lines.push(prefix + ": " + item.path + " reason=" + item.reason + " bytes=" + item.bytes);
}

function inferActiveGraphPath(rootDir) {
  const indexPath = join(rootDir, ".supervibe", "memory", "work-items", "index.json");
  if (!existsSync(indexPath)) return null;
  try {
    const index = JSON.parse(readFileSync(indexPath, "utf8"));
    return index.activeGraphPath || null;
  } catch {
    return null;
  }
}

function listFiles(startDir, rootDir, acc = []) {
  for (const entry of readdirSync(startDir, { withFileTypes: true })) {
    const abs = join(startDir, entry.name);
    if (entry.isDirectory()) {
      listFiles(abs, rootDir, acc);
      continue;
    }
    if (!entry.isFile()) continue;
    const stat = statSync(abs);
    acc.push({
      relPath: normalizeRel(relative(rootDir, abs)),
      bytes: stat.size,
      mtimeMs: stat.mtimeMs,
    });
  }
  return acc;
}

function normalizeActiveGraphPath(rootDir, value) {
  if (!value) return null;
  const raw = String(value);
  return normalizeRel(isAbsolute(raw) ? relative(rootDir, raw) : raw);
}

function normalizeRel(value) {
  return value ? String(value).replace(/\\/g, "/") : null;
}
