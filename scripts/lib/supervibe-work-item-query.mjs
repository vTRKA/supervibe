import { summarizeWorkItemComments } from "./supervibe-work-item-comments.mjs";
import { applyStructuredWorkItemQuery, compileNaturalLanguageWorkItemQuery, formatStructuredWorkItemQueryResult, parseWorkItemQuery } from "./supervibe-work-item-query-language.mjs";
import { isWorkItemDeferred } from "./supervibe-work-item-scheduler.mjs";
import { formatGovernanceStatus, resolveTeamGovernance } from "./supervibe-team-governance.mjs";

export const WORK_ITEM_QUERY_INTENTS = Object.freeze([
  "ready",
  "blocked",
  "owner",
  "changed",
  "why-blocked",
  "next",
  "summary",
  "stale",
  "orphan",
  "delegated",
  "integration",
  "structured",
  "due",
  "interactive",
  "policy",
  "role",
  "duplicate",
  "unknown",
]);

export function classifyWorkItemQuestion(question = "") {
  const text = String(question).toLowerCase();
  if (/ready|готов|готово к работе|что.*работе|what.*ready/.test(text)) return "ready";
  if (/blocked|блок|why.*blocked|почему.*блок/.test(text)) return text.includes("why") || text.includes("почему") ? "why-blocked" : "blocked";
  if (/owner|owns|who|кто/.test(text)) return "owner";
  if (/changed|измен|what changed|что измен/.test(text)) return "changed";
  if (/next|run next|дальше|следующ/.test(text)) return "next";
  if (/summary|progress|summarize|прогресс|свод/.test(text)) return "summary";
  if (/stale|завис|просроч/.test(text)) return "stale";
  if (/orphan|unlinked|сирот/.test(text)) return "orphan";
  if (/duplicate|дублик/.test(text)) return "duplicate";
  if (/delegated|inbox|message|question/.test(text)) return "delegated";
  if (/integration|adapter|sync|tracker/.test(text)) return "integration";
  if (/interactive|palette|guided form|create work item/.test(text)) return "interactive";
  if (/policy|profile|approval receipt|governance/.test(text)) return "policy";
  if (/role|maintainer|contributor|reviewer|read-only|ci\b/.test(text)) return "role";
  if (/due soon|overdue|sla|saved view|view|query/.test(text)) return "structured";
  if (/due|overdue|просроч/.test(text)) return "due";
  return "unknown";
}

export function createWorkItemIndex({
  graph = {},
  mapping = {},
  comments = [],
  claims = [],
  gates = [],
  evidence = [],
  delegatedMessages = [],
  now = new Date(),
} = {}) {
  const items = graph.items || [];
  const tasks = graph.tasks || [];
  const commentsByItem = groupBy(comments, (comment) => comment.workItemId);
  const claimsByTask = groupBy(claims, (claim) => claim.taskId);
  const gatesByTask = groupBy(gates, (gate) => gate.taskId);
  const delegatedByItem = groupBy(delegatedMessages, (message) => message.workItemId);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  return items.map((item) => {
    const task = taskById.get(item.itemId) || null;
    const itemComments = commentsByItem.get(item.itemId) || [];
    const itemClaims = claimsByTask.get(item.itemId) || [];
    const itemGates = gatesByTask.get(item.itemId) || [];
    const itemDelegated = delegatedByItem.get(item.itemId) || [];
    return {
      ...item,
      labels: normalizeLabels(item.labels || item.label),
      task,
      mapping: mapping.items?.[item.itemId] || null,
      comments: itemComments,
      commentSummary: summarizeWorkItemComments(itemComments),
      claims: itemClaims,
      gates: itemGates,
      delegatedMessages: itemDelegated,
      evidence: evidence.filter((entry) => entry.workItemId === item.itemId || entry.taskId === item.itemId),
      dueAt: item.dueAt || item.due_at || item.dueDate || item.due_date || task?.dueAt || task?.dueDate || null,
      deferred: item.deferred || task?.deferred || null,
      deferredUntil: item.deferredUntil || item.defer_until || task?.deferredUntil || task?.defer_until || null,
      verificationState: item.verificationState || item.verification_state || item.verification?.status || null,
      effectiveStatus: effectiveStatus(item, task, itemClaims, itemGates, now, itemDelegated),
    };
  });
}

export function queryWorkItems(question, context = {}) {
  const intent = classifyWorkItemQuestion(question);
  const index = Array.isArray(context.index) ? context.index : createWorkItemIndex(context);
  const filtered = applyWorkItemFilters(index, context.filters || {});
  let items = [];
  let answer = "";

  if (context.structuredQuery || /(^|\s)[a-z-]+:[^\s]+/.test(String(question || ""))) {
    const result = applyStructuredWorkItemQuery(index, context.structuredQuery || parseWorkItemQuery(question), {
      now: context.now,
      graph: context.graph,
      currentOwner: context.currentOwner,
      dueSoonHours: context.dueSoonHours,
    });
    return {
      intent: "structured",
      items: result.items,
      answer: formatStructuredWorkItemQueryResult(result),
      nextAction: result.items[0] ? `inspect ${result.items[0].itemId || result.items[0].id}` : "inspect status",
      query: result.query,
    };
  }

  if (intent === "ready" || intent === "next") {
    items = filtered.filter((item) => item.type !== "epic" && item.effectiveStatus === "ready");
    answer = items.length ? `Ready work: ${items.map((item) => item.itemId).join(", ")}` : "No ready work; inspect blockers or gates.";
  } else if (intent === "blocked" || intent === "why-blocked") {
    items = filtered.filter((item) => ["blocked", "stale", "gate"].includes(item.effectiveStatus));
    answer = items.length ? `Blocked work: ${items.map((item) => `${item.itemId}:${blockReason(item)}`).join(", ")}` : "No blocked work.";
  } else if (intent === "owner") {
    items = filtered.filter((item) => item.owner || item.claims.length);
    answer = items.length ? items.map((item) => `${item.itemId} -> ${item.owner || item.claims[0]?.agentId}`).join("\n") : "No owners or active claims.";
  } else if (intent === "changed") {
    items = filtered.filter((item) => item.evidence.length || item.comments.some((comment) => comment.links.length));
    answer = items.length ? `Changed/evidence-linked work: ${items.map((item) => item.itemId).join(", ")}` : "No linked changes found.";
  } else if (intent === "summary") {
    const grouped = groupWorkItemsByStatus(filtered);
    answer = `Summary: ready=${grouped.ready.length} blocked=${grouped.blocked.length} claimed=${grouped.claimed.length} done=${grouped.done.length}`;
  } else if (intent === "stale") {
    items = detectStaleWorkItems(filtered, context);
    answer = items.length ? `Stale work: ${items.map((item) => item.itemId).join(", ")}` : "No stale work.";
  } else if (intent === "orphan") {
    items = detectOrphanEvidence(context);
    answer = items.length ? `Orphan evidence: ${items.map((item) => item.path || item.id).join(", ")}` : "No orphan evidence.";
  } else if (intent === "delegated") {
    items = filtered.filter((item) => item.delegatedMessages?.some((message) => message.status === "open"));
    answer = items.length ? `Delegated inbox: ${items.map((item) => item.itemId).join(", ")}` : "No delegated questions or blocker requests.";
  } else if (intent === "integration") {
    const catalog = context.integrationCatalog || {};
    answer = `Integration fallback: ${catalog.nativeGraphFallback || "native-json"}; safest adapter: ${catalog.safestAdapter?.id || "native-json"}`;
  } else if (intent === "structured" || intent === "due") {
    const compiled = compileNaturalLanguageWorkItemQuery(question, { currentOwner: context.currentOwner || "me" });
    if (compiled.query) {
      const result = applyStructuredWorkItemQuery(index, compiled.parsed, {
        now: context.now,
        graph: context.graph,
        currentOwner: context.currentOwner,
        dueSoonHours: context.dueSoonHours,
      });
      items = result.items;
      answer = formatStructuredWorkItemQueryResult(result);
    } else {
      answer = "No high-confidence structured query; try --query \"status:blocked sort:age\" or a saved view.";
    }
  } else if (intent === "interactive") {
    answer = "Interactive mode is optional. Use /supervibe --interactive, /supervibe-status --interactive, or the equivalent non-interactive command shown by the palette.";
  } else if (intent === "policy" || intent === "role") {
    answer = formatGovernanceStatus(context.governance || { role: context.role || "maintainer", branch: context.branch || "" });
  } else if (intent === "duplicate") {
    items = detectDuplicateWorkItems(filtered);
    answer = items.length ? `Possible duplicates: ${items.map((item) => item.ids.join("~")).join(", ")}` : "No likely duplicates.";
  } else {
    answer = "Unknown work-item question. Try ready, blocked, owner, changed, next, summary, stale, orphan, delegated, integration, or duplicate.";
  }

  return {
    intent,
    items,
    answer,
    nextAction: intent === "next" && items[0] ? `claim ${items[0].itemId}` : "inspect status",
  };
}

export function groupWorkItemsByStatus(index = []) {
  return {
    ready: index.filter((item) => item.effectiveStatus === "ready"),
    blocked: index.filter((item) => ["blocked", "stale", "gate"].includes(item.effectiveStatus)),
    claimed: index.filter((item) => item.effectiveStatus === "claimed"),
    delegated: index.filter((item) => item.effectiveStatus === "delegated"),
    deferred: index.filter((item) => item.effectiveStatus === "deferred"),
    review: index.filter((item) => item.type === "review" || item.type === "gate"),
    done: index.filter((item) => item.effectiveStatus === "done"),
  };
}

export function detectDuplicateWorkItems(index = []) {
  const byScope = new Map();
  for (const item of index.filter((candidate) => candidate.type !== "epic")) {
    const key = [
      normalizeText(item.title),
      (item.writeScope || []).map((scope) => scope.path).sort().join("|"),
      item.repo || "",
      item.package || "",
    ].join("::");
    const group = byScope.get(key) || [];
    group.push(item);
    byScope.set(key, group);
  }
  return [...byScope.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({ ids: group.map((item) => item.itemId), title: group[0].title }));
}

export function detectStaleWorkItems(index = [], { now = new Date(), staleMinutes = 30 } = {}) {
  const nowMs = Date.parse(now instanceof Date ? now.toISOString() : now);
  return index.filter((item) => item.claims.some((claim) => {
    if (!["active", "claimed"].includes(claim.status)) return false;
    const heartbeat = Date.parse(claim.heartbeatAt || claim.expiresAt || claim.claimedAt);
    return Number.isFinite(heartbeat) && nowMs - heartbeat > Number(staleMinutes) * 60_000;
  }));
}

export function detectOrphanEvidence({ graph = {}, evidence = [] } = {}) {
  const known = new Set([...(graph.items || []).map((item) => item.itemId), ...(graph.tasks || []).map((task) => task.id)]);
  return evidence.filter((entry) => {
    const id = entry.workItemId || entry.taskId;
    return !id || !known.has(id);
  });
}

export function detectTrackerDrift(index = []) {
  return index.filter((item) => {
    if (!item.mapping?.externalId) return false;
    const nativeStatus = item.task?.status || item.status;
    const externalStatus = item.mapping.externalStatus || item.mapping.status;
    return externalStatus && nativeStatus && externalStatus !== nativeStatus && !(externalStatus === "created" && nativeStatus === "open");
  });
}

export function applyWorkItemFilters(index = [], filters = {}) {
  return index.filter((item) => {
    if (filters.repo && item.repo !== filters.repo) return false;
    if (filters.package && item.package !== filters.package) return false;
    if (filters.workspace && item.workspace !== filters.workspace) return false;
    if (filters.subproject && item.subproject !== filters.subproject) return false;
    if (filters.status && item.effectiveStatus !== filters.status) return false;
    return true;
  });
}

export function workItemStorageMode({ branch = "", protectedBranches = ["main", "master"], contributor = false, explicitMetadataBranch = null, role = null } = {}) {
  if (role) {
    const governance = resolveTeamGovernance({
      role,
      branch,
      protectedBranches,
      explicitStorageLocation: explicitMetadataBranch,
    });
    return {
      mode: `role-${slug(governance.role)}`,
      protectedMode: governance.branchPolicy.protected,
      contributorMode: governance.role === "contributor",
      role: governance.role,
      storage: governance.storage.location,
      safeSyncAction: governance.role === "read-only observer" ? "read-only-status" : governance.storage.safeSyncAction,
      governance,
    };
  }
  const protectedMode = protectedBranches.includes(branch);
  return {
    mode: contributor ? "contributor-local" : protectedMode ? "protected-local" : "project-local",
    protectedMode,
    contributorMode: contributor,
    storage: explicitMetadataBranch || (protectedMode || contributor ? ".supervibe/memory/work-items" : ".supervibe/memory/work-items"),
    safeSyncAction: protectedMode || contributor ? "preview-or-metadata-branch" : "local-write",
  };
}

function effectiveStatus(item, task, claims, gates, now, delegatedMessages = []) {
  if (item.type === "epic") return "summary";
  if (task?.status === "complete" || item.status === "complete") return "done";
  if (isWorkItemDeferred({ ...item, task, claims }, { now })) return "deferred";
  if (task?.status === "blocked" || item.status === "blocked") return "blocked";
  if (gates.some((gate) => ["open", "waiting", "blocked"].includes(gate.status))) return "gate";
  if (delegatedMessages.some((message) => message.status === "open" && message.type === "blocker-request")) return "delegated";
  if (claims.some((claim) => claim.status === "active")) {
    const stale = detectStaleWorkItems([{ ...item, claims }], { now }).length > 0;
    return stale ? "stale" : "claimed";
  }
  if ((task?.dependencies || []).length > 0) return "blocked";
  if (item.type === "followup") return "deferred";
  return "ready";
}

function blockReason(item) {
  if (item.gates.length) return `gate:${item.gates[0].gateId}`;
  if (item.delegatedMessages?.some((message) => message.status === "open")) return "delegated-message";
  if (item.claims.length) return "stale-claim";
  if (item.task?.dependencies?.length) return `dependencies:${item.task.dependencies.join(",")}`;
  return item.effectiveStatus;
}

function groupBy(values, keyFn) {
  const map = new Map();
  for (const value of values || []) {
    const key = keyFn(value);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  }
  return map;
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeLabels(labels) {
  if (Array.isArray(labels)) return labels;
  if (!labels) return [];
  return String(labels).split(",").map((label) => label.trim()).filter(Boolean);
}

function slug(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
