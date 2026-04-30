import { writeFile } from "node:fs/promises";
import { createTrackerMapping, readTrackerMapping, writeTrackerMapping } from "./supervibe-task-tracker-sync.mjs";
import { diagnoseWorkItemDaemonState } from "./supervibe-work-item-daemon.mjs";

export function diagnoseTaskTracker({ graph = {}, mapping = {}, externalState = {}, claims = [], sessions = [], daemonState = null } = {}) {
  const issues = [];
  const items = graph.items || [];
  const mappedItems = mapping.items || {};
  const nativeIds = new Set(items.map((item) => item.itemId));
  const externalIds = new Map();

  for (const item of items) {
    if (!mappedItems[item.itemId]) {
      issues.push(issue("missing-mapping", item.itemId, `Missing tracker mapping for ${item.itemId}.`, { fixable: true }));
    }
  }

  for (const [nativeId, record] of Object.entries(mappedItems)) {
    if (!nativeIds.has(nativeId)) {
      issues.push(issue("orphan-mapping", nativeId, `Mapping references native item not present in graph: ${nativeId}.`, { fixable: true }));
    }
    if (record.externalId) {
      const list = externalIds.get(record.externalId) || [];
      list.push(nativeId);
      externalIds.set(record.externalId, list);
    }
  }

  for (const [externalId, nativeIdList] of externalIds.entries()) {
    if (nativeIdList.length > 1) {
      issues.push(issue("duplicate-external-task", nativeIdList[0], `External task ${externalId} is mapped by multiple native items.`, { externalId, nativeIds: nativeIdList }));
    }
  }

  const externalTaskIds = new Set((externalState.tasks || []).map((task) => task.externalId));
  for (const externalTask of externalState.tasks || []) {
    if (![...externalIds.keys()].includes(externalTask.externalId)) {
      issues.push(issue("orphan-external-task", externalTask.externalId, `External task has no native mapping: ${externalTask.externalId}.`, { externalId: externalTask.externalId }));
    }
  }

  const now = Date.now();
  for (const claim of claims || []) {
    if (claim.status === "active" && claim.expiresAt && Date.parse(claim.expiresAt) <= now) {
      issues.push(issue("stale-claim", claim.taskId, `Claim ${claim.claimId} is expired but still active.`, { claimId: claim.claimId, fixable: true }));
    }
  }

  for (const session of sessions || []) {
    if (session.status === "active" && mapping.graphId && session.epicId && session.epicId !== mapping.graphId) {
      issues.push(issue("worktree-visibility-drift", session.sessionId, `Worktree session ${session.sessionId} sees a different epic.`, { sessionId: session.sessionId, epicId: session.epicId, graphId: mapping.graphId }));
    }
  }

  if (daemonState) {
    const daemonDiagnosis = diagnoseWorkItemDaemonState(daemonState);
    for (const daemonIssue of daemonDiagnosis.issues) {
      issues.push(issue(daemonIssue.code, daemonIssue.id, daemonIssue.message));
    }
  }

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? "clean" : "issues-found",
    issues,
    counts: {
      missingMappings: issues.filter((item) => item.code === "missing-mapping").length,
      duplicateExternalTasks: issues.filter((item) => item.code === "duplicate-external-task").length,
      orphanExternalTasks: issues.filter((item) => item.code === "orphan-external-task").length,
      staleClaims: issues.filter((item) => item.code === "stale-claim").length,
      staleDaemons: issues.filter((item) => item.code === "stale-watch-daemon" || item.code === "orphan-watch-daemon").length,
    },
  };
}

export async function repairTaskTracker({ graph = {}, mappingPath, mapping = null, fix = false } = {}) {
  const current = mapping || await readTrackerMapping(mappingPath);
  const diagnosis = diagnoseTaskTracker({ graph, mapping: current });
  if (!fix) return { changed: false, diagnosis };
  const backupPath = `${mappingPath}.backup`;
  await writeFile(backupPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  const repaired = createTrackerMapping({ graph, adapterId: current.adapterId, existingMapping: current });
  for (const nativeId of Object.keys(repaired.items)) {
    if (!(graph.items || []).some((item) => item.itemId === nativeId)) {
      delete repaired.items[nativeId];
    }
  }
  await writeTrackerMapping(mappingPath, repaired);
  return { changed: true, backupPath, mapping: repaired, diagnosis };
}

export function formatTaskTrackerDoctorReport(diagnosis = diagnoseTaskTracker()) {
  const lines = [
    "SUPERVIBE_TASK_TRACKER_DOCTOR",
    `STATUS: ${diagnosis.status}`,
    `ISSUES: ${diagnosis.issues.length}`,
  ];
  for (const item of diagnosis.issues) {
    lines.push(`- ${item.code}: ${item.message}`);
  }
  return lines.join("\n");
}

function issue(code, itemId, message, extra = {}) {
  return { code, itemId, message, ...extra };
}
