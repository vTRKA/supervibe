import { appendFile, mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

const SECRET_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|(?:api[_-]?key|token|secret|password|passwd)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{8,})/gi;

export function defaultChangeSummaryPath(rootDir = process.cwd()) {
  return join(rootDir, ".claude", "memory", "anchors", "change-summaries.jsonl");
}

export function createChangeSummary({
  summaryId = null,
  taskId,
  filePath,
  beforeHash = null,
  afterHash = null,
  summary = "",
  why = "",
  preserve = [],
  evidenceRefs = [],
  verificationRefs = [],
  commit = null,
  accepted = true,
  speculative = false,
  rejected = false,
  createdAt = new Date().toISOString(),
} = {}) {
  const safe = {
    taskId: redact(taskId || "task-unknown"),
    filePath: normalizePath(filePath || "unknown"),
    beforeHash,
    afterHash,
    summary: redact(summary),
    why: redact(why),
    preserve: splitList(preserve).map(redact),
    evidenceRefs: splitList(evidenceRefs).map(redact),
    verificationRefs: splitList(verificationRefs).map(redact),
    commit: commit ? redact(commit) : null,
    accepted: Boolean(accepted) && rejected !== true,
    speculative: Boolean(speculative),
    rejected: Boolean(rejected),
    createdAt,
  };
  const seed = `${safe.taskId}:${safe.filePath}:${safe.summary}:${safe.afterHash || ""}:${safe.commit || ""}`;
  return {
    summaryId: summaryId || `summary-${createHash("sha1").update(seed).digest("hex").slice(0, 12)}`,
    ...safe,
  };
}

export async function appendChangeSummary(filePath, input = {}) {
  await mkdir(dirname(filePath), { recursive: true });
  const summary = createChangeSummary(input);
  await appendFile(filePath, `${JSON.stringify(summary)}\n`, "utf8");
  return summary;
}

export async function readChangeSummaries(filePath = defaultChangeSummaryPath()) {
  try {
    const content = await readFile(filePath, "utf8");
    return content.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export function compactChangeSummaries(summaries = []) {
  const byId = new Map();
  for (const summary of summaries.map(createChangeSummary)) {
    byId.set(summary.summaryId, summary);
  }
  return [...byId.values()].sort((a, b) => String(a.filePath).localeCompare(String(b.filePath)) || String(a.createdAt).localeCompare(String(b.createdAt)));
}

export function activeChangeSummaries(summaries = []) {
  return summaries.filter((summary) => summary.accepted === true && summary.speculative !== true && summary.rejected !== true);
}

function summarizeChangesByFile(summaries = []) {
  const active = activeChangeSummaries(compactChangeSummaries(summaries));
  const byFile = new Map();
  for (const summary of active) {
    if (!byFile.has(summary.filePath)) byFile.set(summary.filePath, []);
    byFile.get(summary.filePath).push(summary);
  }
  return [...byFile.entries()].map(([filePath, fileSummaries]) => ({
    filePath,
    summaries: fileSummaries,
    latest: fileSummaries.at(-1),
  }));
}

export function formatChangeSummaryReport(summaries = []) {
  const compacted = compactChangeSummaries(summaries);
  const active = activeChangeSummaries(compacted);
  return [
    "SUPERVIBE_CHANGE_SUMMARIES",
    `TOTAL: ${summaries.length}`,
    `COMPACTED: ${compacted.length}`,
    `ACTIVE: ${active.length}`,
    `FILES: ${new Set(compacted.map((summary) => summary.filePath)).size}`,
  ].join("\n");
}

function splitList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return String(value).split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

function normalizePath(path = "") {
  return String(path || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function redact(value = "") {
  return String(value || "").replace(SECRET_PATTERN, "[REDACTED_SECRET]");
}
