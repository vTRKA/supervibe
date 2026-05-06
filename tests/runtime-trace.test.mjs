import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  appendCompletedTraceSpan,
  appendTraceSpan,
  buildTraceReadinessReport,
  createChildTraceSpan,
  createTraceContext,
  createTraceSpan,
  formatTraceReadinessReport,
  readTraceSpans,
} from "../scripts/lib/supervibe-runtime-trace.mjs";

test("runtime trace spans are OpenTelemetry-compatible and redact sensitive fields", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-runtime-trace-"));
  try {
    await mkdir(join(rootDir, ".supervibe", "memory"), { recursive: true });
    const span = createTraceSpan({
      name: "supervibe.command.match",
      attributes: {
        command: "/supervibe-audit",
        apiKey: "sk-test123456",
        email: "operator@example.com",
      },
      events: [{ name: "tool", attributes: { aws: "AKIA1234567890ABCDEF" } }],
    });

    assert.equal(span.name, "supervibe.command.match");
    assert.equal(span.redactionStatus, "redacted");
    assert.equal(span.attributes.apiKey, "[REDACTED_SECRET]");
    assert.equal(span.attributes.email, "[REDACTED_EMAIL]");
    assert.equal(span.events[0].attributes.aws, "[REDACTED_AWS_KEY]");
    assert.equal(span.otel.name, span.name);
    assert.equal(span.otel.trace_id, span.traceId);
    assert.equal(span.otel.span_id, span.spanId);

    await appendTraceSpan({ rootDir, span });
    const spans = await readTraceSpans({ rootDir });
    assert.equal(spans.length, 1);
    assert.equal(spans[0].traceId, span.traceId);

    const report = await buildTraceReadinessReport({ rootDir });
    assert.equal(report.pass, true);
    assert.equal(report.spans, 1);
    assert.match(formatTraceReadinessReport(report), /SUPERVIBE_RUNTIME_TRACE/);
    assert.match(formatTraceReadinessReport(report), /PASS: true/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("runtime trace helpers preserve parent child correlation", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-runtime-trace-chain-"));
  try {
    const context = createTraceContext({ traceId: "trace-chain-1" });
    const command = createChildTraceSpan({
      context,
      name: "supervibe.command.match",
      spanId: "span-command",
      attributes: { command: "/supervibe-plan" },
    });
    const agent = createChildTraceSpan({
      context,
      parentSpanId: command.spanId,
      name: "supervibe.agent.invocation",
      spanId: "span-agent",
      attributes: { agentId: "systems-analyst" },
    });
    const receipt = await appendCompletedTraceSpan({
      rootDir,
      context,
      parentSpanId: agent.spanId,
      name: "supervibe.workflow.receipt.issue",
      attributes: { receiptId: "receipt-1", secret: "sk-trace123456" },
    });

    await appendTraceSpan({ rootDir, span: command });
    await appendTraceSpan({ rootDir, span: agent });
    const spans = await readTraceSpans({ rootDir });

    const byName = Object.fromEntries(spans.map((span) => [span.name, span]));
    assert.equal(spans.length, 3);
    assert.equal(byName["supervibe.command.match"].traceId, "trace-chain-1");
    assert.equal(byName["supervibe.agent.invocation"].traceId, "trace-chain-1");
    assert.equal(byName["supervibe.agent.invocation"].parentSpanId, "span-command");
    assert.equal(byName["supervibe.workflow.receipt.issue"].parentSpanId, "span-agent");
    assert.equal(receipt.span.redactionStatus, "redacted");
    assert.equal(receipt.span.attributes.secret, "[REDACTED_SECRET]");

    const report = await buildTraceReadinessReport({ rootDir });
    assert.equal(report.latestSpan, "supervibe.agent.invocation");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
