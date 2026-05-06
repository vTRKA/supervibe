import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  appendTraceSpan,
  buildTraceReadinessReport,
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
