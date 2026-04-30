import assert from "node:assert/strict";
import test from "node:test";
import { evaluateWebhookTarget } from "../scripts/lib/autonomous-loop-provider-policy-guard.mjs";
import {
  formatNotificationRouteResult,
  formatTerminalNotification,
  NOTIFICATION_EVENT_CLASSES,
  routeNotificationEvent,
  sanitizeNotificationEvent,
} from "../scripts/lib/supervibe-notification-router.mjs";

test("notification router sends terminal, inbox, and dashboard payloads without raw secrets", () => {
  assert.ok(NOTIFICATION_EVENT_CLASSES.includes("run-completed"));

  const result = routeNotificationEvent({
    class: "blocker-opened",
    runId: "run1",
    taskId: "t1",
    message: "Need approval token=secret-value-that-must-redact",
    nextSafeAction: "approve gate",
  }, { routes: "terminal,inbox,dashboard" });

  assert.equal(result.blocked.length, 0);
  assert.equal(result.deliveries.length, 3);
  assert.doesNotMatch(formatTerminalNotification(result.event), /secret-value-that-must-redact/);
  assert.match(result.deliveries.find((delivery) => delivery.route === "inbox").payload.body, /\[REDACTED\]/);
});

test("webhook delivery is disabled until URL is allowlisted and approved", () => {
  const blocked = routeNotificationEvent({ class: "run-failed", runId: "run1" }, {
    routes: ["webhook"],
    webhookUrl: "https://hooks.example.test/supervibe",
    webhookAllowlist: ["https://hooks.example.test"],
  });
  assert.equal(blocked.blocked[0].blocker.status, "webhook_allowlist_required");

  const allowed = routeNotificationEvent({ class: "run-failed", runId: "run1" }, {
    routes: ["webhook"],
    webhookUrl: "https://hooks.example.test/supervibe",
    webhookAllowlist: ["https://hooks.example.test"],
    approvalLease: { scopes: ["webhook:https://hooks.example.test"] },
  });
  assert.equal(allowed.deliveries[0].status, "ready");
  assert.match(formatNotificationRouteResult(allowed), /webhook: ready/);
});

test("provider policy guard rejects invalid webhook targets", () => {
  assert.equal(evaluateWebhookTarget({ url: "http://example.test" }).status, "webhook_https_required");
  assert.equal(evaluateWebhookTarget({ url: "not a url" }).status, "webhook_url_invalid");
});

test("unknown notification classes are normalized to safe blocker events", () => {
  assert.equal(sanitizeNotificationEvent({ class: "raw", message: "password=secret-value" }).class, "blocker-opened");
});
