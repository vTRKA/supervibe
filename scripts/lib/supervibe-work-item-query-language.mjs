import { scoreWorkItemPriority, calculateDependencyDepth } from "./supervibe-work-item-priority-formula.mjs";

export const WORK_ITEM_QUERY_FIELDS = Object.freeze([
  "status",
  "label",
  "priority",
  "owner",
  "package",
  "worktree",
  "repo",
  "due",
  "due-date",
  "stale",
  "blocked",
  "blocked-reason",
  "verification",
  "risk",
]);

export const WORK_ITEM_SORT_FIELDS = Object.freeze([
  "priority",
  "critical-path",
  "age",
  "due",
  "due-date",
  "blocker-count",
  "confidence",
  "last-activity",
]);

const FIELD_ALIASES = new Map([
  ["labels", "label"],
  ["assignee", "owner"],
  ["pkg", "package"],
  ["workspace", "worktree"],
  ["dueDate", "due-date"],
  ["blockedReason", "blocked-reason"],
  ["verify", "verification"],
  ["verification-state", "verification"],
]);

export function parseWorkItemQuery(input = "") {
  const tokens = tokenizeQuery(input);
  const filters = {};
  const sort = [];
  const warnings = [];

  for (const token of tokens) {
    const splitAt = token.indexOf(":");
    if (splitAt <= 0) {
      warnings.push({ code: "ignored-token", token });
      continue;
    }
    const rawKey = token.slice(0, splitAt).trim();
    const key = normalizeField(rawKey);
    const rawValue = token.slice(splitAt + 1).trim();
    if (!rawValue) {
      warnings.push({ code: "empty-value", field: rawKey });
      continue;
    }

    if (key === "sort") {
      sort.push(...parseSortValues(rawValue, warnings));
      continue;
    }
    if (!WORK_ITEM_QUERY_FIELDS.includes(key)) {
      warnings.push({ code: "unknown-field", field: rawKey });
      continue;
    }

    const clause = parseFilterClause(key, rawValue);
    filters[key] = [...(filters[key] || []), clause];
  }

  return {
    raw: String(input || ""),
    filters,
    sort: sort.length ? sort : [],
    warnings,
    safe: true,
  };
}

export function compileNaturalLanguageWorkItemQuery(question = "", { currentOwner = "me", confidenceThreshold = 0.8 } = {}) {
  const text = String(question || "").toLowerCase();
  const candidates = [
    { pattern: /ready now|what.*ready|next ready|готов/i, query: "status:ready sort:priority", confidence: 0.94 },
    { pattern: /blocked|why.*block|блок/i, query: "status:blocked sort:age", confidence: 0.93 },
    { pattern: /review needed|needs review|review/i, query: "verification:review status:not-done sort:priority", confidence: 0.9 },
    { pattern: /stale claim|stale/i, query: "stale:30m sort:last-activity", confidence: 0.9 },
    { pattern: /due soon|soon/i, query: "due:soon sort:due", confidence: 0.91 },
    { pattern: /overdue|late|просроч/i, query: "due:overdue sort:due", confidence: 0.92 },
    { pattern: /high risk|risky|risk/i, query: "risk:high status:not-done sort:priority", confidence: 0.9 },
    { pattern: /my work|assigned to me|мои/i, query: `owner:${currentOwner} status:not-done sort:priority`, confidence: 0.89 },
    { pattern: /unowned|no owner/i, query: "owner:unowned status:not-done sort:priority", confidence: 0.88 },
  ];
  const match = candidates.find((candidate) => candidate.pattern.test(text));
  if (!match || match.confidence < confidenceThreshold) {
    return { confidence: 0, query: null, parsed: parseWorkItemQuery(""), reason: "no high-confidence structured query" };
  }
  return {
    confidence: match.confidence,
    query: match.query,
    parsed: parseWorkItemQuery(match.query),
    reason: "compiled from natural-language status intent",
  };
}

export function applyStructuredWorkItemQuery(index = [], query = "", options = {}) {
  const parsed = typeof query === "string" ? parseWorkItemQuery(query) : query;
  const filtered = index.filter((item) => matchesAllFilters(item, parsed.filters || {}, options));
  const sorted = sortWorkItems(filtered, parsed.sort || [], options);
  return {
    query: parsed,
    items: sorted,
    summary: {
      total: index.length,
      matched: sorted.length,
      warnings: parsed.warnings || [],
    },
  };
}

export function formatStructuredWorkItemQueryResult(result = {}) {
  const lines = [
    "SUPERVIBE_WORK_ITEM_QUERY",
    `MATCHED: ${result.summary?.matched ?? 0}/${result.summary?.total ?? 0}`,
  ];
  for (const item of result.items || []) {
    const due = getDueAt(item);
    lines.push(`- ${item.itemId || item.id}: ${item.effectiveStatus || item.status || "unknown"} ${item.title || item.goal || ""}${due ? ` due=${due}` : ""}`);
  }
  const warnings = result.summary?.warnings || [];
  if (warnings.length) lines.push(`WARNINGS: ${warnings.map((warning) => warning.code).join(",")}`);
  return lines.join("\n");
}

export function tokenizeQuery(input = "") {
  const tokens = [];
  let current = "";
  let quote = null;
  for (const char of String(input || "")) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

function parseSortValues(rawValue, warnings) {
  return rawValue.split(",").map((value) => value.trim()).filter(Boolean).flatMap((value) => {
    const field = normalizeSortField(value.replace(/^[-+]/, ""));
    const direction = value.startsWith("-") ? "desc" : value.startsWith("+") ? "asc" : ["due", "due-date"].includes(field) ? "asc" : "desc";
    if (!WORK_ITEM_SORT_FIELDS.includes(field)) {
      warnings.push({ code: "unknown-sort", field: value });
      return [];
    }
    return [{ field, direction }];
  });
}

function parseFilterClause(field, rawValue) {
  const value = rawValue.replace(/^["']|["']$/g, "");
  const operator = value.startsWith("!") ? "not" : value.startsWith(">=") ? ">=" : value.startsWith("<=") ? "<=" : value.startsWith(">") ? ">" : value.startsWith("<") ? "<" : "is";
  const normalized = operator === "is" ? value : value.slice(operator.length);
  return { field, operator, value: normalized };
}

function matchesAllFilters(item, filters, options) {
  return Object.entries(filters).every(([field, clauses]) => clauses.every((clause) => matchesFilter(item, field, clause, options)));
}

function matchesFilter(item, field, clause, options) {
  const value = String(clause.value || "").toLowerCase();
  if (field === "status") return matchStatus(item, value, clause.operator);
  if (field === "label") return matchList(item.labels || item.label || [], value, clause.operator);
  if (field === "priority") return compareText(item.priorityLabel || item.severity || item.priority, value, clause.operator);
  if (field === "owner") return matchOwner(item, value, clause.operator, options);
  if (field === "package") return compareText(item.package, value, clause.operator);
  if (field === "worktree") return compareText(item.worktree || item.workspace, value, clause.operator);
  if (field === "repo") return compareText(item.repo, value, clause.operator);
  if (field === "due" || field === "due-date") return matchDue(item, value, clause.operator, options);
  if (field === "stale") return matchStale(item, value, options);
  if (field === "blocked" || field === "blocked-reason") return compareText(blockReason(item), value, clause.operator);
  if (field === "verification") return compareText(verificationState(item), value, clause.operator);
  if (field === "risk") return compareText(item.policyRiskLevel || item.policy_risk || item.risk, value, clause.operator);
  return true;
}

function sortWorkItems(items, sort = [], options) {
  if (!sort.length) return [...items];
  return [...items].sort((a, b) => {
    for (const entry of sort) {
      const delta = compareSortValue(a, b, entry.field, options);
      if (delta !== 0) return entry.direction === "asc" ? delta : -delta;
    }
    return String(a.itemId || a.id || "").localeCompare(String(b.itemId || b.id || ""));
  });
}

function compareSortValue(a, b, field, options) {
  if (field === "priority") return scoreWorkItemPriority(a, options).score - scoreWorkItemPriority(b, options).score;
  if (field === "critical-path") return criticalPathScore(a, options) - criticalPathScore(b, options);
  if (field === "age") return ageMs(a, options.now) - ageMs(b, options.now);
  if (field === "due" || field === "due-date") return dueMs(a) - dueMs(b);
  if (field === "blocker-count") return blockerCount(a) - blockerCount(b);
  if (field === "confidence") return Number(a.confidence ?? a.confidenceScore ?? 0) - Number(b.confidence ?? b.confidenceScore ?? 0);
  if (field === "last-activity") return lastActivityMs(a) - lastActivityMs(b);
  return 0;
}

function normalizeField(key) {
  const normalized = String(key || "").trim();
  if (normalized === "sort") return "sort";
  return FIELD_ALIASES.get(normalized) || normalized.toLowerCase();
}

function normalizeSortField(field) {
  const normalized = String(field || "").toLowerCase();
  if (normalized === "criticalpath") return "critical-path";
  if (normalized === "due") return "due";
  if (normalized === "duedate") return "due-date";
  if (normalized === "blockers") return "blocker-count";
  return normalized;
}

function matchStatus(item, value, operator) {
  const status = String(item.effectiveStatus || item.status || item.task?.status || "").toLowerCase();
  const done = ["done", "complete", "closed"].includes(status);
  const blocked = ["blocked", "stale", "gate", "delegated", "policy-stopped", "policy_stopped"].includes(status);
  const matched = value === "not-done" ? !done : value === "done" ? done : value === "blocked" ? blocked : status === value;
  return operator === "not" ? !matched : matched;
}

function matchList(values, expected, operator) {
  const list = Array.isArray(values) ? values : String(values || "").split(",");
  const matched = list.map((value) => String(value).toLowerCase()).includes(expected);
  return operator === "not" ? !matched : matched;
}

function matchOwner(item, expected, operator, options) {
  const owner = String(item.owner || item.assignee || item.claims?.[0]?.agentId || "").toLowerCase();
  const actualExpected = expected === "me" ? String(options.currentOwner || "me").toLowerCase() : expected;
  const matched = actualExpected === "unowned" ? !owner : owner === actualExpected;
  return operator === "not" ? !matched : matched;
}

function matchDue(item, expected, operator, options) {
  const dueAt = Date.parse(getDueAt(item) || "");
  if (!Number.isFinite(dueAt)) return false;
  const now = Date.parse(options.now instanceof Date ? options.now.toISOString() : options.now || new Date().toISOString());
  if (expected === "overdue") return dueAt < now;
  if (expected === "soon") return dueAt >= now && dueAt <= now + Number(options.dueSoonHours || 48) * 3_600_000;
  const target = Date.parse(expected);
  if (!Number.isFinite(target)) return false;
  if (operator === ">") return dueAt > target;
  if (operator === ">=") return dueAt >= target;
  if (operator === "<") return dueAt < target;
  if (operator === "<=") return dueAt <= target;
  return dueAt === target || new Date(dueAt).toISOString().slice(0, 10) === expected.slice(0, 10);
}

function matchStale(item, expected, options) {
  const thresholdMs = parseDuration(expected, 30 * 60_000);
  const now = Date.parse(options.now instanceof Date ? options.now.toISOString() : options.now || new Date().toISOString());
  return (item.claims || []).some((claim) => {
    if (!["active", "claimed", "stale"].includes(claim.status)) return false;
    const at = Date.parse(claim.heartbeatAt || claim.claimedAt || claim.expiresAt || "");
    return Number.isFinite(at) && now - at >= thresholdMs;
  });
}

function compareText(actual, expected, operator) {
  const text = String(actual ?? "").toLowerCase();
  const matched = text === expected || text.includes(expected);
  return operator === "not" ? !matched : matched;
}

function criticalPathScore(item, options) {
  const graph = options.graph || {};
  return calculateDependencyDepth(item.itemId || item.id, graph.tasks || graph.items || []) + blockerCount(item);
}

function ageMs(item, now = new Date().toISOString()) {
  const created = Date.parse(item.createdAt || item.created_at || item.task?.createdAt || "");
  const end = Date.parse(now instanceof Date ? now.toISOString() : now);
  if (!Number.isFinite(created) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - created);
}

function lastActivityMs(item) {
  const values = [
    item.updatedAt,
    item.lastActivityAt,
    item.last_progress_at,
    ...(item.comments || []).map((comment) => comment.createdAt),
    ...(item.claims || []).map((claim) => claim.heartbeatAt || claim.claimedAt),
  ].map((value) => Date.parse(value || "")).filter(Number.isFinite);
  return values.length ? Math.max(...values) : 0;
}

function dueMs(item) {
  const value = Date.parse(getDueAt(item) || "");
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function blockerCount(item) {
  return (item.blocks || item.dependents || item.task?.dependencies || item.blockedBy || []).length + (item.gates || []).length;
}

function blockReason(item) {
  if (item.blockedReason || item.blocked_reason) return item.blockedReason || item.blocked_reason;
  if (item.gates?.length) return `gate:${item.gates[0].gateId || item.gates[0].id || "unknown"}`;
  if (item.delegatedMessages?.some((message) => message.status === "open")) return "delegated-message";
  if (item.task?.dependencies?.length) return `dependencies:${item.task.dependencies.join(",")}`;
  return item.effectiveStatus || item.status || "";
}

function verificationState(item) {
  return String(item.verificationState || item.verification_state || item.verification?.status || item.gates?.[0]?.status || "").toLowerCase();
}

export function getDueAt(item = {}) {
  return item.dueAt || item.due_at || item.dueDate || item.due_date || item.task?.dueAt || item.task?.dueDate || item.schedule?.dueAt || null;
}

function parseDuration(value, fallbackMs) {
  const match = String(value || "").match(/^(\d+)(m|h|d)?$/i);
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const unit = (match[2] || "m").toLowerCase();
  if (unit === "d") return amount * 86_400_000;
  if (unit === "h") return amount * 3_600_000;
  return amount * 60_000;
}
