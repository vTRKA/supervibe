export function recordCalibrationSignal(existing = [], signal = {}) {
  return [
    ...existing,
    {
      taskId: signal.taskId,
      completedScore: Number(signal.completedScore ?? 0),
      outcome: signal.outcome || "unknown",
      source: signal.source || "post-run",
      note: signal.note || "",
      requiresTightening: Number(signal.completedScore ?? 0) >= 9
        && ["reopened", "escaped_defect", "user_correction", "failed_after_completion"].includes(signal.outcome),
    },
  ];
}

export function summarizeCalibration(signals = []) {
  const failures = signals.filter((signal) => signal.requiresTightening);
  return {
    totalSignals: signals.length,
    falsePositiveCount: failures.length,
    status: failures.length > 0 ? "confidence_calibration_required" : "calibrated",
    recommendedAction: failures.length > 0 ? "tighten rubric or add golden trace" : "none",
  };
}
