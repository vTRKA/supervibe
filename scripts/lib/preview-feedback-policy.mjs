import { basename, normalize, sep } from "node:path";

const REQUIRED_ROOTS = new Set(["prototypes", "mockups", "presentations"]);

export function isFeedbackRequiredPreviewRoot(root) {
  const normalized = normalize(String(root ?? ""));
  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  const base = basename(normalized);
  return REQUIRED_ROOTS.has(base) || parts.some((part) => REQUIRED_ROOTS.has(part));
}

export function assertFeedbackAllowed({ root, noFeedback = false } = {}) {
  if (noFeedback && isFeedbackRequiredPreviewRoot(root)) {
    const normalized = normalize(String(root ?? "")).split(sep).join("/");
    throw new Error(`Feedback overlay is mandatory for design preview roots (${normalized}). Remove --no-feedback or serve a non-design root.`);
  }
}
