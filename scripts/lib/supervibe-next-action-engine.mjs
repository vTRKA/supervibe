export const BLOCKER_PRIORITY_ORDER = Object.freeze([
  "broken-state",
  "stale-index",
  "missing-receipt",
  "missing-approval",
  "weak-confidence",
  "optional-cleanup",
]);

export const BLOCKER_PRIORITY = Object.freeze({
  "broken-state": 100,
  "stale-index": 80,
  "missing-receipt": 70,
  "missing-approval": 60,
  "weak-confidence": 45,
  "optional-cleanup": 20,
});

const BLOCKER_ALIASES = Object.freeze({
  broken: "broken-state",
  brokenstate: "broken-state",
  statebroken: "broken-state",
  invalidstate: "broken-state",
  inconsistentstate: "broken-state",

  staleindex: "stale-index",
  indexstale: "stale-index",
  indexhealth: "stale-index",
  codeindexstale: "stale-index",
  codegraphstale: "stale-index",

  missingreceipt: "missing-receipt",
  receiptdrift: "missing-receipt",
  untrustedreceipt: "missing-receipt",
  missingproof: "missing-receipt",

  missingapproval: "missing-approval",
  approvalmissing: "missing-approval",
  approvalrequired: "missing-approval",
  policyblock: "missing-approval",

  weakconfidence: "weak-confidence",
  lowconfidence: "weak-confidence",
  confidencecap: "weak-confidence",
  degradedconfidence: "weak-confidence",

  optionalcleanup: "optional-cleanup",
  cleanup: "optional-cleanup",
  cleanupdebt: "optional-cleanup",
  gc: "optional-cleanup",
  gchint: "optional-cleanup",
});

const CLASS_PATTERNS = Object.freeze([
  ["broken-state", /\b(?:broken|invalid|malformed|unreadable|unsafe|ambiguous|multiple active|mismatch|disagree|drifted active|stale active source)\b/i],
  ["stale-index", /\b(?:stale index|missing index|index stale|code rag|codegraph|code graph|content-stale|stale rows|not-built)\b/i],
  ["missing-receipt", /\b(?:missing receipt|receipt drift|untrusted receipt|missing proof|producer proof|reviewer proof|worker proof|scoped receipt)\b/i],
  ["missing-approval", /\b(?:missing approval|approval required|requires approval|user approval|policy block|approval gate)\b/i],
  ["weak-confidence", /\b(?:weak confidence|low confidence|confidence cap|maturity|degraded readiness|unsupported host|cap confidence)\b/i],
  ["optional-cleanup", /\b(?:optional cleanup|cleanup debt|gc hint|cold artifact|closed worktree|watcher absent|host cleanup)\b/i],
]);

const BLOCKER_FIELD_CANDIDATES = Object.freeze([
  "blockerClass",
  "blocker_class",
  "p12BlockerClass",
  "defaultBlockerClass",
  "class",
  "kind",
  "type",
  "category",
  "priorityClass",
  "priority_class",
  "status",
]);

const TEXT_FIELD_CANDIDATES = Object.freeze([
  "code",
  "id",
  "reason",
  "summary",
  "message",
  "why",
  "title",
  "description",
]);

/**
 * Normalize a blocker-like value into the canonical P1.2 blocker shape.
 */
export function normalizeBlocker(input, { sourceIndex = 0 } = {}) {
  const original = input;
  const value = normalizePrimitiveInput(input);
  if (!value) return null;
  const resolvedSourceIndex = Number.isFinite(Number(value.sourceIndex)) ? Number(value.sourceIndex) : sourceIndex;

  const rawClass = findFirstString(value, BLOCKER_FIELD_CANDIDATES);
  const text = textForClassification(value, rawClass);
  const blockerClass = normalizeBlockerClass(rawClass) || inferBlockerClass(text);
  if (!blockerClass) return null;

  const code = normalizeToken(value.code || value.id || rawClass || blockerClass) || blockerClass;
  const id = String(value.id || value.code || `${blockerClass}-${resolvedSourceIndex}`).trim();
  const rank = BLOCKER_PRIORITY_ORDER.indexOf(blockerClass);
  const priority = BLOCKER_PRIORITY[blockerClass];
  return {
    id,
    code,
    blockerClass,
    priority,
    rank,
    label: labelForBlockerClass(blockerClass),
    summary: firstNonBlank(value.summary, value.message, value.reason, value.why, value.title, text, blockerClass),
    why: firstNonBlank(value.why, value.reason, value.message, value.summary, null),
    command: firstNonBlank(value.command, value.nextAction, value.next_action, value.nextRepairCommand, value.repairCommand, null),
    safeToRun: normalizeBoolean(value.safeToRun ?? value.safe_to_run),
    requiresUserApproval: normalizeBoolean(value.requiresUserApproval ?? value.requires_user_approval),
    source: firstNonBlank(value.source, value.owner, null),
    sourceIndex: resolvedSourceIndex,
    originalClass: rawClass || null,
    originalPriority: original && typeof original === "object" && "priority" in original ? original.priority : null,
  };
}

export function normalizeBlockers(inputs = []) {
  return toInputArray(inputs)
    .map((input, sourceIndex) => normalizeBlocker(input, { sourceIndex }))
    .filter(Boolean)
    .sort(compareBlockers);
}

export function selectTopBlocker(inputs = []) {
  return normalizeBlockers(inputs)[0] || null;
}

export function getHiddenLowerPriorityBlockers(inputs = [], topBlocker = selectTopBlocker(inputs)) {
  if (!topBlocker) return [];
  const top = asNormalizedBlocker(topBlocker);
  return normalizeBlockers(inputs)
    .filter((blocker) => blocker.rank > top.rank)
    .map((blocker) => ({
      ...blocker,
      hiddenBy: top.blockerClass,
      hiddenReason: `${top.blockerClass} outranks ${blocker.blockerClass}`,
    }));
}


export function getHiddenBlockers(inputs = [], topBlocker = selectTopBlocker(inputs)) {
  if (!topBlocker) return [];
  const top = asNormalizedBlocker(topBlocker);
  return normalizeBlockers(inputs)
    .filter((blocker) => blocker.sourceIndex !== top.sourceIndex || blocker.code !== top.code || blocker.blockerClass !== top.blockerClass)
    .map((blocker) => ({
      ...blocker,
      hiddenBy: top.blockerClass,
      hiddenReason: blocker.rank === top.rank
        ? `${top.blockerClass} tied on priority; source order selected ${top.code}`
        : `${top.blockerClass} outranks ${blocker.blockerClass}`,
    }));
}


export function explainTopBlocker(topBlocker, inputs = []) {
  const top = asNormalizedBlocker(topBlocker) || selectTopBlocker(inputs);
  if (!top) return "No blockers were provided.";

  const inputList = toInputArray(inputs);
  const normalized = normalizeBlockers(inputList.length ? inputList : [top]);
  const hiddenLower = normalized.filter((blocker) => blocker.rank > top.rank);
  const tied = normalized.filter((blocker) => (
    blocker.rank === top.rank
    && (blocker.sourceIndex !== top.sourceIndex || blocker.code !== top.code || blocker.blockerClass !== top.blockerClass)
  ));
  const orderText = BLOCKER_PRIORITY_ORDER.join(" > ");
  const lowerText = hiddenLower.length
    ? ` It hides ${hiddenLower.length} lower-priority blocker${hiddenLower.length === 1 ? "" : "s"}.`
    : "";
  const tieText = tied.length
    ? ` ${tied.length} same-priority blocker${tied.length === 1 ? "" : "s"} kept source order behind ${top.code}.`
    : "";
  return `${top.blockerClass} wins because it is highest in the deterministic order (${orderText}).${lowerText}${tieText}`.trim();
}

export function resolveBlockerPriority(inputs = []) {
  const blockers = normalizeBlockers(inputs);
  const topBlocker = blockers[0] || null;
  return {
    schemaVersion: 1,
    priorityOrder: BLOCKER_PRIORITY_ORDER,
    blockers,
    topBlocker,
    hiddenLowerPriorityBlockers: getHiddenLowerPriorityBlockers(blockers, topBlocker),
    hiddenBlockers: getHiddenBlockers(blockers, topBlocker),
    explanation: explainTopBlocker(topBlocker, blockers),
  };
}

export function buildCanonicalNextAction({
  status = null,
  why = null,
  command = null,
  blocks = [],
  blockers = blocks,
} = {}) {
  const priority = resolveBlockerPriority(blockers);
  const topBlocker = priority.topBlocker;
  if (!topBlocker) {
    return {
      status: normalizeNextActionStatus(status, "ready"),
      why: firstNonBlank(why, "all readiness probes passed"),
      blocks: [],
      command: firstNonBlank(command, "continue with the approved workflow"),
      safe_to_run: true,
      requires_user_approval: false,
    };
  }

  return {
    status: normalizeNextActionStatus(status, defaultStatusForBlocker(topBlocker)),
    why: firstNonBlank(topBlocker.why, topBlocker.summary, why, priority.explanation),
    blocks: priority.blockers.map((blocker) => ({
      id: blocker.id,
      blocker_class: blocker.blockerClass,
      summary: blocker.summary,
    })),
    command: firstNonBlank(topBlocker.command, command, "inspect workflow readiness"),
    safe_to_run: topBlocker.safeToRun ?? defaultSafeToRunForBlocker(topBlocker),
    requires_user_approval: topBlocker.requiresUserApproval ?? defaultRequiresApprovalForBlocker(topBlocker),
  };
}

export function buildSafeRepairPreview({
  actions = [],
  applyCommand = null,
  previewCommand = null,
  apply = false,
} = {}) {
  const normalizedActions = toInputArray(actions)
    .map((action, index) => normalizeRepairAction(action, { index }))
    .filter(Boolean);
  const files = [...new Set(normalizedActions.flatMap((action) => action.files))];
  return {
    schemaVersion: 1,
    mode: apply ? "apply" : "dry-run",
    safeReadOnly: !apply,
    mutatesState: Boolean(apply && normalizedActions.some((action) => action.mutatesState)),
    wouldMutateOnApply: normalizedActions.some((action) => action.mutatesState),
    distinction: apply
      ? "APPLY mutates the listed files and requires a workflow receipt."
      : "DRY_RUN only reads state and prints the proposed repair; no files are changed.",
    previewCommand: firstNonBlank(previewCommand, null),
    applyCommand: firstNonBlank(applyCommand, null),
    files,
    actions: normalizedActions,
  };
}

export function compareBlockers(a = {}, b = {}) {
  const rankDelta = Number(a.rank ?? 999) - Number(b.rank ?? 999);
  if (rankDelta !== 0) return rankDelta;
  const sourceDelta = Number(a.sourceIndex ?? 0) - Number(b.sourceIndex ?? 0);
  if (sourceDelta !== 0) return sourceDelta;
  return String(a.code || a.id || "").localeCompare(String(b.code || b.id || ""));
}

export function normalizeBlockerClass(value) {
  const token = normalizeToken(value);
  if (!token) return null;
  if (BLOCKER_PRIORITY_ORDER.includes(token)) return token;
  return BLOCKER_ALIASES[token] || BLOCKER_ALIASES[token.replace(/-/g, "")] || null;
}

function asNormalizedBlocker(value) {
  if (value && typeof value === "object" && BLOCKER_PRIORITY_ORDER.includes(value.blockerClass) && Number.isFinite(value.rank)) {
    return value;
  }
  return normalizeBlocker(value);
}

function inferBlockerClass(text = "") {
  for (const [blockerClass, pattern] of CLASS_PATTERNS) {
    if (pattern.test(text)) return blockerClass;
  }
  return null;
}

function normalizePrimitiveInput(input) {
  if (input === null || input === undefined || input === false) return null;
  if (typeof input === "string") return { message: input };
  if (typeof input === "number") return { priority: input, message: String(input) };
  if (typeof input === "object") return input;
  return null;
}

function toInputArray(inputs) {
  if (inputs === null || inputs === undefined) return [];
  if (Array.isArray(inputs)) return inputs;
  if (typeof inputs === "string") return [inputs];
  if (inputs instanceof Map) {
    return [...inputs.entries()].map(([key, value]) => (
      value && typeof value === "object" ? { id: key, ...value } : { id: key, message: value }
    ));
  }
  return [inputs];
}

function textForClassification(value = {}, rawClass = null) {
  return [rawClass, ...TEXT_FIELD_CANDIDATES.map((field) => value[field])]
    .filter((item) => item !== undefined && item !== null)
    .map((item) => String(item))
    .join(" ");
}

function findFirstString(value = {}, fields = []) {
  for (const field of fields) {
    const candidate = value[field];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function firstNonBlank(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function normalizeBoolean(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (["true", "yes", "1"].includes(text)) return true;
  if (["false", "no", "0"].includes(text)) return false;
  return null;
}

function normalizeNextActionStatus(value, fallback) {
  const token = normalizeToken(value);
  if (token === "requires-approval") return "requires_approval";
  if (["ready", "blocked", "degraded", "optional", "complete", "unknown"].includes(token)) return token;
  return fallback;
}

function normalizeRepairAction(action, { index = 0 } = {}) {
  if (!action || typeof action !== "object") return null;
  const type = firstNonBlank(action.type, `action-${index}`);
  const files = repairActionFiles(action);
  return {
    id: firstNonBlank(action.id, `${normalizeToken(type) || "repair-action"}-${index}`),
    type,
    summary: repairActionSummary(action),
    files,
    mutatesState: true,
    command: firstNonBlank(action.command, null),
  };
}

function repairActionFiles(action = {}) {
  return [
    action.path,
    action.graphPath,
    action.archivePath,
    action.pointerPath,
    action.indexPath,
    action.trackerMapPath,
  ]
    .filter((value) => value !== undefined && value !== null && String(value).trim())
    .map((value) => String(value).trim());
}

function repairActionSummary(action = {}) {
  if (action.type === "index-archived-plan") return `index archived plan ${action.path} as ${action.status || "closed"}`;
  if (action.type === "set-active-plan-pointer") return `set active plan pointer to ${action.path} (${action.status || "active"})`;
  if (action.type === "rewrite-active-graph-source") return `rewrite active graph source ${action.from || "missing"} -> ${action.to}`;
  if (action.type === "refresh-tracker-map") return `refresh task tracker map for ${action.activePlanPath || "active plan"}`;
  return firstNonBlank(action.summary, action.description, action.type, "repair action");
}

function defaultStatusForBlocker(blocker = {}) {
  if (blocker.blockerClass === "missing-approval") return "requires_approval";
  if (blocker.blockerClass === "weak-confidence") return "degraded";
  if (blocker.blockerClass === "optional-cleanup") return "optional";
  return "blocked";
}

function defaultRequiresApprovalForBlocker(blocker = {}) {
  return blocker.blockerClass === "missing-approval";
}

function defaultSafeToRunForBlocker(blocker = {}) {
  if (blocker.blockerClass === "missing-approval") return false;
  if (blocker.blockerClass === "weak-confidence") return false;
  if (blocker.blockerClass === "broken-state") return false;
  return Boolean(blocker.command) && !String(blocker.command).toLowerCase().startsWith("defer to final release gate");
}

function normalizeToken(value) {
  if (value === undefined || value === null) return null;
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
    .replace(/[.\s/]+/g, "-")
    .replace(/_/g, "-");
}

function labelForBlockerClass(blockerClass) {
  return blockerClass.replace(/-/g, " ");
}