import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { redactSensitiveContent } from "./autonomous-loop-artifact-retention.mjs";
import { getDueAt } from "./supervibe-work-item-query-language.mjs";

export function createSlaReport(index = [], { now = new Date().toISOString(), slaHours = 48, dueSoonHours = 48 } = {}) {
  const current = parseTime(now);
  const items = index.filter((item) => item.type !== "epic").map((item) => {
    const created = parseTime(item.createdAt || item.created_at || item.task?.createdAt || item.task?.created_at || now);
    const openedSeconds = secondsBetween(created, current);
    const blockedSeconds = estimateBlockedSeconds(item, current);
    const claimedSeconds = estimateClaimedSeconds(item, current);
    const staleSeconds = estimateStaleSeconds(item, current);
    const dueAt = getDueAt(item);
    const dueState = classifyDueState(dueAt, current, dueSoonHours);
    const waitingOnHuman = isHumanWaiting(item);
    return {
      itemId: item.itemId || item.id,
      title: item.title || item.goal || "",
      status: item.effectiveStatus || item.status || item.task?.status || "unknown",
      openedSeconds,
      blockedSeconds,
      claimedSeconds,
      staleSeconds,
      dueAt,
      dueState,
      missedDueDate: dueState === "overdue",
      waitingOnHuman,
      agentExecutionSeconds: waitingOnHuman ? 0 : claimedSeconds,
      agentFailure: !waitingOnHuman && staleSeconds > 0,
      slaMissed: openedSeconds > Number(slaHours) * 3600 && !["done", "complete"].includes(String(item.effectiveStatus || item.status).toLowerCase()),
      blockerReason: blockReason(item),
    };
  });

  const repeatedBlockerReasons = countRepeated(items.map((item) => item.blockerReason).filter(Boolean));
  const oldestReadyWork = items
    .filter((item) => item.status === "ready")
    .sort((a, b) => b.openedSeconds - a.openedSeconds)
    .slice(0, 5);

  return {
    type: "sla",
    generatedAt: new Date(current).toISOString(),
    slaHours,
    dueSoonHours,
    summary: {
      total: items.length,
      overdue: items.filter((item) => item.dueState === "overdue").length,
      dueSoon: items.filter((item) => item.dueState === "due-soon").length,
      stale: items.filter((item) => item.staleSeconds > 0).length,
      slaMissed: items.filter((item) => item.slaMissed).length,
      humanWaiting: items.filter((item) => item.waitingOnHuman).length,
      agentFailures: items.filter((item) => item.agentFailure).length,
    },
    repeatedBlockerReasons,
    oldestReadyWork,
    items,
  };
}

export function createRecurringWorkReport(index = [], { type = "daily", now = new Date().toISOString(), releaseGates = [] } = {}) {
  const done = index.filter((item) => ["done", "complete", "closed"].includes(String(item.effectiveStatus || item.status).toLowerCase()));
  const blocked = index.filter((item) => ["blocked", "stale", "gate", "delegated"].includes(String(item.effectiveStatus || item.status).toLowerCase()));
  const nextReady = index.filter((item) => item.effectiveStatus === "ready").slice(0, 8);
  const staleClaims = index.filter((item) => (item.claims || []).some((claim) => ["stale", "expired"].includes(claim.status)));
  const reviewRequests = index.filter((item) => item.type === "review" || item.verificationState === "review" || item.gates?.some((gate) => gate.status === "review"));
  const riskChanges = index.filter((item) => ["high", "critical"].includes(String(item.policyRiskLevel || item.risk || "").toLowerCase()));
  return {
    type,
    generatedAt: new Date(parseTime(now)).toISOString(),
    summary: {
      done: done.length,
      blocked: blocked.length,
      nextReady: nextReady.length,
      staleClaims: staleClaims.length,
      reviewRequests: reviewRequests.length,
      releaseGates: releaseGates.length,
      highRisk: riskChanges.length,
    },
    done,
    blocked,
    nextReady,
    riskChanges,
    staleClaims,
    reviewRequests,
    releaseGates,
  };
}

export function renderWorkReportMarkdown(report = {}) {
  const lines = [
    `# Supervibe ${title(report.type || "work")} Report`,
    "",
    `Generated: ${report.generatedAt || "deterministic-local"}`,
    "",
    "## Summary",
    "",
  ];
  for (const [key, value] of Object.entries(report.summary || {})) lines.push(`- ${key}: ${value}`);

  if (report.type === "sla") {
    lines.push("", "## Oldest Ready Work", "");
    for (const item of report.oldestReadyWork || []) lines.push(`- ${item.itemId}: ${item.title} (${Math.round(item.openedSeconds / 3600)}h open)`);
    lines.push("", "## Repeated Blockers", "");
    for (const entry of report.repeatedBlockerReasons || []) lines.push(`- ${entry.reason}: ${entry.count}`);
    lines.push("", "## Items", "");
    for (const item of report.items || []) lines.push(`- ${item.itemId}: ${item.status} due=${item.dueState} human_waiting=${item.waitingOnHuman} agent_failure=${item.agentFailure}`);
  } else {
    lines.push("", "## Done", "");
    for (const item of report.done || []) lines.push(`- ${item.itemId || item.id}: ${item.title || item.goal || ""}`);
    lines.push("", "## Blocked", "");
    for (const item of report.blocked || []) lines.push(`- ${item.itemId || item.id}: ${item.title || item.goal || ""}`);
    lines.push("", "## Next Ready", "");
    for (const item of report.nextReady || []) lines.push(`- ${item.itemId || item.id}: ${item.title || item.goal || ""}`);
    lines.push("", "## Risk Changes", "");
    for (const item of report.riskChanges || []) lines.push(`- ${item.itemId || item.id}: ${item.policyRiskLevel || item.risk}`);
  }
  return redactWorkReport(lines.join("\n"));
}

export async function writeWorkReportMarkdown(outPath, report) {
  await mkdir(dirname(outPath), { recursive: true });
  const markdown = renderWorkReportMarkdown(report);
  await writeFile(outPath, `${markdown}\n`, "utf8");
  return { outPath, bytes: Buffer.byteLength(markdown), markdown };
}

export function redactWorkReport(value = "") {
  return redactSensitiveContent(String(value))
    .replace(/[A-Z]:\\Users\\[^\\\n)]+/g, "[USER_PATH]")
    .replace(/\/home\/[^/\n)]+/g, "/home/[USER]")
    .replace(/raw prompt:[^\n]+/gi, "raw prompt:[REDACTED]");
}

function estimateBlockedSeconds(item, current) {
  if (!["blocked", "stale", "gate", "delegated"].includes(String(item.effectiveStatus || item.status).toLowerCase())) return 0;
  const starts = [
    item.blockedAt,
    item.blocked_at,
    item.deferred?.createdAt,
    ...(item.gates || []).map((gate) => gate.createdAt || gate.openedAt),
    ...(item.delegatedMessages || []).map((message) => message.createdAt),
    ...(item.comments || []).filter((comment) => /block|approval|waiting/i.test(`${comment.type} ${comment.body}`)).map((comment) => comment.createdAt),
  ].map(parseMaybe).filter(Number.isFinite);
  const start = starts.length ? Math.min(...starts) : parseTime(item.createdAt || item.task?.createdAt || current);
  return secondsBetween(start, current);
}

function estimateClaimedSeconds(item, current) {
  return (item.claims || []).reduce((total, claim) => {
    const start = parseMaybe(claim.claimedAt || claim.createdAt);
    const end = parseMaybe(claim.releasedAt || claim.completedAt || claim.heartbeatAt) || current;
    if (!Number.isFinite(start)) return total;
    return total + secondsBetween(start, end);
  }, 0);
}

function estimateStaleSeconds(item, current) {
  return (item.claims || []).reduce((total, claim) => {
    if (!["stale", "expired"].includes(claim.status)) return total;
    const start = parseMaybe(claim.heartbeatAt || claim.expiresAt || claim.claimedAt);
    return Number.isFinite(start) ? total + secondsBetween(start, current) : total;
  }, 0);
}

function classifyDueState(dueAt, current, dueSoonHours) {
  const due = parseMaybe(dueAt);
  if (!Number.isFinite(due)) return "none";
  if (due < current) return "overdue";
  if (due <= current + Number(dueSoonHours) * 3600_000) return "due-soon";
  return "on-track";
}

function isHumanWaiting(item) {
  const status = String(item.effectiveStatus || item.status || "").toLowerCase();
  return ["gate", "delegated", "policy-stopped", "policy_stopped"].includes(status)
    || (item.gates || []).some((gate) => /approval|human|review/i.test(`${gate.type || ""} ${gate.status || ""}`))
    || (item.delegatedMessages || []).some((message) => message.status === "open");
}

function blockReason(item) {
  if (item.blockedReason || item.blocked_reason) return item.blockedReason || item.blocked_reason;
  if (item.gates?.length) return "gate";
  if (item.delegatedMessages?.some((message) => message.status === "open")) return "human-wait";
  if (item.task?.dependencies?.length) return "dependency";
  return "";
}

function countRepeated(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([reason, count]) => ({ reason, count }));
}

function secondsBetween(start, end) {
  return Math.max(0, Math.floor((end - start) / 1000));
}

function parseMaybe(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : NaN;
}

function parseTime(value) {
  const parsed = parseMaybe(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function title(value) {
  return String(value).replace(/(^|-)([a-z])/g, (_, prefix, letter) => `${prefix ? " " : ""}${letter.toUpperCase()}`);
}
