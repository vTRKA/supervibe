export function createFailurePacket({
  taskId,
  attemptId,
  contractRef,
  failedScenario,
  expectedEvidence,
  observedEvidence,
  firstDivergentModule = null,
  firstDivergentMarker = null,
  suggestedNextAction = null,
  requeueReason = null,
} = {}) {
  const reason = requeueReason || classifyRequeueReason({ expectedEvidence, observedEvidence, firstDivergentMarker });
  return {
    taskId,
    attemptId,
    contractRef,
    failedScenario,
    expectedEvidence,
    observedEvidence,
    firstDivergentModule,
    firstDivergentMarker,
    suggestedNextAction: suggestedNextAction || nextActionFor(reason),
    requeueReason: reason,
    confidenceCap: confidenceCapFor(reason),
  };
}

export function classifyRequeueReason({ observedEvidence = "", firstDivergentMarker = "" } = {}) {
  const text = `${observedEvidence} ${firstDivergentMarker}`.toLowerCase();
  if (/permission|access|credential|unauthorized/.test(text)) return "missing_access";
  if (/policy|approval|production|deploy/.test(text)) return "policy_block";
  if (/flaky|timeout|intermittent/.test(text)) return "flaky_check";
  if (/contract|interface|schema drift/.test(text)) return "contract_drift";
  if (/missing evidence|no evidence|marker/.test(text)) return "missing_evidence";
  return "implementation_bug";
}

export function shouldOpenFailureCircuit(packets = [], threshold = 3) {
  const recent = packets.slice(-threshold);
  if (recent.length < threshold) return { open: false, reason: "within_limits" };
  const first = signature(recent[0]);
  if (recent.every((packet) => signature(packet) === first)) {
    return { open: true, reason: "same_failure_packet_repeated", signature: first };
  }
  return { open: false, reason: "within_limits" };
}

function confidenceCapFor(reason) {
  if (reason === "policy_block" || reason === "missing_access" || reason === "missing_evidence") return 6;
  if (reason === "contract_drift") return 7;
  if (reason === "flaky_check" || reason === "implementation_bug") return 8;
  return 8;
}

function nextActionFor(reason) {
  if (reason === "missing_access") return "request access reference or block for user input";
  if (reason === "policy_block") return "create or resolve approval gate";
  if (reason === "flaky_check") return "rerun with flake evidence and quarantine if repeated";
  if (reason === "contract_drift") return "update contract or implementation boundary before retry";
  if (reason === "missing_evidence") return "collect required verification evidence before scoring";
  return "requeue to a fresh agent with failure packet context";
}

function signature(packet) {
  return [
    packet.taskId,
    packet.failedScenario,
    packet.firstDivergentModule,
    packet.firstDivergentMarker,
    packet.requeueReason,
  ].join("|");
}
