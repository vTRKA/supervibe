export function planWorkspaceIsolation(tasks = []) {
  const ownership = new Map();
  const conflicts = [];
  for (const task of tasks) {
    for (const file of collectTaskWriteSet(task)) {
      if (ownership.has(file)) {
        conflicts.push({ file, firstTaskId: ownership.get(file), secondTaskId: task.id });
      } else {
        ownership.set(file, task.id);
      }
    }
  }
  return {
    ownership: Object.fromEntries(ownership),
    conflicts,
    safeParallelSet: conflicts.length === 0 ? tasks.map((task) => task.id) : [],
    serializedSet: conflicts.length > 0 ? [...new Set(conflicts.flatMap((item) => [item.firstTaskId, item.secondTaskId]))] : [],
    worktreeRecommendation: conflicts.length > 0 ? "use-isolated-worktree-or-serialize" : "shared-workspace-ok",
    status: conflicts.length > 0 ? "workspace_conflict" : "ok",
  };
}

export function collectTaskWriteSet(task = {}) {
  const fromWriteScope = (task.writeScope || task.write_scope || []).map((entry) =>
    typeof entry === "string" ? entry : entry.path
  );
  return [
    ...(task.filesToModify || []),
    ...(task.probableFiles || []),
    ...fromWriteScope,
  ].filter(Boolean);
}

export function validateWorktreeExecutionWorkspace(options = {}) {
  const issues = [];
  if (!options.worktreePath) issues.push("missing-worktree-path");
  if (options.worktreePath && options.rootDir && normalizePath(options.worktreePath) === normalizePath(options.rootDir)) {
    issues.push("worktree-cannot-be-main-root");
  }
  if (options.dirtyMainWorkspace === true && !options.allowDirtyMainWorkspace) {
    issues.push("dirty-main-workspace-needs-explicit-approval");
  }
  if (Array.isArray(options.baselineChecks) && options.baselineChecks.some((check) => check.status === "failed")) {
    issues.push("baseline-check-failed");
  }
  return {
    valid: issues.length === 0,
    issues,
    status: issues.length === 0 ? "worktree-ready" : "worktree-blocked",
  };
}

function normalizePath(value) {
  return String(value ?? "").replace(/\\/g, "/");
}
