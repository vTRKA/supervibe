export const REDACTION_PLACEHOLDERS = Object.freeze({
  secret: "[REDACTED_SECRET]",
  cookie: "[REDACTED_COOKIE]",
  envValue: "[REDACTED_ENV_VALUE]",
  privatePath: "[REDACTED_PRIVATE_PATH]",
  providerConfigPath: "[REDACTED_PROVIDER_CONFIG_PATH]",
  privateUrl: "[REDACTED_PRIVATE_URL]",
  receiptPayload: "[REDACTED_RECEIPT_PAYLOAD]",
});

export const DEFAULT_PUBLIC_FIELD_ALLOWLIST = Object.freeze([
  "action", "actionId", "activeWorkflow", "applied", "availableOperations", "blocked",
  "blockers", "changes", "checks", "cliEquivalent", "code", "command", "degraded",
  "degradedMode", "description", "error", "exitCode", "explanation", "graphQuality",
  "hardStop", "help", "id", "indexMode", "intent", "label", "ledgerStatus",
  "message", "mode", "mutationPolicy", "nodes", "ok", "operation", "operationId",
  "operations", "privacy", "privacyBoundary", "query", "reason", "receiptIds",
  "results", "riskClass", "schemaVersion", "source", "status", "surface", "target",
  "validation", "verdict", "why",
]);

export const DEFAULT_REDACTION_PATTERNS = Object.freeze([
  rule("private-key", /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, REDACTION_PLACEHOLDERS.secret),
  rule("openai-key", /\bsk-[A-Za-z0-9_-]{12,}\b/g, REDACTION_PLACEHOLDERS.secret),
  rule("github-token", /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, REDACTION_PLACEHOLDERS.secret),
  rule("aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, REDACTION_PLACEHOLDERS.secret),
  rule("jwt", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, REDACTION_PLACEHOLDERS.secret),
  rule("bearer-header", /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer " + REDACTION_PLACEHOLDERS.secret),
  rule("key-value-secret", /\b((?:api[_-]?key|auth[_-]?token|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|secret|token)\s*[:=]\s*)("[^"]+"|'[^']+'|[^\s,;]+)/gi, "$1" + REDACTION_PLACEHOLDERS.secret),
  rule("cookie-header", /\b((?:set-)?cookie\s*[:=]\s*)("[^"]+"|'[^']+'|[^\r\n;]+(?:;[^\r\n;]+)*)/gi, "$1" + REDACTION_PLACEHOLDERS.cookie),
  rule("env-assignment", /\b([A-Z][A-Z0-9_]{2,}\s*=\s*)("[^"]+"|'[^']+'|[^\s]+)/g, "$1" + REDACTION_PLACEHOLDERS.envValue),
  rule("provider-config-path", /(?:[A-Za-z]:)?[\\/](?:Users|home)[\\/][^"'`\s<>|]+[\\/]\.(?:codex|claude|gemini|cursor|opencode)(?:[\\/][^"'`\s<>|]*)?/gi, REDACTION_PLACEHOLDERS.providerConfigPath),
  rule("absolute-user-path", /(?:[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^"'`\n\r<>|]+|[\\/](?:home|Users)[\\/][^"'`\n\r<>|]+)/g, REDACTION_PLACEHOLDERS.privatePath),
  rule("workspace-path", /\b[A-Za-z]:[\\/][^"'`\n\r<>|]*(?:ggsel projects|workspace|workspaces|projects)[\\/][^"'`\n\r<>|]*/gi, REDACTION_PLACEHOLDERS.privatePath),
  rule("sensitive-dotfile-path", /(^|[\s"'`(])(?:\.env(?:\.[A-Za-z0-9_-]+)?|[^"'`\s<>|]*[\\/]\.(?:env|aws|ssh|npmrc|netrc)(?:[\\/][^"'`\s<>|]*)?)/gi, (_match, prefix = "") => prefix + REDACTION_PLACEHOLDERS.privatePath),
  rule("private-url", /\b(?:https?|file):\/\/[^\s"'`<>]+/gi, redactUrlMatch),
]);

export const FACADE_REDACTION_METADATA = deepFreeze({
  schemaVersion: 1,
  policyId: "supervibe-facade-output-redaction-v1",
  mode: "deterministic-local",
  placeholders: REDACTION_PLACEHOLDERS,
  publicFieldAllowlist: DEFAULT_PUBLIC_FIELD_ALLOWLIST,
  patternIds: DEFAULT_REDACTION_PATTERNS.map((item) => item.id),
  rawReceiptFields: ["payload", "rawPayload", "receiptPayload", "evidencePayload", "stdout", "stderr", "logs", "diff"],
  redacts: [
    "tokens",
    "api-keys",
    "env-values",
    "cookies",
    "private-paths",
    "provider-config-paths",
    "private-urls",
    "raw-receipt-payload-hints",
  ],
});

const SENSITIVE_FIELD_RE = /(?:api[_-]?key|authorization|cookie|credential|env(?:ironment)?|key|password|passwd|private[_-]?key|secret|session|token)/i;
const RECEIPT_CONTEXT_RE = /receipt|evidence|invocation|workflow/i;
const RAW_PAYLOAD_FIELD_RE = /^(?:payload|rawPayload|receiptPayload|evidencePayload|stdout|stderr|logs|diff|raw|body|content)$/i;
const PRIVATE_URL_QUERY_RE = /(?:token|secret|password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|cookie|signature|sig|credential)=/i;

export function redactSensitiveValue(value, options = {}) {
  const path = Array.isArray(options.path) ? options.path : [];
  const risk = classifyRedactionRisk(value, { ...options, path });
  if (risk.redactWholeValue) return risk.replacement;
  if (typeof value !== "string") return value;
  return applyPatterns(value, options.patterns || DEFAULT_REDACTION_PATTERNS);
}

export function redactFacadePayload(payload, options = {}) {
  const metadata = { redactionPolicy: FACADE_REDACTION_METADATA.policyId, status: "clean", riskClasses: [], fields: [] };
  const value = redactNode(payload, { ...options, path: [], metadata, seen: new WeakMap() });
  metadata.riskClasses = [...new Set(metadata.riskClasses)].sort();
  metadata.fields = [...new Set(metadata.fields)].sort();
  metadata.status = metadata.riskClasses.length > 0 ? "redacted" : "clean";
  return options.includeMetadata === false ? value : { value, metadata };
}

export function classifyRedactionRisk(value, options = {}) {
  const path = Array.isArray(options.path) ? options.path : [];
  const field = String(path[path.length - 1] || "");
  const pathText = path.join(".");
  if (isSensitiveField(field)) return whole("sensitive-field", REDACTION_PLACEHOLDERS.secret, field);
  if (isRawReceiptPayloadField(field, pathText)) return whole("receipt-payload", REDACTION_PLACEHOLDERS.receiptPayload, field);
  if (typeof value !== "string") return { riskClass: "none", redactWholeValue: false, field };
  if (looksLikeProviderConfigPath(value)) return whole("provider-config-path", REDACTION_PLACEHOLDERS.providerConfigPath, field);
  if (looksLikePrivatePath(value)) return whole("private-path", REDACTION_PLACEHOLDERS.privatePath, field);
  if (looksLikePrivateUrl(value)) return whole("private-url", REDACTION_PLACEHOLDERS.privateUrl, field);
  return applyPatterns(value, options.patterns || DEFAULT_REDACTION_PATTERNS) === value
    ? { riskClass: "none", redactWholeValue: false, field }
    : { riskClass: "sensitive-content", redactWholeValue: false, field };
}

function redactNode(value, context) {
  const risk = classifyRedactionRisk(value, context);
  if (risk.redactWholeValue) {
    markRedacted(context.metadata, risk, context.path);
    return risk.replacement;
  }
  if (typeof value === "string") {
    const redacted = redactSensitiveValue(value, context);
    if (redacted !== value) markRedacted(context.metadata, risk.riskClass === "none" ? { ...risk, riskClass: "sensitive-content" } : risk, context.path);
    return redacted;
  }
  if (!value || typeof value !== "object") return value;
  if (context.seen.has(value)) return "[REDACTED_CIRCULAR_REFERENCE]";
  if (Array.isArray(value)) {
    const output = [];
    context.seen.set(value, output);
    for (let index = 0; index < value.length; index += 1) output.push(redactNode(value[index], { ...context, path: [...context.path, String(index)] }));
    return output;
  }
  const output = {};
  context.seen.set(value, output);
  for (const [key, nested] of Object.entries(value)) output[key] = redactNode(nested, { ...context, path: [...context.path, key] });
  return output;
}

function applyPatterns(value, patterns) {
  let output = String(value || "");
  for (const item of patterns) output = output.replace(item.regex, item.replacement);
  return output;
}

function isSensitiveField(field) {
  return Boolean(field && !DEFAULT_PUBLIC_FIELD_ALLOWLIST.includes(field) && SENSITIVE_FIELD_RE.test(field));
}

function isRawReceiptPayloadField(field, pathText) {
  return Boolean(field && RAW_PAYLOAD_FIELD_RE.test(field) && RECEIPT_CONTEXT_RE.test(pathText));
}

function looksLikeProviderConfigPath(value) {
  return /(?:^|[\\/])\.(?:codex|claude|gemini|cursor|opencode)(?:[\\/]|$)/i.test(String(value || ""));
}

function looksLikePrivatePath(value) {
  const text = String(value || "");
  return /(?:^[A-Za-z]:[\\/]|^\/(?:home|Users)\/)/.test(text) || /(?:^|[\\/])\.(?:env|aws|ssh|npmrc|netrc)(?:[\\/]|$)/i.test(text);
}

function looksLikePrivateUrl(value) {
  const match = String(value || "").match(/\b(?:https?|file):\/\/[^\s"'`<>]+/i);
  return Boolean(match && redactUrlMatch(match[0]) !== match[0]);
}

function redactUrlMatch(match) {
  try {
    const url = new URL(match);
    if (url.protocol === "file:" || url.username || url.password) return REDACTION_PLACEHOLDERS.privateUrl;
    if (PRIVATE_URL_QUERY_RE.test(url.search.slice(1))) return REDACTION_PLACEHOLDERS.privateUrl;
    if (isPrivateHostname(url.hostname)) return REDACTION_PLACEHOLDERS.privateUrl;
    return match;
  } catch {
    return match;
  }
}

function isPrivateHostname(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return true;
  if (/^(?:127\.|10\.|192\.168\.)/.test(host)) return true;
  const range = host.match(/^172\.(\d{1,2})\./);
  return Boolean(range && Number(range[1]) >= 16 && Number(range[1]) <= 31);
}

function markRedacted(metadata, risk, path) {
  if (!metadata || !risk || risk.riskClass === "none") return;
  metadata.riskClasses.push(risk.riskClass);
  const field = path.filter((part) => !/^\d+$/.test(part)).join(".");
  if (field) metadata.fields.push(field);
}

function whole(riskClass, replacement, field) {
  return { riskClass, replacement, redactWholeValue: true, field };
}

function rule(id, regex, replacement) {
  return Object.freeze({ id, regex, replacement });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
