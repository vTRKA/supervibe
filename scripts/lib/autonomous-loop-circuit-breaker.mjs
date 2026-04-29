export function shouldOpenCircuit(history = [], limits = {}) {
  const maxLoops = Number(limits.maxLoops || 20);
  const maxRepairAttempts = Number(limits.maxRepairAttempts || 3);
  const loopCount = history.length;
  if (loopCount >= maxLoops) return { open: true, reason: "max_loops_exceeded" };

  const recent = history.slice(-3);
  if (recent.length === 3 && recent.every((event) => event.progress === false)) {
    return { open: true, reason: "no_progress_for_3_loops" };
  }
  if (recent.length === 3 && recent.every((event) => event.error && event.error === recent[0].error)) {
    return { open: true, reason: "same_error_repeated" };
  }

  const repairAttempts = history.filter((event) => event.type === "repair_attempt").length;
  if (repairAttempts >= maxRepairAttempts) return { open: true, reason: "repair_attempts_exceeded" };

  const permissionDenials = history.filter((event) => event.type === "permission_denial").length;
  if (permissionDenials >= 5) return { open: true, reason: "permission_denials_exceeded" };

  return { open: false, reason: "within_limits" };
}
