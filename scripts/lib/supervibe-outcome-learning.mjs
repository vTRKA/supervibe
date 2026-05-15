export const OUTCOME_LEARNING_SCHEMA_VERSION = 1;
export const OUTCOME_RECORD_KIND = "supervibe-workflow-outcome";
export const OUTCOME_SUMMARY_KIND = "supervibe-workflow-outcome-summary";
export const OUTCOME_RECOMMENDATION_KIND = "supervibe-workflow-outcome-recommendation-signal";

export const OUTCOME_STATUSES = Object.freeze(["success", "partial", "failed", "blocked", "deferred", "waived", "unknown"]);
export const OUTCOME_LOG_ALLOWLIST_FIELDS = Object.freeze([
  "schemaVersion", "kind", "recordId", "timestamp", "subject", "status", "outcome", "userOutcome", "confidence", "scopeBoundary", "nonGoals", "residualRisks", "deferredValidation", "artifacts", "receipts", "tags", "privacy",
]);

const INPUT_FIELDS = new Set([
  ...OUTCOME_LOG_ALLOWLIST_FIELDS,
  "recordedAt", "command", "commandId", "commandIds", "agent", "agentId", "agentIds", "agents", "skill", "skillId", "skillIds", "skills", "subsystem", "subsystemId", "subsystemIds", "subsystems", "summary", "result", "outcomeStatus", "confidenceScore", "score", "scope", "scope_boundary", "user_outcome", "resultForUser", "non_goals", "residualRisk", "residual_risks", "validation", "deferredValidations", "receipt", "receiptIds",
]);
const BAD_FIELDS = new Set(["prompt", "rawPrompt", "raw_prompt", "messages", "secret", "secrets", "token", "tokens", "password", "apiKey", "api_key", "authorization", "cookie", "env"]);
const MAX_TEXT = 240;
const MAX_ITEMS = 16;
const DEFAULT_RECENT_LIMIT = 20;
const DEFAULT_MIN_SAMPLES = 2;
const STATUS_ALIASES = new Map([
  ["pass", "success"], ["passed", "success"], ["ok", "success"], ["done", "success"], ["complete", "success"], ["completed", "success"], ["succeeded", "success"],
  ["warn", "partial"], ["warning", "partial"], ["mixed", "partial"], ["incomplete", "partial"],
  ["fail", "failed"], ["failure", "failed"], ["error", "failed"], ["errored", "failed"],
  ["hard-stop", "blocked"], ["stopped", "blocked"],
  ["pending", "deferred"], ["pending-validation", "deferred"], ["deferred-to-release-gate", "deferred"],
  ["waive", "waived"], ["waiver", "waived"],
]);
const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\b(?:ghp|github_pat|glpat|xox[baprs])-[A-Za-z0-9_-]{12,}\b/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  /-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/g,
  /([?&](?:token|key|secret|password|pwd|access_token)=)[^&\s]+/gi,
];

export function createOutcomeRecord(input = {}, options = {}) {
  const row = asObject(input);
  const state = redactionState(row);
  const timestamp = iso(row.timestamp || row.recordedAt || options.timestamp || options.now || new Date().toISOString());
  const subject = subjectFrom(row, state);
  const status = statusFrom(row.status || row.outcomeStatus || row.result || row.outcome);
  const outcome = safeText(row.outcome || row.summary || status, state);
  const userOutcome = safeText(row.userOutcome || row.user_outcome || row.resultForUser || outcome, state);
  const scopeBoundary = scopeFrom(row.scopeBoundary || row.scope_boundary || row.scope, state);
  const nonGoals = textList(row.nonGoals || row.non_goals || scopeBoundary.rejected, state);
  const confidence = confidenceFrom(row.confidence ?? row.confidenceScore ?? row.score, state);
  const residualRisks = residualRisksFrom(row.residualRisks || row.residualRisk || row.residual_risks, state);
  const deferredValidation = deferredValidationFrom(row.deferredValidation || row.deferredValidations || row.validation, state);
  const artifacts = artifactsFrom(row.artifacts, state);
  const receipts = receiptsFrom(row.receipts || row.receipt || row.receiptIds, state);
  const tags = idList(row.tags, state);
  const seed = [timestamp, subject.commandId || "", subject.agentIds.join(","), subject.skillIds.join(","), subject.subsystemIds.join(","), status, outcome].join("|");
  return {
    schemaVersion: OUTCOME_LEARNING_SCHEMA_VERSION,
    kind: OUTCOME_RECORD_KIND,
    recordId: id(row.recordId, state) || `outcome-${timestamp.slice(0, 10)}-${hash(seed)}`,
    timestamp,
    subject,
    status,
    outcome,
    userOutcome,
    confidence,
    scopeBoundary,
    nonGoals,
    residualRisks,
    deferredValidation,
    artifacts,
    receipts,
    tags,
    privacy: {
      classification: "local-private",
      publishableSummaryOnly: false,
      rawPromptIncluded: false,
      opaqueLearningAllowed: false,
      allowlistedFields: [...OUTCOME_LOG_ALLOWLIST_FIELDS],
      omittedInputFields: state.omittedInputFields,
      redactionStatus: redactionStatus(state),
    },
  };
}

export function normalizeOutcomeRecord(input = {}) {
  if (input?.kind === OUTCOME_RECORD_KIND && input?.schemaVersion === OUTCOME_LEARNING_SCHEMA_VERSION) {
    return createOutcomeRecord({
      ...input,
      commandId: input.subject?.commandId,
      agentIds: input.subject?.agentIds,
      skillIds: input.subject?.skillIds,
      subsystemIds: input.subject?.subsystemIds,
    });
  }
  return createOutcomeRecord(input);
}

export function validateOutcomeRecord(record = {}) {
  const errors = [];
  const warnings = [];
  if (record?.schemaVersion !== OUTCOME_LEARNING_SCHEMA_VERSION) errors.push("schemaVersion must be 1");
  if (record?.kind !== OUTCOME_RECORD_KIND) errors.push(`kind must be ${OUTCOME_RECORD_KIND}`);
  if (!validIso(record?.timestamp)) errors.push("timestamp must be an ISO timestamp");
  if (!OUTCOME_STATUSES.includes(record?.status)) errors.push(`status must be one of ${OUTCOME_STATUSES.join(", ")}`);
  if (!record?.recordId) errors.push("recordId is required");
  if (!record?.userOutcome) errors.push("userOutcome is required");
  if (!record?.scopeBoundary || typeof record.scopeBoundary !== "object") errors.push("scopeBoundary is required");
  if (!Array.isArray(record?.nonGoals)) errors.push("nonGoals must be an explicit array");
  const subject = record?.subject || {};
  if (!subject.commandId && !subject.agentIds?.length && !subject.skillIds?.length && !subject.subsystemIds?.length) errors.push("at least one command, agent, skill, or subsystem link is required");
  if (record?.privacy?.rawPromptIncluded !== false) errors.push("privacy.rawPromptIncluded must be false");
  if (record?.privacy?.opaqueLearningAllowed !== false) errors.push("privacy.opaqueLearningAllowed must be false");
  if (hasBadField(record)) errors.push("record contains a prohibited raw prompt or secret field");
  if (hasSecret(JSON.stringify(record))) errors.push("record appears to contain an unredacted secret");
  if (!record?.residualRisks?.length && ["failed", "blocked", "partial"].includes(record?.status)) warnings.push("failed, blocked, or partial records should name residualRisks");
  if (!record?.deferredValidation?.length && record?.status === "deferred") warnings.push("deferred records should name deferredValidation");
  return { valid: errors.length === 0, errors, warnings };
}

export function serializeOutcomeRecord(record = {}) {
  const normalized = normalizeOutcomeRecord(record);
  const validation = validateOutcomeRecord(normalized);
  if (!validation.valid) throw new TypeError(`Invalid outcome record: ${validation.errors.join("; ")}`);
  return JSON.stringify(normalized);
}

export function parseOutcomeRecordLine(line = "") {
  return normalizeOutcomeRecord(JSON.parse(String(line || "{}")));
}

export function summarizeOutcomeRecords(records = [], options = {}) {
  const generatedAt = iso(options.generatedAt || options.timestamp || new Date().toISOString());
  const recentLimit = positiveInt(options.recentLimit, DEFAULT_RECENT_LIMIT);
  const normalized = recordList(records);
  const recentRecords = byRecent(normalized).slice(0, recentLimit);
  return {
    schemaVersion: OUTCOME_LEARNING_SCHEMA_VERSION,
    kind: OUTCOME_SUMMARY_KIND,
    generatedAt,
    deterministic: true,
    opaqueLearningAllowed: false,
    inputCount: Array.isArray(records) ? records.length : 0,
    summarizedCount: normalized.length,
    recentLimit,
    totals: {
      byStatus: statusCounts(normalized),
      residualRiskCount: normalized.reduce((sum, record) => sum + record.residualRisks.length, 0),
      deferredValidationCount: normalized.reduce((sum, record) => sum + record.deferredValidation.length, 0),
    },
    recentOutcomeStatus: {
      byStatus: statusCounts(recentRecords),
      latestStatus: recentRecords[0]?.status || "unknown",
      latestTimestamp: recentRecords[0]?.timestamp || null,
      problemCount: recentRecords.filter((record) => ["failed", "blocked"].includes(record.status)).length,
      deferredCount: recentRecords.filter((record) => record.status === "deferred" || record.deferredValidation.length > 0).length,
    },
    byCommand: aggregate(normalized, "command"),
    byAgent: aggregate(normalized, "agent"),
    bySkill: aggregate(normalized, "skill"),
    bySubsystem: aggregate(normalized, "subsystem"),
    privacy: { classification: "local-private", rawPromptIncluded: false, aggregateOnly: true },
  };
}

export function buildOutcomeRecommendationSignals(records = [], context = {}, options = {}) {
  const generatedAt = iso(options.generatedAt || options.timestamp || new Date().toISOString());
  const minSamples = positiveInt(options.minSamples, DEFAULT_MIN_SAMPLES);
  const subject = subjectFrom(context, redactionState(context));
  const matched = byRecent(recordList(records).filter((record) => matchesSubject(record, subject)));
  const counts = statusCounts(matched);
  const problemCount = (counts.failed || 0) + (counts.blocked || 0);
  const cautionCount = (counts.partial || 0) + (counts.deferred || 0);
  const successCount = counts.success || 0;
  const deferredValidationCount = matched.reduce((sum, record) => sum + record.deferredValidation.length, 0);
  const residualRiskCount = matched.reduce((sum, record) => sum + record.residualRisks.length, 0);
  const decision = recommendation({ sampleCount: matched.length, minSamples, successCount, problemCount, cautionCount, deferredValidationCount, residualRiskCount });
  return {
    schemaVersion: OUTCOME_LEARNING_SCHEMA_VERSION,
    kind: OUTCOME_RECOMMENDATION_KIND,
    generatedAt,
    deterministic: true,
    opaqueLearningAllowed: false,
    subject,
    sampleStatus: matched.length ? "represented" : "ready-no-samples",
    sampleCount: matched.length,
    minSamples,
    statusCounts: counts,
    recentOutcomeStatus: matched[0]?.status || "unknown",
    latestTimestamp: matched[0]?.timestamp || null,
    averageConfidence: avg(matched.map((record) => record.confidence.score).filter((score) => typeof score === "number")),
    residualRiskCount,
    deferredValidationCount,
    recommendation: decision.recommendation,
    confidenceEffect: decision.confidenceEffect,
    reasons: decision.reasons,
    privacy: { classification: "local-private", aggregateOnly: true, rawPromptIncluded: false },
  };
}

export function redactOutcomeText(value = "") {
  return safeText(value, redactionState({ value }));
}

function recordList(records = []) {
  if (!Array.isArray(records)) return [];
  return records.map((record) => normalizeOutcomeRecord(record)).filter((record) => validateOutcomeRecord(record).valid);
}

function subjectFrom(input = {}, state) {
  const subject = asObject(input.subject);
  return {
    commandId: commandId(input.commandId || input.command || subject.commandId, state),
    agentIds: idList(input.agentIds || input.agents || input.agentId || input.agent || subject.agentIds, state),
    skillIds: idList(input.skillIds || input.skills || input.skillId || input.skill || subject.skillIds, state),
    subsystemIds: idList(input.subsystemIds || input.subsystems || input.subsystemId || input.subsystem || subject.subsystemIds, state),
  };
}

function statusFrom(value = "unknown") {
  const token = tokenOf(value || "unknown");
  const status = STATUS_ALIASES.get(token) || token;
  return OUTCOME_STATUSES.includes(status) ? status : "unknown";
}

function confidenceFrom(value, state) {
  const row = asObject(value);
  const rawScore = typeof value === "number" ? value : row.score;
  const score = rawScore === undefined || rawScore === null || rawScore === "" ? null : clamp(Number(rawScore), 0, 10);
  return {
    score,
    label: safeText(row.label || confidenceLabel(score), state, 40),
    source: safeText(row.source || "caller-provided", state, 80),
    caps: textList(row.caps || row.cap, state),
    reasons: textList(row.reasons || row.reason, state),
  };
}

function scopeFrom(value, state) {
  if (typeof value === "string") return { included: textList(value, state), deferred: [], rejected: [], note: null };
  const row = asObject(value);
  return {
    included: textList(row.included || row.include || row.inScope || row.in_scope, state),
    deferred: textList(row.deferred || row.defer || row.outOfScopeDeferred || row.out_of_scope_deferred, state),
    rejected: textList(row.rejected || row.reject || row.outOfScopeRejected || row.out_of_scope_rejected, state),
    note: row.note ? safeText(row.note, state) : null,
  };
}

function residualRisksFrom(value, state) {
  return asArray(value).slice(0, MAX_ITEMS).map((risk) => {
    if (typeof risk === "string") return { risk: safeText(risk, state), status: "open", owner: null, mitigation: null, confidenceImpact: "cap-if-unresolved" };
    const row = asObject(risk);
    return {
      risk: safeText(row.risk || row.summary || row.description || "unspecified residual risk", state),
      status: tokenOf(row.status || "open") || "open",
      owner: row.owner ? safeText(row.owner, state, 80) : null,
      mitigation: row.mitigation ? safeText(row.mitigation, state) : null,
      confidenceImpact: safeText(row.confidenceImpact || row.confidence_impact || "cap-if-unresolved", state, 80),
    };
  });
}

function deferredValidationFrom(value, state) {
  return asArray(value).slice(0, MAX_ITEMS).map((item) => {
    if (typeof item === "string") return { command: safeText(item, state), status: "deferred-to-release-gate", reason: "deferred by plan/graph/task verification policy", gate: "release-handoff" };
    const row = asObject(item);
    return {
      command: row.command ? safeText(row.command, state) : null,
      status: validationStatus(row.status),
      reason: safeText(row.reason || "deferred by plan/graph/task verification policy", state),
      gate: safeText(row.gate || row.phase || "release-handoff", state, 80),
    };
  });
}

function artifactsFrom(value, state) {
  return asArray(value).slice(0, MAX_ITEMS).map((artifact) => {
    if (typeof artifact === "string") return { path: safePath(artifact, state), type: "artifact", role: "evidence" };
    const row = asObject(artifact);
    return { path: safePath(row.path || row.file || row.href || "", state), type: id(row.type || row.kind || "artifact", state) || "artifact", role: id(row.role || "evidence", state) || "evidence" };
  }).filter((artifact) => artifact.path);
}

function receiptsFrom(value, state) {
  return asArray(value).slice(0, MAX_ITEMS).map((receipt) => {
    if (typeof receipt === "string") return { receiptId: id(receipt, state), subject: null, status: "referenced", trusted: null, path: null };
    const row = asObject(receipt);
    return {
      receiptId: id(row.receiptId || row.id || row.path || "", state),
      subject: row.subject ? safeText(row.subject, state, 100) : null,
      status: tokenOf(row.status || "referenced") || "referenced",
      trusted: typeof row.trusted === "boolean" ? row.trusted : null,
      path: row.path ? safePath(row.path, state) : null,
    };
  }).filter((receipt) => receipt.receiptId || receipt.path);
}

function aggregate(records, dimension) {
  const groups = new Map();
  for (const record of records) {
    for (const key of keysFor(record, dimension)) {
      const group = groups.get(key) || { id: key, sampleCount: 0, statusCounts: {}, latestTimestamp: null, recentStatus: "unknown", confidenceScores: [], residualRiskCount: 0, deferredValidationCount: 0 };
      group.sampleCount += 1;
      group.statusCounts[record.status] = (group.statusCounts[record.status] || 0) + 1;
      group.residualRiskCount += record.residualRisks.length;
      group.deferredValidationCount += record.deferredValidation.length;
      if (typeof record.confidence.score === "number") group.confidenceScores.push(record.confidence.score);
      if (!group.latestTimestamp || Date.parse(record.timestamp) > Date.parse(group.latestTimestamp)) {
        group.latestTimestamp = record.timestamp;
        group.recentStatus = record.status;
      }
      groups.set(key, group);
    }
  }
  return [...groups.values()].map((group) => ({
    id: group.id,
    sampleCount: group.sampleCount,
    statusCounts: orderedCounts(group.statusCounts),
    recentStatus: group.recentStatus,
    latestTimestamp: group.latestTimestamp,
    averageConfidence: avg(group.confidenceScores),
    residualRiskCount: group.residualRiskCount,
    deferredValidationCount: group.deferredValidationCount,
  })).sort((a, b) => b.sampleCount - a.sampleCount || a.id.localeCompare(b.id));
}

function keysFor(record, dimension) {
  if (dimension === "command") return record.subject.commandId ? [record.subject.commandId] : [];
  if (dimension === "agent") return record.subject.agentIds || [];
  if (dimension === "skill") return record.subject.skillIds || [];
  if (dimension === "subsystem") return record.subject.subsystemIds || [];
  return [];
}

function matchesSubject(record, subject) {
  return Boolean(
    (subject.commandId && record.subject.commandId === subject.commandId)
    || overlaps(record.subject.agentIds, subject.agentIds)
    || overlaps(record.subject.skillIds, subject.skillIds)
    || overlaps(record.subject.subsystemIds, subject.subsystemIds),
  );
}

function recommendation({ sampleCount, minSamples, successCount, problemCount, cautionCount, deferredValidationCount, residualRiskCount }) {
  if (!sampleCount) return { recommendation: "use-static-routing", confidenceEffect: "none", reasons: ["no local outcome samples matched the recommendation context"] };
  if (sampleCount < minSamples) return { recommendation: "use-static-routing-with-low-sample-note", confidenceEffect: "cap", reasons: [`matched samples ${sampleCount} below minimum ${minSamples}`] };
  if (problemCount > 0 && problemCount >= successCount) return { recommendation: "downrank-or-require-review", confidenceEffect: "review", reasons: [`recent failed or blocked outcomes ${problemCount} meet or exceed successes ${successCount}`] };
  if (deferredValidationCount > 0 || residualRiskCount > 0 || cautionCount > 0) return { recommendation: "cap-confidence-until-risks-close", confidenceEffect: "cap", reasons: [`caution outcomes ${cautionCount}`, `deferred validations ${deferredValidationCount}`, `residual risks ${residualRiskCount}`] };
  if (successCount >= minSamples) return { recommendation: "support-known-good-path", confidenceEffect: "support", reasons: [`success samples ${successCount} meet minimum ${minSamples}`] };
  return { recommendation: "neutral", confidenceEffect: "none", reasons: ["matched outcomes do not change deterministic routing"] };
}

function statusCounts(records) {
  const counts = {};
  for (const status of OUTCOME_STATUSES) counts[status] = 0;
  for (const record of records) counts[record.status] = (counts[record.status] || 0) + 1;
  return orderedCounts(counts);
}
function orderedCounts(counts = {}) {
  const out = {};
  for (const status of OUTCOME_STATUSES) if (counts[status]) out[status] = counts[status];
  return out;
}
function byRecent(records) {
  return [...records].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || String(a.recordId).localeCompare(String(b.recordId)));
}
function validationStatus(value = "") {
  const token = tokenOf(value || "deferred-to-release-gate");
  if (["passed", "pass", "success"].includes(token)) return "passed";
  if (["failed", "fail", "error"].includes(token)) return "failed";
  if (["waived", "waive"].includes(token)) return "waived";
  return "deferred-to-release-gate";
}
function commandId(value, state) {
  return id(value, state) || null;
}
function idList(value, state) {
  return uniq(asArray(value).flatMap((item) => String(item ?? "").split(/[,\s;|]+/u)).map((item) => id(item, state)).filter(Boolean)).slice(0, MAX_ITEMS);
}
function id(value, state) {
  const text = safeText(value, state, 120);
  return text ? tokenOf(text) : "";
}
function tokenOf(value = "") {
  return String(value || "").trim().toLowerCase().replace(/_/g, "-").replace(/[^\p{L}\p{N}.+:#/-]+/gu, "-").replace(/^-+|-+$/g, "");
}
function textList(value, state) {
  return uniq(asArray(value).flatMap((item) => typeof item === "string" ? item.split(/\r?\n|[|]/u) : [item]).map((item) => safeText(item, state)).filter(Boolean)).slice(0, MAX_ITEMS);
}
function safeText(value, state, maxLength = MAX_TEXT) {
  if (value === undefined || value === null) return "";
  let text = redact(String(value).trim().replace(/\s+/gu, " "), state, { paths: true });
  if (text.length > maxLength) {
    text = `${text.slice(0, Math.max(0, maxLength - 13)).trimEnd()} [truncated]`;
    state.marks.add("truncated");
  }
  return text;
}
function safePath(value, state) {
  const raw = redact(String(value || "").trim().replace(/\\/g, "/"), state, { paths: false });
  if (!raw) return "";
  const relative = raw.match(/(?:^|\/)(\.supervibe|scripts|agents|skills|rules|commands|docs|tests|confidence-rubrics)(\/.*)?$/u);
  if (relative) return `${relative[1]}${relative[2] || ""}`;
  if (/^(?:[A-Za-z]:\/|\/Users\/|\/home\/)/u.test(raw)) {
    state.marks.add("path-redacted");
    return "[redacted-path]";
  }
  return raw.replace(/^\.\/+/u, "");
}
function redact(value, state, { paths }) {
  let text = String(value || "");
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (match, prefix = "") => {
      state.marks.add("secret-redacted");
      return prefix && String(match).startsWith(prefix) ? `${prefix}[redacted-secret]` : "[redacted-secret]";
    });
  }
  text = replaceMark(text, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, "[redacted-email]", state, "pii-redacted");
  if (paths) text = replaceMark(text, /(?:[A-Za-z]:[\\/][^\s"'<>|]+|\/Users\/[^\s"'<>|]+|\/home\/[^\s"'<>|]+)/gu, "[redacted-path]", state, "path-redacted");
  return text;
}
function replaceMark(text, pattern, replacement, state, mark) {
  const next = text.replace(pattern, replacement);
  if (next !== text) state.marks.add(mark);
  return next;
}
function redactionState(input = {}) {
  return { marks: new Set(), omittedInputFields: Object.keys(input).filter((key) => !INPUT_FIELDS.has(key)).sort() };
}
function redactionStatus(state) {
  const marks = [...state.marks].sort();
  if (!marks.length && !state.omittedInputFields.length) return "clean";
  if (!marks.length) return "allowlist-omitted";
  return marks.join(",");
}
function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function asArray(value) {
  if (value === undefined || value === null || value === "") return [];
  return Array.isArray(value) ? value : [value];
}
function iso(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}
function validIso(value) {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}
function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}
function clamp(value, min, max) {
  if (!Number.isFinite(value)) return null;
  return Number(Math.min(max, Math.max(min, value)).toFixed(2));
}
function confidenceLabel(score) {
  if (score === null) return "unknown";
  if (score >= 9) return "high";
  if (score >= 7) return "medium";
  if (score >= 4) return "low";
  return "very-low";
}
function hash(value) {
  let out = 2166136261;
  for (const char of String(value || "")) {
    out ^= char.charCodeAt(0);
    out = Math.imul(out, 16777619);
  }
  return (out >>> 0).toString(36).padStart(7, "0");
}
function uniq(values) {
  return [...new Set(values)];
}
function overlaps(left = [], right = []) {
  const set = new Set(right || []);
  return (left || []).some((item) => set.has(item));
}
function avg(values) {
  if (!values.length) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}
function hasBadField(value) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => BAD_FIELDS.has(key) || hasBadField(child));
}
function hasSecret(text = "") {
  return SECRET_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}