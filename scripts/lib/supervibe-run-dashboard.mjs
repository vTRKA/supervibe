import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createGraphInspection } from "./autonomous-loop-graph-export.mjs";
import { redactSensitiveContent } from "./autonomous-loop-artifact-retention.mjs";
import { buildSchedulerSnapshot } from "./supervibe-work-item-scheduler.mjs";
import { createSlaReport } from "./supervibe-work-item-sla-reports.mjs";

export function buildRunDashboardModel({
  state = {},
  progressLog = [],
  comments = [],
  evidence = [],
  delegatedMessages = [],
  releaseGates = [],
  savedViews = [],
  scheduledChecks = [],
  workItemIndex = [],
  reports = [],
  interactiveHints = [],
  evalSummary = null,
  generatedAt = "deterministic-local",
} = {}) {
  const graph = createGraphInspection(state);
  const observability = summarizeRunObservability({ state, progressLog });
  const blockers = graph.nodes.filter((node) => ["blocked", "policy_stopped", "budget_stopped", "command_adapter_required"].includes(node.status) || node.gates.length > 0);
  const verification = summarizeVerificationCoverage(state.verification_matrix || state.verificationMatrix || []);
  const scheduler = buildSchedulerSnapshot(workItemIndex, { checks: scheduledChecks, now: generatedAt === "deterministic-local" ? new Date().toISOString() : generatedAt });
  const dashboardReports = reports.length ? reports : (workItemIndex.length ? [createSlaReport(workItemIndex, { now: generatedAt === "deterministic-local" ? new Date().toISOString() : generatedAt })] : []);

  return redactDashboardModel({
    schemaVersion: 1,
    generatedAt,
    runId: state.run_id || state.runId || "unknown",
    status: state.status || "unknown",
    graph,
    timeline: progressLog.map((entry) => ({
      at: entry.createdAt || entry.at || entry.timestamp || null,
      taskId: entry.taskId || null,
      section: entry.section || entry.type || "progress",
      summary: entry.summary || entry.message || "",
    })),
    readyFront: graph.readyFront,
    blockers,
    worktreeSessions: state.worktree_sessions || state.worktreeSessions || [],
    delegatedInbox: delegatedMessages.filter((message) => message.status !== "closed"),
    comments,
    evidence,
    savedViews,
    interactiveHints,
    deferredWork: scheduler.deferred,
    scheduledChecks: scheduler.scheduledDue,
    verification,
    riskRegister: collectRiskRegister(state),
    releaseGates: [
      ...(state.release_gates || state.releaseGates || []),
      ...releaseGates,
    ],
    reports: dashboardReports.map((report) => ({ type: report.type, generatedAt: report.generatedAt, summary: report.summary })),
    evalSummary,
    observability,
  });
}

export function summarizeRunObservability({ state = {}, progressLog = [], now = new Date().toISOString() } = {}) {
  const startedAt = state.started_at || state.startedAt || state.createdAt || progressLog[0]?.createdAt || progressLog[0]?.at || null;
  const finishedAt = state.finished_at || state.finishedAt || state.completedAt || (state.status === "COMPLETE" ? state.last_progress_at : null) || now;
  const attempts = state.attempts || [];
  const attemptsPerTask = attempts.reduce((acc, attempt) => {
    const taskId = attempt.taskId || attempt.task_id || "unknown";
    acc[taskId] = (acc[taskId] || 0) + 1;
    return acc;
  }, {});
  const verification = summarizeVerificationCoverage(state.verification_matrix || state.verificationMatrix || []);
  const confidenceTrend = (state.scores || []).map((score) => ({
    taskId: score.taskId,
    score: score.finalScore ?? score.score ?? null,
  }));
  const staleClaimCount = (state.claims || []).filter((claim) => claim.status === "expired" || claim.status === "stale").length;

  return {
    durationSeconds: durationSeconds(startedAt, finishedAt),
    timeBlockedSeconds: estimateBlockedSeconds(progressLog),
    attemptsPerTask,
    verificationPassCount: verification.pass,
    verificationFailCount: verification.fail,
    requeueCount: (state.failure_packets || state.failurePackets || []).length + (state.requeue_summary?.count || 0),
    staleClaimCount,
    confidenceTrend,
  };
}

export function renderRunDashboardHtml(model = {}) {
  const safe = redactDashboardModel(model);
  const sections = [
    section("Graph", renderGraph(safe.graph)),
    section("Timeline", renderList(safe.timeline, (entry) => `${entry.at || "unknown"} ${entry.taskId || "run"} ${entry.section}: ${entry.summary}`)),
    section("Ready Front", renderJson(safe.readyFront)),
    section("Blockers", renderList(safe.blockers, (item) => `${item.id} ${item.status} gates=${item.gates?.length || 0}`)),
    section("Worktree Sessions", renderList(safe.worktreeSessions, (item) => `${item.sessionId || item.id || "session"} ${item.status || "unknown"} ${item.worktreePath || ""}`)),
    section("Delegated Inbox", renderList(safe.delegatedInbox, (item) => `${item.workItemId} ${item.type} -> ${item.target}: ${item.body}`)),
    section("Saved Views", renderList(safe.savedViews, (item) => `${item.name}: ${item.query}`)),
    section("Interactive Hints", renderList(safe.interactiveHints, (item) => `${item.label || item.id}: ${item.command || item.nextAction || ""}`)),
    section("Deferred Work", renderList(safe.deferredWork, (item) => `${item.itemId || item.id} until=${item.deferredUntil || item.deferred?.until || "manual"}`)),
    section("Scheduled Checks", renderList(safe.scheduledChecks, (item) => `${item.itemId} ${item.action || "re-evaluate"} at=${item.at}`)),
    section("Verification Coverage", renderJson(safe.verification)),
    section("Risk Register", renderList(safe.riskRegister, (item) => `${item.taskId || "run"} ${item.level || "unknown"} ${item.reason || ""}`)),
    section("Release Gates", renderList(safe.releaseGates, (item) => `${item.gate || item.name || "gate"} pass=${item.pass}`)),
    section("Work Reports", renderJson(safe.reports)),
    section("Eval Summary", renderJson(safe.evalSummary)),
    section("Observability", renderJson(safe.observability)),
  ];

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>Supervibe Run Dashboard ${escapeHtml(safe.runId || "")}</title>`,
    "<style>",
    "body{font-family:Inter,Segoe UI,Arial,sans-serif;margin:0;background:#f7f7f4;color:#202124}header{padding:20px 24px;background:#103d3b;color:white}main{padding:18px 24px;display:grid;gap:16px}section{border:1px solid #d5d5cc;background:white;border-radius:8px;padding:14px}h1,h2{margin:0 0 8px}pre{white-space:pre-wrap;overflow:auto;background:#f2f2ee;padding:10px;border-radius:6px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px}.pill{display:inline-block;border:1px solid #bbb;border-radius:999px;padding:2px 8px;margin:2px;background:#fafafa}",
    "</style>",
    "</head>",
    "<body>",
    `<header><h1>Supervibe Run Dashboard</h1><div>Run ${escapeHtml(safe.runId)} | ${escapeHtml(safe.status)} | generated ${escapeHtml(safe.generatedAt)}</div></header>`,
    "<main>",
    ...sections,
    "</main>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

export async function writeRunDashboardHtml(outPath, model) {
  await mkdir(dirname(outPath), { recursive: true });
  const html = renderRunDashboardHtml(model);
  await writeFile(outPath, html, "utf8");
  return { outPath, bytes: Buffer.byteLength(html), html };
}

export function redactDashboardModel(model = {}) {
  return JSON.parse(redactDashboardText(JSON.stringify(model)));
}

export function redactDashboardText(value = "") {
  return redactSensitiveContent(String(value))
    .replace(/[A-Z]:\\Users\\[^\\"]+/g, "[USER_PATH]")
    .replace(/\/home\/[^/\\"]+/g, "/home/[USER]")
    .replace(/raw prompt:[^\\n"]+/gi, "raw prompt:[REDACTED]");
}

function summarizeVerificationCoverage(entries = []) {
  return entries.reduce((acc, entry) => {
    if (entry.status === "pass" || entry.pass === true) acc.pass += 1;
    else if (entry.status === "fail" || entry.pass === false) acc.fail += 1;
    else acc.unknown += 1;
    return acc;
  }, { pass: 0, fail: 0, unknown: 0, total: entries.length });
}

function collectRiskRegister(state = {}) {
  const risks = [];
  for (const task of state.tasks || []) {
    if (task.policyRiskLevel || task.policy_risk || task.risk) {
      risks.push({
        taskId: task.id,
        level: task.policyRiskLevel || task.policy_risk || task.risk,
        reason: task.goal || task.title || "",
      });
    }
  }
  if (state.permission_audit?.blockers?.length) {
    for (const blocker of state.permission_audit.blockers) {
      risks.push({ taskId: "run", level: "policy", reason: blocker.reason || blocker.status });
    }
  }
  return risks;
}

function estimateBlockedSeconds(progressLog = []) {
  let total = 0;
  let openedAt = null;
  for (const entry of progressLog) {
    const text = `${entry.section || ""} ${entry.summary || ""} ${entry.status || ""}`.toLowerCase();
    const at = Date.parse(entry.createdAt || entry.at || entry.timestamp || "");
    if (!Number.isFinite(at)) continue;
    if (!openedAt && /block|gate|waiting/.test(text)) openedAt = at;
    if (openedAt && /unblock|resolved|complete|closed/.test(text)) {
      total += Math.max(0, Math.floor((at - openedAt) / 1000));
      openedAt = null;
    }
  }
  return total;
}

function durationSeconds(startedAt, finishedAt) {
  const start = Date.parse(startedAt || "");
  const finish = Date.parse(finishedAt || "");
  if (!Number.isFinite(start) || !Number.isFinite(finish)) return 0;
  return Math.max(0, Math.floor((finish - start) / 1000));
}

function renderGraph(graph = {}) {
  const nodes = graph.nodes || [];
  return `<div class="grid">${nodes.map((node) => `<div class="pill">${escapeHtml(node.id)} ${escapeHtml(node.status)}${node.ready ? " ready" : ""}</div>`).join("")}</div><pre>${escapeHtml(JSON.stringify(graph.edges || [], null, 2))}</pre>`;
}

function section(title, body) {
  return `<section id="${slug(title)}"><h2>${escapeHtml(title)}</h2>${body || "<p>None</p>"}</section>`;
}

function renderList(items = [], formatter) {
  if (!items.length) return "<p>None</p>";
  return `<ul>${items.map((item) => `<li>${escapeHtml(formatter(item))}</li>`).join("")}</ul>`;
}

function renderJson(value) {
  return `<pre>${escapeHtml(JSON.stringify(value || {}, null, 2))}</pre>`;
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
