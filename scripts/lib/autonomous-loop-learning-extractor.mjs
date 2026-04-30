import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { redactSensitiveContent } from "./autonomous-loop-artifact-retention.mjs";

const TEXT_ARTIFACTS = [
  "progress.md",
  "final-report.md",
  "review-comments.md",
  "evidence-summary.md",
];

const JSONL_ARTIFACTS = [
  "failure-packets.jsonl",
  "comments.jsonl",
  "review-comments.jsonl",
];

const PREFIX_TYPES = [
  { pattern: /^(?:LEARNING|CONVENTION):\s*(?<text>.+)$/i, type: "repo-convention", scope: "repo convention" },
  { pattern: /^GOTCHA:\s*(?<text>.+)$/i, type: "integration-gotcha", scope: "integration gotcha" },
  { pattern: /^VERIFIED COMMAND:\s*(?<text>.+)$/i, type: "verified-command", scope: "verified command" },
  { pattern: /^COMMAND CONVENTION:\s*(?<text>.+)$/i, type: "command-convention", scope: "command convention" },
  { pattern: /^TEST CONVENTION:\s*(?<text>.+)$/i, type: "test-convention", scope: "test convention" },
  { pattern: /^BLOCKER:\s*(?<text>.+)$/i, type: "recurring-blocker", scope: "recurring blocker" },
  { pattern: /^ROLLBACK:\s*(?<text>.+)$/i, type: "rollback-note", scope: "rollback note" },
  { pattern: /^REVIEW NOTE:\s*(?<text>.+)$/i, type: "review-note", scope: "review note" },
];

export async function extractDurableLearningsFromRun(runDir, options = {}) {
  const root = resolve(runDir);
  const candidates = [];
  const rejected = [];

  for (const artifact of options.textArtifacts || TEXT_ARTIFACTS) {
    const content = await readOptional(join(root, artifact));
    if (!content) continue;
    const extracted = extractDurableLearningsFromText(content, { source: artifact });
    candidates.push(...extracted.candidates);
    rejected.push(...extracted.rejected);
  }

  for (const artifact of options.jsonlArtifacts || JSONL_ARTIFACTS) {
    const rows = await readJsonlOptional(join(root, artifact));
    const extracted = extractDurableLearningsFromRecords(rows, { source: artifact });
    candidates.push(...extracted.candidates);
    rejected.push(...extracted.rejected);
  }

  return summarizeLearningCandidates(candidates, rejected, { runDir: root });
}

export function extractDurableLearningsFromText(content, { source = "inline" } = {}) {
  const candidates = [];
  const rejected = [];
  for (const [index, rawLine] of String(content || "").split(/\r?\n/).entries()) {
    const parsed = parseLearningLine(rawLine, { source, line: index + 1 });
    if (parsed.accepted) candidates.push(parsed.candidate);
    else if (parsed.reason) rejected.push(parsed.rejection);
  }
  return summarizeLearningCandidates(candidates, rejected);
}

export function extractDurableLearningsFromRecords(records = [], { source = "records" } = {}) {
  const candidates = [];
  const rejected = [];
  const blockerCounts = new Map();
  const blockerSources = new Map();

  for (const [index, record] of records.entries()) {
    const text = [
      record.learning,
      record.convention,
      record.gotcha,
      record.summary,
      record.message,
      record.resolution,
    ].filter(Boolean).join(" ");

    if (text) {
      const parsed = parseLearningLine(text, { source, line: index + 1, fallbackPrefix: record.type });
      if (parsed.accepted) candidates.push(parsed.candidate);
      else if (parsed.reason) rejected.push(parsed.rejection);
    }

    if (record.requeueReason || record.requeue_reason) {
      const reason = String(record.requeueReason || record.requeue_reason);
      const key = normalizeText(reason);
      blockerCounts.set(key, (blockerCounts.get(key) || 0) + 1);
      blockerSources.set(key, { reason, source, line: index + 1 });
    }
  }

  for (const [key, count] of blockerCounts.entries()) {
    if (count < 2) continue;
    const blocker = blockerSources.get(key);
    candidates.push(createCandidate({
      type: "recurring-blocker",
      scope: "recurring blocker",
      summary: `Recurring blocker: ${blocker.reason}`,
      source: blocker.source,
      line: blocker.line,
      evidence: [`${count} occurrences`],
      confidence: 9,
    }));
  }

  return summarizeLearningCandidates(candidates, rejected);
}

export function compactClosedWorkItems({ graph = {}, evidenceIndex = {}, commits = [], rollbackNotes = [] } = {}) {
  const tasks = graph.tasks || graph.workItems || [];
  const evidenceByTask = buildEvidenceIndex(evidenceIndex);
  const commitByTask = groupByTaskId(commits);
  const rollbackByTask = groupByTaskId(rollbackNotes);
  const closedSummaries = [];
  const openItems = [];

  for (const task of tasks) {
    const item = {
      taskId: task.id,
      title: task.title || task.goal || task.id,
      status: task.status || "open",
      blockers: task.blockers || task.blockedBy || task.dependencies || [],
      nextAction: task.nextAction || task.next_action || null,
      evidencePaths: uniqueStrings([
        ...(task.evidencePaths || task.evidence || task.verificationEvidence || []),
        ...(evidenceByTask.get(task.id) || []),
      ]),
      commits: (commitByTask.get(task.id) || []).map((entry) => entry.commit || entry.sha || entry.id).filter(Boolean),
      rollbackNotes: (rollbackByTask.get(task.id) || []).map((entry) => entry.note || entry.summary || entry.text).filter(Boolean),
    };

    if (isClosedStatus(task.status)) {
      closedSummaries.push({
        ...item,
        summary: task.summary || `${item.title} completed with preserved evidence links.`,
      });
    } else {
      openItems.push(item);
    }
  }

  return {
    schema_version: 1,
    generated_at: new Date(0).toISOString(),
    closedSummaries,
    openItems,
  };
}

export async function diagnoseCompactedMemory(summary = {}, { rootDir = process.cwd(), fileExists = defaultFileExists } = {}) {
  const issues = [];
  for (const item of summary.closedSummaries || []) {
    if (!item.taskId) {
      issues.push(issue("invalid-memory-summary", "unknown", "Closed summary is missing taskId"));
    }
    if (!item.evidencePaths?.length) {
      issues.push(issue("missing-memory-evidence", item.taskId || "unknown", "Closed summary has no evidence links"));
    }
    for (const evidencePath of item.evidencePaths || []) {
      const fullPath = isAbsolute(evidencePath) ? evidencePath : join(rootDir, evidencePath);
      if (!(await fileExists(fullPath))) {
        issues.push(issue("stale-memory-summary", item.taskId || "unknown", `Evidence path is missing: ${evidencePath}`));
      }
    }
  }
  return { ok: issues.length === 0, issues };
}

function parseLearningLine(rawLine, { source, line, fallbackPrefix = null } = {}) {
  const original = String(rawLine || "");
  const text = original.replace(/^\s*[-*]\s+/, "").trim();
  if (!text) return { accepted: false };

  const rejectionReason = rejectionReasonFor(text);
  if (rejectionReason) {
    return {
      accepted: false,
      reason: rejectionReason,
      rejection: { source, line, reason: rejectionReason, text: redactSensitiveContent(text).slice(0, 240) },
    };
  }

  for (const entry of PREFIX_TYPES) {
    const match = entry.pattern.exec(text);
    if (!match) continue;
    return {
      accepted: true,
      candidate: createCandidate({
        type: entry.type,
        scope: entry.scope,
        summary: cleanupSummary(match.groups.text),
        source,
        line,
      }),
    };
  }

  if (fallbackPrefix && /learning|convention|gotcha|blocker|command|rollback|review/i.test(String(fallbackPrefix))) {
    return {
      accepted: true,
      candidate: createCandidate({
        type: normalizeCandidateType(fallbackPrefix),
        scope: normalizeScope(fallbackPrefix),
        summary: cleanupSummary(text),
        source,
        line,
      }),
    };
  }

  return { accepted: false };
}

function createCandidate({ type, scope, summary, source, line = null, evidence = [], confidence = 8 } = {}) {
  const cleanSummary = cleanupSummary(summary);
  return {
    id: createStableId([type, scope, cleanSummary]),
    type,
    scope,
    summary: cleanSummary,
    source,
    line,
    evidence: uniqueStrings(evidence),
    confidence,
    status: "candidate",
  };
}

function summarizeLearningCandidates(candidates, rejected, extra = {}) {
  const byId = new Map();
  for (const candidate of candidates) {
    if (!candidate?.summary) continue;
    const existing = byId.get(candidate.id);
    if (existing) {
      byId.set(candidate.id, {
        ...existing,
        evidence: uniqueStrings([...(existing.evidence || []), ...(candidate.evidence || [])]),
      });
    } else {
      byId.set(candidate.id, candidate);
    }
  }
  const deduped = [...byId.values()];
  return {
    ...extra,
    candidates: deduped,
    rejected,
    summary: {
      candidates: deduped.length,
      rejected: rejected.length,
      scopes: deduped.reduce((acc, candidate) => {
        acc[candidate.scope] = (acc[candidate.scope] || 0) + 1;
        return acc;
      }, {}),
    },
  };
}

function rejectionReasonFor(text) {
  if (redactSensitiveContent(text) !== text) return "sensitive-content";
  if (/\b(raw prompt|prompt:|user said|private credential)\b/i.test(text)) return "raw-prompt-or-private-context";
  if (/\b(maybe|perhaps|unresolved|speculation|todo\??|not sure)\b/i.test(text)) return "unresolved-speculation";
  if (/^\w*Error:|^\s*at\s+\S+.*:\d+:\d+\)?$/i.test(text)) return "stack-trace";
  if (text.length > 500) return "too-long-for-guidance";
  return null;
}

function cleanupSummary(value) {
  return redactSensitiveContent(String(value || ""))
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
}

function normalizeCandidateType(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("command")) return "command-convention";
  if (text.includes("gotcha")) return "integration-gotcha";
  if (text.includes("blocker")) return "recurring-blocker";
  if (text.includes("rollback")) return "rollback-note";
  if (text.includes("review")) return "review-note";
  return "repo-convention";
}

function normalizeScope(value) {
  return normalizeCandidateType(value).replace(/-/g, " ");
}

function createStableId(parts) {
  return createHash("sha1").update(parts.filter(Boolean).join("\n")).digest("hex").slice(0, 12);
}

function buildEvidenceIndex(evidenceIndex = {}) {
  const byTask = new Map();
  const add = (taskId, values = []) => {
    if (!taskId) return;
    byTask.set(taskId, uniqueStrings([...(byTask.get(taskId) || []), ...values.filter(Boolean)]));
  };

  for (const item of evidenceIndex.items || []) {
    add(item.taskId, item.evidencePaths || item.verificationEvidence || []);
  }
  for (const attempt of evidenceIndex.attempts || []) {
    add(attempt.taskId, [...(attempt.verificationEvidence || []), attempt.outputPath].filter(Boolean));
  }
  for (const handoff of evidenceIndex.handoffs || []) {
    add(handoff.taskId, handoff.verificationEvidence || []);
  }
  for (const [taskId, values] of Object.entries(evidenceIndex.byTaskId || {})) {
    add(taskId, Array.isArray(values) ? values : values.evidencePaths || values.verificationEvidence || []);
  }
  return byTask;
}

function groupByTaskId(items = []) {
  const grouped = new Map();
  for (const item of items) {
    const taskId = item.taskId || item.task_id;
    if (!taskId) continue;
    grouped.set(taskId, [...(grouped.get(taskId) || []), item]);
  }
  return grouped;
}

function isClosedStatus(status) {
  return ["complete", "completed", "done", "closed"].includes(String(status || "").toLowerCase());
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return "";
    throw err;
  }
}

async function readJsonlOptional(path) {
  const content = await readOptional(path);
  const rows = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      rows.push({ type: "invalid-jsonl", summary: line });
    }
  }
  return rows;
}

async function defaultFileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function issue(code, target, message) {
  return { code, target, message };
}
