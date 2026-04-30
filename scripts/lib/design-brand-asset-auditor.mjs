import { extname, basename } from "node:path";

const DEFAULT_EXTENSIONS = new Set([".svg", ".png", ".webp", ".jpg", ".jpeg"]);

export function auditBrandAsset({
  fileName,
  sizeBytes = 0,
  maxSizeBytes = 1_000_000,
  allowedExtensions = DEFAULT_EXTENSIONS,
  requiredNameParts = [],
  candidatePalette = [],
  approvedPalette = [],
} = {}) {
  const issues = [];
  const ext = extname(fileName ?? "").toLowerCase();
  const name = basename(fileName ?? "");

  if (!fileName) {
    issues.push(issue("missing-file-name", "Asset file name is required.", "blocker"));
  } else if (!allowedExtensions.has(ext)) {
    issues.push(issue("unsupported-extension", `Unsupported asset extension ${ext || "(none)"}.`, "blocker"));
  }

  if (sizeBytes > maxSizeBytes) {
    issues.push(issue("asset-too-large", `Asset is ${sizeBytes} bytes; max is ${maxSizeBytes}.`, "warning"));
  }

  for (const part of requiredNameParts) {
    if (!name.toLowerCase().includes(String(part).toLowerCase())) {
      issues.push(issue("asset-name-missing-part", `Asset name should include ${part}.`, "warning"));
    }
  }

  const palette = comparePalettes(candidatePalette, approvedPalette);
  if (approvedPalette.length > 0 && palette.unmatchedCandidateColors.length > 0) {
    issues.push(issue("palette-drift", "Candidate colors are not present in the approved brand palette.", "warning", palette));
  }

  return {
    pass: !issues.some((entry) => entry.severity === "blocker"),
    issues,
    palette,
  };
}

export function comparePalettes(candidatePalette = [], approvedPalette = []) {
  const normalizedApproved = new Set(approvedPalette.map(normalizeHex).filter(Boolean));
  const normalizedCandidate = candidatePalette.map(normalizeHex).filter(Boolean);
  const unmatchedCandidateColors = normalizedCandidate.filter((color) => !normalizedApproved.has(color));
  const matchedCandidateColors = normalizedCandidate.filter((color) => normalizedApproved.has(color));
  return {
    approvedCount: normalizedApproved.size,
    candidateCount: normalizedCandidate.length,
    matchedCandidateColors,
    unmatchedCandidateColors,
    driftRatio: normalizedCandidate.length === 0 ? 0 : unmatchedCandidateColors.length / normalizedCandidate.length,
  };
}

export function auditBrandToTokenSync({ brandPalette = {}, tokenPalette = {} } = {}) {
  const issues = [];
  const brandRoles = Object.keys(brandPalette);
  for (const role of brandRoles) {
    const brandColor = normalizeHex(brandPalette[role]);
    const tokenColor = normalizeHex(tokenPalette[role]);
    if (!tokenColor) {
      issues.push(issue("missing-token-role", `Missing token role ${role}.`, "blocker"));
    } else if (brandColor !== tokenColor) {
      issues.push(issue("token-color-drift", `Token role ${role} does not match approved brand color.`, "warning", {
        role,
        brandColor,
        tokenColor,
      }));
    }
  }
  return {
    pass: !issues.some((entry) => entry.severity === "blocker"),
    issues,
  };
}

export function normalizeHex(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const match = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!match) return null;
  const hex = match[1];
  if (hex.length === 3) {
    return `#${hex.split("").map((ch) => ch + ch).join("")}`;
  }
  return `#${hex.slice(0, 6)}`;
}

function issue(code, message, severity, details = undefined) {
  return { code, message, severity, ...(details ? { details } : {}) };
}
