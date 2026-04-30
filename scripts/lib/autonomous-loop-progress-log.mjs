import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const SECRET_PATTERNS = [
  /api[_-]?key\s*[:=]\s*["']?[a-z0-9._-]{12,}/i,
  /token\s*[:=]\s*["']?[a-z0-9._-]{12,}/i,
  /password\s*[:=]\s*["']?[^"'\s]{8,}/i,
  /secret\s*[:=]\s*["']?[a-z0-9._-]{12,}/i,
];

export function createProgressEntry({
  taskId,
  attemptId,
  section,
  summary,
  nextAction = "none",
  evidencePaths = [],
  scoreId = null,
  decision = null,
  blocker = null,
  contextBudget = null,
  at = new Date(),
} = {}) {
  assertNoRawSecrets([summary, nextAction, decision, blocker, ...evidencePaths].filter(Boolean).join("\n"));
  return {
    taskId,
    attemptId,
    section,
    summary,
    nextAction,
    evidencePaths,
    scoreId,
    decision,
    blocker,
    contextBudget,
    at: at instanceof Date ? at.toISOString() : new Date(at).toISOString(),
  };
}

export function createResumeNotes({ task, claim, nextAction, evidencePaths = [], blocker = null } = {}) {
  const summary = `${task.id}: ${task.goal}`;
  assertNoRawSecrets(`${summary}\n${nextAction}\n${evidencePaths.join("\n")}\n${blocker || ""}`);
  return {
    taskId: task.id,
    attemptId: claim?.attemptId || null,
    activeAgent: claim?.agentId || null,
    claimId: claim?.claimId || null,
    nextAction,
    blocker,
    evidencePaths,
    summary,
    updatedAt: new Date().toISOString(),
  };
}

export async function writeProgressMarkdown(filePath, entries = []) {
  await mkdir(dirname(filePath), { recursive: true });
  const markdown = renderProgressMarkdown(entries);
  await writeFile(filePath, markdown, "utf8");
  return filePath;
}

export function renderProgressMarkdown(entries = []) {
  const groups = {
    COMPLETED: [],
    IN_PROGRESS: [],
    NEXT: [],
    DECISIONS: [],
    BLOCKERS: [],
    EVIDENCE: [],
  };
  for (const entry of entries) {
    const section = groups[entry.section] ? entry.section : "NEXT";
    groups[section].push(entry);
    for (const evidencePath of entry.evidencePaths || []) {
      groups.EVIDENCE.push({ ...entry, summary: evidencePath });
    }
    if (entry.decision) groups.DECISIONS.push({ ...entry, summary: entry.decision });
    if (entry.blocker) groups.BLOCKERS.push({ ...entry, summary: entry.blocker });
  }

  const lines = ["# Autonomous Loop Progress", ""];
  for (const [section, sectionEntries] of Object.entries(groups)) {
    lines.push(`## ${section}`);
    if (sectionEntries.length === 0) {
      lines.push("- none");
    } else {
      for (const entry of sectionEntries) {
        lines.push(`- ${entry.at || ""} task=${entry.taskId} attempt=${entry.attemptId || "none"} ${entry.summary}`);
        if (entry.nextAction && entry.nextAction !== "none") lines.push(`  - next: ${entry.nextAction}`);
        if (entry.scoreId) lines.push(`  - score: ${entry.scoreId}`);
        if (entry.contextBudget) lines.push(`  - context: ${entry.contextBudget.status} ${entry.contextBudget.estimatedChars}/${entry.contextBudget.maxChars}`);
      }
    }
    lines.push("");
  }
  return `${lines.join("\n").trim()}\n`;
}

export function summarizeProgress(entries = []) {
  return {
    completed: entries.filter((entry) => entry.section === "COMPLETED").length,
    in_progress: entries.filter((entry) => entry.section === "IN_PROGRESS").length,
    blockers: entries.filter((entry) => entry.blocker).length,
    evidence: entries.reduce((count, entry) => count + (entry.evidencePaths?.length || 0), 0),
    context_warnings: entries.filter((entry) => entry.contextBudget?.warnings?.length).length,
  };
}

export function assertNoRawSecrets(text) {
  if (SECRET_PATTERNS.some((pattern) => pattern.test(String(text || "")))) {
    throw new Error("progress log entry contains raw secret-like content");
  }
}
