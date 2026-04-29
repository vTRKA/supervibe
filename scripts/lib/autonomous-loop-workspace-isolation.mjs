export function planWorkspaceIsolation(tasks = []) {
  const ownership = new Map();
  const conflicts = [];
  for (const task of tasks) {
    for (const file of task.filesToModify || task.probableFiles || []) {
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
    status: conflicts.length > 0 ? "workspace_conflict" : "ok",
  };
}
