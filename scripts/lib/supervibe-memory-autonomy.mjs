import { createHash } from "node:crypto";

export const MEMORY_CANDIDATE_SCHEMA_VERSION = 1;

export const MEMORY_CANDIDATE_REDACTION_STATUSES = Object.freeze([
  "unknown",
  "clean",
  "redacted",
  "needs_review",
]);

export const MEMORY_CANDIDATE_APPROVAL_STATES = Object.freeze([
  "not_requested",
  "requested",
  "approved",
  "rejected",
]);

export const MEMORY_CANDIDATE_WRITE_STATES = Object.freeze([
  "candidate_only",
  "write_pending",
  "written",
  "skipped",
]);

export const MEMORY_CANDIDATE_HOOK_TYPES = Object.freeze([
  "work_close",
  "agent_completion",
]);

export const MEMORY_CANDIDATE_EVIDENCE_KINDS = Object.freeze([
  "artifact",
  "receipt",
  "work_item",
  "agent_run",
  "command",
  "test",
  "review",
]);

export const DEFAULT_MEMORY_CANDIDATE_POLICY = Object.freeze({
  candidateFirst: true,
  durableWriteDefault: false,
  explicitApprovalRequired: true,
  defaultApprovalState: "not_requested",
  defaultWriteState: "candidate_only",
  defaultRedactionStatus: "unknown",
});

export function createMemoryCandidate(input = {}, options = {}) {
  return normalizeMemoryCandidate({
    schemaVersion: MEMORY_CANDIDATE_SCHEMA_VERSION,
    candidateId: input.candidateId || null,
    type: input.type || "learning",
    title: input.title || "",
    summary: input.summary || "",
    body: input.body || "",
    tags: input.tags || [],
    evidenceRefs: input.evidenceRefs || input.evidence || [],
    redactionStatus: input.redactionStatus || DEFAULT_MEMORY_CANDIDATE_POLICY.defaultRedactionStatus,
    dedupeKey: input.dedupeKey || null,
    approvalState: input.approvalState || DEFAULT_MEMORY_CANDIDATE_POLICY.defaultApprovalState,
    writeState: input.writeState || DEFAULT_MEMORY_CANDIDATE_POLICY.defaultWriteState,
    approvedBy: input.approvedBy || null,
    approvedAt: input.approvedAt || null,
    writeTarget: input.writeTarget || null,
    writeReceiptId: input.writeReceiptId || null,
    rejectionReason: input.rejectionReason || null,
    createdAt: input.createdAt || options.now || new Date().toISOString(),
    updatedAt: input.updatedAt || input.createdAt || options.now || new Date().toISOString(),
    source: input.source || null,
    metadata: isPlainObject(input.metadata) ? input.metadata : {},
  });
}

export function createWorkCloseMemoryCandidate(input = {}, options = {}) {
  return createHookMemoryCandidate("work_close", {
    ...input,
    source: {
      ...(isPlainObject(input.source) ? input.source : {}),
      taskId: input.workItemId || input.taskId || input.source?.taskId || null,
      runId: input.runId || input.source?.runId || null,
    },
    metadata: {
      ...(isPlainObject(input.metadata) ? input.metadata : {}),
      workItemId: cleanString(input.workItemId || input.taskId) || null,
      status: cleanString(input.status || input.outcome) || null,
    },
  }, options);
}

export function createAgentCompletionMemoryCandidate(input = {}, options = {}) {
  return createHookMemoryCandidate("agent_completion", {
    ...input,
    source: {
      ...(isPlainObject(input.source) ? input.source : {}),
      agentId: input.agentId || input.source?.agentId || null,
      taskId: input.taskId || input.source?.taskId || null,
      runId: input.runId || input.source?.runId || null,
    },
    metadata: {
      ...(isPlainObject(input.metadata) ? input.metadata : {}),
      agentId: cleanString(input.agentId) || null,
      taskId: cleanString(input.taskId) || null,
      status: cleanString(input.status || input.outcome) || null,
    },
  }, options);
}

export function evaluateMemoryCandidateHookInput(input = {}) {
  const title = cleanString(input.title || input.summary);
  const summary = cleanString(input.summary || input.body);
  const evidenceRefs = normalizeEvidenceRefs(input.evidenceRefs || input.evidence || []);
  const tags = normalizeStringArray(input.tags);
  const status = cleanString(input.status || input.outcome).toLowerCase();
  const skipReasons = [];

  if (!title && !summary) skipReasons.push("missing-content");
  if (!evidenceRefs.length) skipReasons.push("missing-evidence");
  if (status && ["noop", "skipped", "cancelled", "canceled"].includes(status)) {
    skipReasons.push("non-durable-outcome");
  }
  if (input.noisy === true || tags.includes("noise") || tags.includes("transient")) {
    skipReasons.push("noisy-signal");
  }

  return {
    emit: skipReasons.length === 0,
    skipReasons,
    evidenceRefs,
  };
}

export function normalizeMemoryCandidate(candidate = {}) {
  const normalized = {
    schemaVersion: Number(candidate.schemaVersion || MEMORY_CANDIDATE_SCHEMA_VERSION),
    candidateId: cleanString(candidate.candidateId) || null,
    type: cleanString(candidate.type) || "learning",
    title: cleanString(candidate.title),
    summary: cleanString(candidate.summary),
    body: cleanString(candidate.body),
    tags: normalizeStringArray(candidate.tags),
    evidenceRefs: normalizeEvidenceRefs(candidate.evidenceRefs || candidate.evidence || []),
    redactionStatus: normalizeEnum(
      candidate.redactionStatus,
      MEMORY_CANDIDATE_REDACTION_STATUSES,
      DEFAULT_MEMORY_CANDIDATE_POLICY.defaultRedactionStatus,
    ),
    dedupeKey: cleanString(candidate.dedupeKey) || null,
    approvalState: normalizeEnum(
      candidate.approvalState,
      MEMORY_CANDIDATE_APPROVAL_STATES,
      DEFAULT_MEMORY_CANDIDATE_POLICY.defaultApprovalState,
    ),
    writeState: normalizeEnum(
      candidate.writeState,
      MEMORY_CANDIDATE_WRITE_STATES,
      DEFAULT_MEMORY_CANDIDATE_POLICY.defaultWriteState,
    ),
    approvedBy: cleanString(candidate.approvedBy) || null,
    approvedAt: cleanString(candidate.approvedAt) || null,
    writeTarget: cleanString(candidate.writeTarget) || null,
    writeReceiptId: cleanString(candidate.writeReceiptId) || null,
    rejectionReason: cleanString(candidate.rejectionReason) || null,
    createdAt: cleanString(candidate.createdAt) || null,
    updatedAt: cleanString(candidate.updatedAt) || cleanString(candidate.createdAt) || null,
    source: normalizeSource(candidate.source),
    metadata: isPlainObject(candidate.metadata) ? { ...candidate.metadata } : {},
  };

  if (!normalized.dedupeKey) {
    normalized.dedupeKey = createMemoryCandidateDedupeKey(normalized);
  }
  if (!normalized.candidateId) {
    normalized.candidateId = `memcand_${normalized.dedupeKey.slice(0, 16)}`;
  }

  return normalized;
}

export function validateMemoryCandidate(candidate = {}) {
  const rawRedactionStatus = cleanString(candidate.redactionStatus).toLowerCase();
  const rawApprovalState = cleanString(candidate.approvalState).toLowerCase();
  const rawWriteState = cleanString(candidate.writeState).toLowerCase();
  const normalized = normalizeMemoryCandidate(candidate);
  const evidenceBinding = validateMemoryCandidateEvidenceBinding(normalized);
  const privacy = inspectMemoryCandidatePrivacy(normalized);
  const errors = [];
  const warnings = [];

  if (normalized.schemaVersion !== MEMORY_CANDIDATE_SCHEMA_VERSION) {
    errors.push(`unsupported schemaVersion ${normalized.schemaVersion}`);
  }
  if (!normalized.title && !normalized.summary) {
    errors.push("candidate requires title or summary");
  }
  if (!normalized.evidenceRefs.length) {
    errors.push("candidate requires at least one evidenceRef");
  }
  errors.push(...evidenceBinding.errors);
  warnings.push(...evidenceBinding.warnings);
  if (privacy.findings.length) {
    errors.push("privacy redaction guard found unredacted sensitive content");
  }
  if (rawRedactionStatus && !MEMORY_CANDIDATE_REDACTION_STATUSES.includes(rawRedactionStatus)) {
    errors.push(`invalid redactionStatus ${candidate.redactionStatus}`);
  }
  if (rawApprovalState && !MEMORY_CANDIDATE_APPROVAL_STATES.includes(rawApprovalState)) {
    errors.push(`invalid approvalState ${candidate.approvalState}`);
  }
  if (rawWriteState && !MEMORY_CANDIDATE_WRITE_STATES.includes(rawWriteState)) {
    errors.push(`invalid writeState ${candidate.writeState}`);
  }
  if (normalized.writeState === "written" && normalized.approvalState !== "approved") {
    errors.push("written candidates require approvalState approved");
  }
  if (normalized.writeState === "written" && !normalized.writeTarget) {
    errors.push("written candidates require writeTarget");
  }
  if (normalized.approvalState === "approved" && (!normalized.approvedBy || !normalized.approvedAt)) {
    warnings.push("approved candidates should include approvedBy and approvedAt");
  }
  if (normalized.redactionStatus === "unknown" || normalized.redactionStatus === "needs_review") {
    warnings.push("redaction review is not complete");
  }

  return {
    pass: errors.length === 0,
    errors,
    warnings,
    candidate: normalized,
    evidenceBinding,
    privacy,
  };
}

export function createMemoryCandidateDedupeKey(candidate = {}) {
  const evidence = normalizeEvidenceRefs(candidate.evidenceRefs || candidate.evidence || [])
    .map((ref) => `${ref.kind}:${ref.ref}:${ref.locator || ""}`)
    .sort()
    .join("|");
  const basis = [
    cleanString(candidate.type || "learning").toLowerCase(),
    cleanString(candidate.title).toLowerCase(),
    cleanString(candidate.summary).toLowerCase(),
    normalizeStringArray(candidate.tags).map((tag) => tag.toLowerCase()).sort().join(","),
    evidence,
  ].join("\n");
  return createHash("sha256").update(basis).digest("hex");
}

export function memoryCandidateIsDurableWriteAllowed(candidate = {}) {
  const normalized = normalizeMemoryCandidate(candidate);
  const validation = validateMemoryCandidate(normalized);
  return normalized.approvalState === "approved"
    && normalized.redactionStatus !== "unknown"
    && normalized.redactionStatus !== "needs_review"
    && normalized.writeState === "write_pending"
    && validation.pass;
}

export function buildMemoryMaintenanceStatus({
  candidates = [],
  candidateQueues = {},
  lifecycle = {},
  backfill = {},
  compact = {},
  now = new Date().toISOString(),
} = {}) {
  const normalizedCandidates = normalizeMemoryCandidateList(candidates);
  const queueCounts = buildMemoryMaintenanceQueueCounts({
    candidates: normalizedCandidates,
    candidateQueues,
    lifecycle,
  });
  const duplicateGroups = buildMemoryMaintenanceDuplicateGroups(normalizedCandidates);
  const validationResults = normalizedCandidates.map((candidate) => validateMemoryCandidate(candidate));
  const invalidCandidates = validationResults.filter((result) => !result.pass);
  const privacyFindings = validationResults.flatMap((result) => result.privacy?.findings || []);
  const backfillCandidates = positiveInteger(backfill.candidates?.length, positiveInteger(backfill.candidateCount, 0));
  const backfillDryRun = backfill.dryRun !== false && backfill.mode !== "apply";
  const compactPending = positiveInteger(compact.pending, positiveInteger(compact.candidates, queueCounts.total));
  const compactBlocked = normalizeStringArray(compact.blockedReasons || compact.blockers);
  const readiness = {
    dedupe: {
      ready: normalizedCandidates.length > 0 && invalidCandidates.length === 0,
      duplicateGroups: duplicateGroups.length,
      duplicateCandidates: duplicateGroups.reduce((total, group) => total + group.count, 0),
      blockedReasons: invalidCandidates.length ? ["invalid-candidates"] : [],
    },
    compact: {
      ready: compactPending > 0 && compactBlocked.length === 0,
      pending: compactPending,
      blockedReasons: compactBlocked,
    },
    backfill: {
      ready: backfillCandidates > 0 && backfillDryRun,
      candidates: backfillCandidates,
      dryRun: backfillDryRun,
      blockedReasons: backfillDryRun ? [] : ["durable-backfill-mode"],
    },
    redaction: {
      ready: normalizedCandidates.length > 0 && privacyFindings.length === 0
        && (queueCounts.byRedactionStatus.unknown || 0) === 0
        && (queueCounts.byRedactionStatus.needs_review || 0) === 0,
      clean: queueCounts.byRedactionStatus.clean || 0,
      redacted: queueCounts.byRedactionStatus.redacted || 0,
      needsReview: (queueCounts.byRedactionStatus.unknown || 0) + (queueCounts.byRedactionStatus.needs_review || 0),
      findings: privacyFindings.length,
      blockedReasons: privacyFindings.length ? ["sensitive-content"] : [],
    },
  };

  return {
    schemaVersion: 1,
    generatedAt: now,
    mode: "status-only",
    durableWrites: false,
    queue: queueCounts,
    readiness,
    duplicateGroups,
    checks: {
      invalidCandidates: invalidCandidates.length,
      privacyFindings: privacyFindings.length,
      validationWarnings: validationResults.reduce((total, result) => total + result.warnings.length, 0),
    },
  };
}

export function formatMemoryMaintenanceStatus(status = {}) {
  const queue = status.queue || {};
  const readiness = status.readiness || {};
  const lines = [
    "SUPERVIBE_MEMORY_MAINTENANCE_STATUS",
    `MODE: ${status.mode || "status-only"}`,
    `DURABLE_WRITES: ${status.durableWrites === true}`,
    `TOTAL_QUEUE: ${queue.total || 0}`,
    `QUEUE_BY_WRITE: ${formatCounts(queue.byWriteState)}`,
    `QUEUE_BY_APPROVAL: ${formatCounts(queue.byApprovalState)}`,
    `QUEUE_BY_REDACTION: ${formatCounts(queue.byRedactionStatus)}`,
    `REVIEW_QUEUES: ${formatCounts(queue.reviewQueues)}`,
    `DEDUPE_READY: ${Boolean(readiness.dedupe?.ready)}`,
    `DEDUPE_DUPLICATE_GROUPS: ${readiness.dedupe?.duplicateGroups || 0}`,
    `COMPACT_READY: ${Boolean(readiness.compact?.ready)}`,
    `COMPACT_PENDING: ${readiness.compact?.pending || 0}`,
    `BACKFILL_READY: ${Boolean(readiness.backfill?.ready)}`,
    `BACKFILL_CANDIDATES: ${readiness.backfill?.candidates || 0}`,
    `BACKFILL_DRY_RUN: ${Boolean(readiness.backfill?.dryRun)}`,
    `REDACTION_READY: ${Boolean(readiness.redaction?.ready)}`,
    `REDACTION_NEEDS_REVIEW: ${readiness.redaction?.needsReview || 0}`,
    `INVALID_CANDIDATES: ${status.checks?.invalidCandidates || 0}`,
    `PRIVACY_FINDINGS: ${status.checks?.privacyFindings || 0}`,
    `VALIDATION_WARNINGS: ${status.checks?.validationWarnings || 0}`,
  ];
  for (const group of status.duplicateGroups || []) {
    lines.push(`DUPLICATE_GROUP: ${group.dedupeKey} count=${group.count} candidates=${group.candidateIds.join(",")}`);
  }
  return lines.join("\n");
}

export function validateMemoryCandidateEvidenceBinding(candidate = {}) {
  const refs = normalizeEvidenceRefs(candidate.evidenceRefs || candidate.evidence || []);
  const errors = [];
  const warnings = [];
  const seen = new Set();

  if (!refs.length) {
    errors.push("evidence binding requires at least one evidenceRef");
  }

  for (const ref of refs) {
    const key = `${ref.kind}:${ref.ref}:${ref.locator || ""}`;
    if (!MEMORY_CANDIDATE_EVIDENCE_KINDS.includes(ref.kind)) {
      errors.push(`unsupported evidence kind ${ref.kind}`);
    }
    if (seen.has(key)) {
      warnings.push(`duplicate evidenceRef ${key}`);
    }
    seen.add(key);
  }

  return {
    pass: errors.length === 0,
    errors,
    warnings,
    evidenceRefs: refs,
  };
}

export function applyMemoryCandidatePrivacyRedactionGuard(candidate = {}) {
  const normalized = normalizeMemoryCandidate(candidate);
  const before = inspectMemoryCandidatePrivacy(normalized);
  const redacted = normalizeMemoryCandidate({
    ...normalized,
    title: redactMemoryCandidateText(normalized.title),
    summary: redactMemoryCandidateText(normalized.summary),
    body: redactMemoryCandidateText(normalized.body),
    evidenceRefs: normalized.evidenceRefs.map((ref) => ({
      ...ref,
      note: ref.note ? redactMemoryCandidateText(ref.note) : ref.note,
    })),
    metadata: redactPlainObjectStrings(normalized.metadata),
    redactionStatus: before.findings.length > 0 ? "redacted" : "clean",
  });
  const after = inspectMemoryCandidatePrivacy(redacted);

  return {
    candidate: redacted,
    redacted: before.findings.length > 0,
    findings: before.findings,
    pass: after.findings.length === 0,
  };
}

export function inspectMemoryCandidatePrivacy(candidate = {}) {
  const normalized = normalizeMemoryCandidate(candidate);
  const fields = [
    ["title", normalized.title],
    ["summary", normalized.summary],
    ["body", normalized.body],
    ...normalized.evidenceRefs.map((ref, index) => [`evidenceRefs.${index}.note`, ref.note || ""]),
    ...Object.entries(flattenPlainObject(normalized.metadata)).map(([key, value]) => [`metadata.${key}`, value]),
  ];
  const findings = [];

  for (const [field, value] of fields) {
    const raw = String(value || "");
    if (redactMemoryCandidateText(raw) === raw) continue;
    for (const pattern of MEMORY_CANDIDATE_PRIVACY_PATTERNS) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(raw)) {
        findings.push({ field, kind: pattern.kind });
      }
    }
  }

  return {
    pass: findings.length === 0,
    findings,
  };
}

export function normalizeEvidenceRefs(evidenceRefs = []) {
  const refs = Array.isArray(evidenceRefs) ? evidenceRefs : [evidenceRefs];
  return refs
    .map((ref) => {
      if (typeof ref === "string") {
        return { kind: "artifact", ref: cleanString(ref), locator: null, note: null };
      }
      if (!isPlainObject(ref)) return null;
      return {
        kind: cleanString(ref.kind || ref.type || "artifact") || "artifact",
        ref: cleanString(ref.ref || ref.path || ref.id || ref.url),
        locator: cleanString(ref.locator || ref.line || ref.range) || null,
        note: cleanString(ref.note || ref.summary) || null,
      };
    })
    .filter((ref) => ref?.ref);
}

function createHookMemoryCandidate(hookType, input = {}, options = {}) {
  const hook = normalizeEnum(hookType, MEMORY_CANDIDATE_HOOK_TYPES, "");
  if (!hook) {
    return { emitted: false, skipReasons: ["unsupported-hook"], candidate: null };
  }

  const evaluation = evaluateMemoryCandidateHookInput(input);
  if (!evaluation.emit) {
    return { emitted: false, skipReasons: evaluation.skipReasons, candidate: null };
  }

  const guarded = applyMemoryCandidatePrivacyRedactionGuard(createMemoryCandidate({
    ...input,
    type: input.type || hook,
    tags: [...normalizeStringArray(input.tags), hook],
    evidenceRefs: evaluation.evidenceRefs,
    approvalState: DEFAULT_MEMORY_CANDIDATE_POLICY.defaultApprovalState,
    writeState: DEFAULT_MEMORY_CANDIDATE_POLICY.defaultWriteState,
    metadata: {
      ...(isPlainObject(input.metadata) ? input.metadata : {}),
      hookType: hook,
    },
  }, options));

  return {
    emitted: true,
    skipReasons: [],
    candidate: guarded.candidate,
    privacy: {
      redacted: guarded.redacted,
      findings: guarded.findings,
      pass: guarded.pass,
    },
  };
}

const MEMORY_CANDIDATE_PRIVACY_PATTERNS = Object.freeze([
  { kind: "email", regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { kind: "bearer_token", regex: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi },
  { kind: "github_token", regex: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/g },
  { kind: "openai_token", regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { kind: "jwt", regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { kind: "named_secret", regex: /\b[A-Za-z0-9_.-]*(?:api[_-]?key|token|secret|password|passwd|pwd)[A-Za-z0-9_.-]*(\s*[:=]\s*)(?!\[REDACTED_)("[^"]+"|'[^']+'|[^\s,;}\]]+)/gi },
  { kind: "hex_token", regex: /\b[A-Fa-f0-9]{32,}\b/g },
  { kind: "long_token", regex: /\b(?=[A-Za-z0-9+/=_-]{28,}\b)(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9+/=_-]{28,}\b/g },
  { kind: "home_path", regex: /(?:\/Users|\/home)\/[^\s"'`<>]+/g },
  { kind: "windows_path", regex: /[A-Za-z]:\\[^\r\n"'`<>|]*/g },
]);

function redactMemoryCandidateText(value = "") {
  let text = String(value || "");

  text = text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]");
  text = text.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi, "Bearer [REDACTED_TOKEN]");
  text = text.replace(/\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/g, "[REDACTED_TOKEN]");
  text = text.replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_TOKEN]");
  text = text.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_TOKEN]");
  text = text.replace(/\b([A-Za-z0-9_.-]*(?:api[_-]?key|token|secret|password|passwd|pwd)[A-Za-z0-9_.-]*)(\s*[:=]\s*)(?!\[REDACTED_)("[^"]+"|'[^']+'|[^\s,;}\]]+)/gi, "$1$2[REDACTED_SECRET]");
  text = text.replace(/\b[A-Fa-f0-9]{32,}\b/g, "[REDACTED_TOKEN]");
  text = text.replace(/\b(?=[A-Za-z0-9+/=_-]{28,}\b)(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9+/=_-]{28,}\b/g, "[REDACTED_TOKEN]");
  text = text.replace(/[A-Za-z]:\\[^\r\n"'`<>|]*/g, "[REDACTED_PATH]");
  text = text.replace(/(?:\/Users|\/home)\/[^\s"'`<>]+/g, "[REDACTED_PATH]");

  return text;
}

function redactPlainObjectStrings(value) {
  if (Array.isArray(value)) return value.map((item) => redactPlainObjectStrings(item));
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactPlainObjectStrings(item)]));
  }
  return typeof value === "string" ? redactMemoryCandidateText(value) : value;
}

function flattenPlainObject(value, prefix = "") {
  if (!isPlainObject(value)) return {};
  const entries = {};
  for (const [key, item] of Object.entries(value)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(item)) {
      Object.assign(entries, flattenPlainObject(item, nextKey));
    } else if (Array.isArray(item)) {
      entries[nextKey] = item.map((entry) => isPlainObject(entry) ? JSON.stringify(entry) : String(entry)).join(" ");
    } else {
      entries[nextKey] = String(item ?? "");
    }
  }
  return entries;
}

function normalizeMemoryCandidateList(candidates = []) {
  const values = Array.isArray(candidates) ? candidates : Object.values(candidates || {});
  return values
    .filter(isPlainObject)
    .map((candidate) => normalizeMemoryCandidate(candidate));
}

function buildMemoryMaintenanceQueueCounts({ candidates = [], candidateQueues = {}, lifecycle = {} } = {}) {
  const lifecycleQueues = isPlainObject(lifecycle.candidateQueues) ? lifecycle.candidateQueues : {};
  const reviewQueues = Object.fromEntries(
    Object.entries({ ...lifecycleQueues, ...candidateQueues })
      .map(([key, value]) => [key, Array.isArray(value) ? value.length : positiveInteger(value, 0)])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  return {
    total: candidates.length + Object.values(reviewQueues).reduce((total, count) => total + count, 0),
    candidateRecords: candidates.length,
    reviewQueues,
    byType: countCandidatesBy(candidates, "type"),
    byApprovalState: countCandidatesBy(candidates, "approvalState"),
    byWriteState: countCandidatesBy(candidates, "writeState"),
    byRedactionStatus: countCandidatesBy(candidates, "redactionStatus"),
  };
}

function buildMemoryMaintenanceDuplicateGroups(candidates = []) {
  const groups = new Map();
  for (const candidate of candidates) {
    if (!groups.has(candidate.dedupeKey)) groups.set(candidate.dedupeKey, []);
    groups.get(candidate.dedupeKey).push(candidate.candidateId);
  }
  return [...groups.entries()]
    .filter(([, candidateIds]) => candidateIds.length > 1)
    .map(([dedupeKey, candidateIds]) => ({
      dedupeKey,
      count: candidateIds.length,
      candidateIds: candidateIds.sort(),
    }))
    .sort((left, right) => right.count - left.count || left.dedupeKey.localeCompare(right.dedupeKey));
}

function countCandidatesBy(candidates = [], field) {
  const counts = {};
  for (const candidate of candidates) {
    const key = cleanString(candidate[field]) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return sortPlainObjectByKey(counts);
}

function formatCounts(counts = {}) {
  const entries = Object.entries(counts || {});
  return entries.length ? entries.map(([key, value]) => `${key}=${value}`).join(",") : "none";
}

function sortPlainObjectByKey(value = {}) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function positiveInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function normalizeSource(source) {
  if (!isPlainObject(source)) return null;
  return {
    agentId: cleanString(source.agentId || source.agent) || null,
    taskId: cleanString(source.taskId || source.task) || null,
    runId: cleanString(source.runId || source.run) || null,
  };
}

function normalizeEnum(value, allowed, fallback) {
  const normalized = cleanString(value).toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function normalizeStringArray(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(values.map(cleanString).filter(Boolean))].sort();
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
