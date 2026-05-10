export function validateFeedbackPayloadBinding(html = "", {
  feedbackTargetId = "",
  overlayRequired = true,
} = {}) {
  const text = String(html || "");
  const targetId = String(feedbackTargetId || "").trim();
  const markerPresent = hasFeedbackOverlayMarker(text);
  const targetPresent = targetId ? text.includes(targetId) : false;
  const payloadBindsTarget = targetId ? hasPayloadTargetBinding(text, targetId) : false;
  const dispatchesPayload = hasPayloadDispatch(text);
  const issues = [];

  if (overlayRequired && !markerPresent) {
    issues.push("feedback overlay marker is missing");
  }
  if (overlayRequired && !targetPresent) {
    issues.push("feedback target id is not present in the artifact");
  }
  if (overlayRequired && !payloadBindsTarget) {
    issues.push("feedback payload does not bind feedbackTargetId");
  }
  if (overlayRequired && !dispatchesPayload) {
    issues.push("feedback payload dispatch is not detectable");
  }

  return {
    pass: issues.length === 0,
    markerPresent,
    targetPresent,
    payloadBindsTarget,
    dispatchesPayload,
    issues,
  };
}

export function hasFeedbackOverlayMarker(text = "") {
  return /data-feedback-overlay|data-supervibe-feedback-target|feedback-overlay|supervibeFeedbackOverlay|feedbackTargetId/i.test(String(text || ""));
}

function hasPayloadTargetBinding(text = "", targetId = "") {
  const escaped = escapeRegExp(targetId);
  const patterns = [
    new RegExp(`feedbackTargetId\\s*[:=]\\s*["']${escaped}["']`, "i"),
    new RegExp(`["']feedbackTargetId["']\\s*:\\s*["']${escaped}["']`, "i"),
    new RegExp(`targetContext\\s*[:=][\\s\\S]{0,220}["']${escaped}["']`, "i"),
    new RegExp(`supervibeFeedback(?:Payload|Target|Context)[\\s\\S]{0,220}["']${escaped}["']`, "i"),
  ];
  return patterns.some((pattern) => pattern.test(text));
}

function hasPayloadDispatch(text = "") {
  return /sendBeacon\s*\(|fetch\s*\(|postMessage\s*\(|submitFeedback|sendFeedback|recordFeedback|supervibeFeedbackChannel|feedbackPayload/i.test(String(text || ""));
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
