const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{12,}/g,
  /(api[_-]?key\s*[:=]\s*)[^\s"']+/gi,
  /(token\s*[:=]\s*)[^\s"']+/gi,
  /(password\s*[:=]\s*)[^\s"']+/gi,
];

export function redactSensitiveContent(value) {
  let text = String(value || "");
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (match, prefix = "") => `${prefix}[REDACTED]`);
  }
  return text;
}

export function createRetentionPolicy(options = {}) {
  return {
    retainDays: Number(options.retainDays || 14),
    privacyMode: options.privacyMode || "summary",
    retainRawMcpOutput: Boolean(options.retainRawMcpOutput),
    retainScreenshots: Boolean(options.retainScreenshots),
    pruningCommand: "npm run supervibe:loop -- --prune-expired",
  };
}

export function retentionConfidenceCap({ policy, rawSensitiveContentRetained = false, secretPersisted = false } = {}) {
  if (secretPersisted) return 5;
  if (rawSensitiveContentRetained) return 7;
  if (!policy) return 8;
  return 10;
}
