import { evaluateMemoryGcSchedule, scanMemoryGc } from "./supervibe-memory-gc.mjs";
import { scanWorkItemGc } from "./supervibe-work-item-gc.mjs";

export async function buildGcHints({
  rootDir = process.cwd(),
  now = new Date().toISOString(),
  retentionDays = 14,
  staleOpenDays = 90,
  includeStaleOpen = false,
} = {}) {
  const [workItems, memory] = await Promise.all([
    scanWorkItemGc({ rootDir, now, retentionDays, staleOpenDays, includeStaleOpen }),
    scanMemoryGc({ rootDir, now }),
  ]);
  const memorySchedule = await evaluateMemoryGcSchedule({ rootDir, now, scan: memory });
  const needsAttention = workItems.summary.candidates > 0 || memory.summary.candidates > 0;
  return {
    schemaVersion: 1,
    generatedAt: now,
    needsAttention,
    workItems: summarizeWorkItems(workItems),
    memory: { ...summarizeMemory(memory), schedule: memorySchedule },
    nextAction: memorySchedule.due
      ? memorySchedule.nextAction
      : needsAttention
        ? "run npm run supervibe:gc -- --all --dry-run"
      : "no cleanup needed",
  };
}

export function formatGcHints(hints = {}) {
  return [
    "SUPERVIBE_GC_HINTS",
    `NEEDS_ATTENTION: ${Boolean(hints.needsAttention)}`,
    `WORK_ITEM_CANDIDATES: ${hints.workItems?.candidates || 0}`,
    `WORK_ITEM_TOP: ${(hints.workItems?.top || []).map((item) => `${item.graphId}:${item.reason}`).join(",") || "none"}`,
    `MEMORY_CANDIDATES: ${hints.memory?.candidates || 0}`,
    `MEMORY_TOP: ${(hints.memory?.top || []).map((item) => `${item.id}:${item.reason}`).join(",") || "none"}`,
    `MEMORY_GC_DUE: ${Boolean(hints.memory?.schedule?.due)}`,
    `MEMORY_GC_NEXT: ${hints.memory?.schedule?.nextRunAt || "unknown"}`,
    `NEXT_ACTION: ${hints.nextAction || "inspect status"}`,
  ].join("\n");
}

function summarizeWorkItems(scan) {
  return {
    scanned: scan.summary?.scanned || 0,
    candidates: scan.summary?.candidates || 0,
    active: scan.summary?.active || 0,
    top: (scan.candidates || []).slice(0, 5).map((candidate) => ({
      graphId: candidate.graphId,
      reason: candidate.reason,
      ageDays: candidate.ageDays,
      open: candidate.counts?.open || 0,
      done: candidate.counts?.done || 0,
    })),
  };
}

function summarizeMemory(scan) {
  return {
    scanned: scan.summary?.scanned || 0,
    candidates: scan.summary?.candidates || 0,
    active: scan.summary?.active || 0,
    top: (scan.candidates || []).slice(0, 5).map((candidate) => ({
      id: candidate.id,
      category: candidate.category,
      reason: candidate.reason,
      ageDays: candidate.ageDays,
      confidence: candidate.confidence,
    })),
  };
}
