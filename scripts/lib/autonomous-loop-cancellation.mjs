import { nowIso } from "./autonomous-loop-constants.mjs";

export function createCancellationToken(runId, reason = "user_requested_stop") {
  return {
    runId,
    requestedAt: nowIso(),
    reason,
    status: "cancel_requested",
  };
}

export function applyCancellation(state, token) {
  return {
    ...state,
    status: "CANCELLED",
    stop_reason: token.reason,
    cancellation: token,
    tasks: (state.tasks || []).map((task) =>
      task.status === "complete" ? task : { ...task, status: "cancelled" },
    ),
  };
}

export function canTerminateProcess(processEntry) {
  return processEntry?.startedByLoop === true && processEntry?.trackedInSideEffectLedger === true;
}
