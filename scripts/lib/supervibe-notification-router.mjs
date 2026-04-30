import { redactSensitiveContent } from "./autonomous-loop-artifact-retention.mjs";
import { evaluateWebhookTarget } from "./autonomous-loop-provider-policy-guard.mjs";
import { createDelegatedMessage } from "./supervibe-work-item-message-delegation.mjs";

export const NOTIFICATION_EVENT_CLASSES = Object.freeze([
  "approval-needed",
  "blocker-opened",
  "task-claimed",
  "stale-claim",
  "review-needed",
  "run-completed",
  "run-failed",
  "policy-stop",
  "release-gate-failed",
  "due-soon",
  "overdue",
  "scheduled-check",
]);

export function routeNotificationEvent(event = {}, options = {}) {
  const routes = normalizeRoutes(options.routes || ["terminal"]);
  const safeEvent = sanitizeNotificationEvent(event);
  const deliveries = [];

  for (const route of routes) {
    if (route === "terminal") {
      deliveries.push({ route, status: "ready", payload: formatTerminalNotification(safeEvent) });
    } else if (route === "inbox") {
      deliveries.push({ route, status: "ready", payload: createInboxNotification(safeEvent) });
    } else if (route === "dashboard") {
      deliveries.push({ route, status: "ready", payload: { event: safeEvent, dashboard: options.dashboardPath || null } });
    } else if (route === "webhook") {
      const webhook = evaluateWebhookTarget({
        url: options.webhookUrl,
        allowlist: options.webhookAllowlist || [],
        approvalLease: options.approvalLease || null,
      });
      deliveries.push({
        route,
        status: webhook.allowed ? "ready" : "blocked",
        blocker: webhook.allowed ? null : webhook,
        payload: webhook.allowed ? { url: options.webhookUrl, event: safeEvent } : null,
      });
    }
  }

  return {
    event: safeEvent,
    deliveries,
    blocked: deliveries.filter((delivery) => delivery.status === "blocked"),
    nextSafeAction: deliveries.some((delivery) => delivery.status === "blocked")
      ? "resolve notification approval or remove blocked route"
      : safeEvent.nextSafeAction || "inspect status",
  };
}

export function formatTerminalNotification(event = {}) {
  return [
    "SUPERVIBE_NOTIFICATION",
    `EVENT: ${event.class}`,
    `RUN_ID: ${event.runId || "none"}`,
    `TASK_ID: ${event.taskId || "none"}`,
    `NEXT_ACTION: ${event.nextSafeAction || "inspect status"}`,
    `MESSAGE: ${event.message || ""}`,
  ].join("\n");
}

export function formatNotificationRouteResult(result = {}) {
  return [
    "SUPERVIBE_NOTIFICATION_ROUTES",
    `EVENT: ${result.event?.class || "unknown"}`,
    `BLOCKED: ${result.blocked?.length || 0}`,
    ...(result.deliveries || []).map((delivery) => `- ${delivery.route}: ${delivery.status}`),
  ].join("\n");
}

export function sanitizeNotificationEvent(event = {}) {
  const eventClass = NOTIFICATION_EVENT_CLASSES.includes(event.class) ? event.class : "blocker-opened";
  return {
    class: eventClass,
    runId: clean(event.runId),
    taskId: clean(event.taskId),
    workItemId: clean(event.workItemId || event.taskId),
    message: clean(event.message || event.summary || eventClass),
    nextSafeAction: clean(event.nextSafeAction || "inspect status"),
    severity: clean(event.severity || defaultSeverity(eventClass)),
    createdAt: event.createdAt || new Date().toISOString(),
  };
}

function createInboxNotification(event) {
  return createDelegatedMessage({
    workItemId: event.workItemId || event.taskId || event.runId || "run",
    type: event.class === "review-needed" ? "review-request" : event.class === "blocker-opened" || event.class === "approval-needed" ? "blocker-request" : "handoff-note",
    target: event.class === "review-needed" ? "reviewer" : "user",
    body: `${event.message}. Next: ${event.nextSafeAction}`,
    status: "open",
    createdAt: event.createdAt,
  });
}

function normalizeRoutes(routes) {
  const values = Array.isArray(routes) ? routes : String(routes || "").split(",");
  return [...new Set(values.map((route) => route.trim()).filter(Boolean))];
}

function clean(value) {
  return redactSensitiveContent(String(value || "")).replace(/[A-Z]:\\Users\\[^\\"]+/g, "[USER_PATH]");
}

function defaultSeverity(eventClass) {
  if (["run-failed", "policy-stop", "release-gate-failed"].includes(eventClass)) return "high";
  if (["approval-needed", "blocker-opened", "review-needed", "stale-claim", "due-soon", "overdue", "scheduled-check"].includes(eventClass)) return "medium";
  return "info";
}
