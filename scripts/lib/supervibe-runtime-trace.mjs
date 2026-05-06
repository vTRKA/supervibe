import { appendFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";

const DEFAULT_TRACE_RELATIVE_PATH = ".supervibe/memory/telemetry/runtime-traces.jsonl";

export function createTraceSpan({
  name,
  kind = "internal",
  traceId = randomHex(16),
  spanId = randomHex(8),
  parentSpanId = null,
  startTime = new Date().toISOString(),
  endTime = null,
  status = "ok",
  attributes = {},
  events = [],
  links = [],
} = {}) {
  if (!name) throw new Error("trace span name required");
  const redaction = { status: "clean" };
  const safeAttributes = redactValue(attributes, redaction);
  const safeEvents = redactValue(events, redaction);
  const safeLinks = redactValue(links, redaction);
  const durationMs = endTime ? Math.max(0, Date.parse(endTime) - Date.parse(startTime)) : null;
  return {
    schemaVersion: 1,
    name,
    kind,
    traceId,
    spanId,
    parentSpanId,
    startTime,
    endTime,
    durationMs,
    status,
    attributes: safeAttributes,
    events: safeEvents,
    links: safeLinks,
    redactionStatus: redaction.status,
    otel: {
      name,
      kind,
      trace_id: traceId,
      span_id: spanId,
      parent_span_id: parentSpanId,
      status: { code: status },
      attributes: safeAttributes,
      events: safeEvents,
      links: safeLinks,
    },
  };
}

export function createTraceContext({
  traceId = randomHex(16),
  parentSpanId = null,
} = {}) {
  return { traceId, parentSpanId };
}

export function createChildTraceSpan({
  context = createTraceContext(),
  parentSpanId = context.parentSpanId || null,
  ...span
} = {}) {
  return createTraceSpan({
    ...span,
    traceId: span.traceId || context.traceId,
    parentSpanId,
  });
}

export async function appendCompletedTraceSpan({
  rootDir = process.cwd(),
  tracePath = defaultTracePath(rootDir),
  context = createTraceContext(),
  name,
  kind = "internal",
  parentSpanId = context.parentSpanId || null,
  startTime = new Date().toISOString(),
  endTime = new Date().toISOString(),
  status = "ok",
  attributes = {},
  events = [],
  links = [],
  nonFatal = false,
} = {}) {
  try {
    const span = createChildTraceSpan({
      context,
      name,
      kind,
      parentSpanId,
      startTime,
      endTime,
      status,
      attributes,
      events,
      links,
    });
    return await appendTraceSpan({ rootDir, tracePath, span });
  } catch (error) {
    if (!nonFatal) throw error;
    return {
      tracePath,
      span: null,
      error: error.message,
    };
  }
}

export async function appendTraceSpan({
  rootDir = process.cwd(),
  span,
  tracePath = defaultTracePath(rootDir),
} = {}) {
  if (!span?.traceId || !span?.spanId) throw new Error("valid trace span required");
  await mkdir(dirname(tracePath), { recursive: true });
  await appendFile(tracePath, `${JSON.stringify(span)}\n`, "utf8");
  return { tracePath, span };
}

export async function readTraceSpans({
  rootDir = process.cwd(),
  tracePath = defaultTracePath(rootDir),
  limit = 1000,
} = {}) {
  if (!existsSync(tracePath)) return [];
  const raw = await readFile(tracePath, "utf8");
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-limit)
    .map((line) => JSON.parse(line));
}

export async function buildTraceReadinessReport({ rootDir = process.cwd(), tracePath = defaultTracePath(rootDir) } = {}) {
  const spans = await readTraceSpans({ rootDir, tracePath });
  return {
    schemaVersion: 1,
    pass: true,
    tracePath: relativeTracePath(rootDir, tracePath),
    spans: spans.length,
    latestSpan: spans.at(-1)?.name || null,
    capabilities: [
      "otel-compatible-json",
      "local-jsonl-export",
      "secret-redaction",
      "command-memory-rag-codegraph-receipt-span-ready",
    ],
    nextAction: spans.length > 0
      ? "use runtime trace spans as receipt-adjacent evidence"
      : "start appending spans from command and workflow runtimes",
  };
}

export function formatTraceReadinessReport(report = {}) {
  return [
    "SUPERVIBE_RUNTIME_TRACE",
    `PASS: ${Boolean(report.pass)}`,
    `TRACE_PATH: ${report.tracePath || DEFAULT_TRACE_RELATIVE_PATH}`,
    `SPANS: ${report.spans || 0}`,
    `LATEST_SPAN: ${report.latestSpan || "none"}`,
    `CAPABILITIES: ${(report.capabilities || []).join(",") || "none"}`,
    `NEXT_ACTION: ${report.nextAction || "none"}`,
  ].join("\n");
}

function defaultTracePath(rootDir = process.cwd()) {
  return join(rootDir, ...DEFAULT_TRACE_RELATIVE_PATH.split("/"));
}

function redactValue(value, redaction) {
  if (typeof value === "string") return redactString(value, redaction);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, redaction));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, redactValue(nested, redaction)]));
  }
  return value;
}

function redactString(value, redaction) {
  let next = value
    .replace(/\bsk-[A-Za-z0-9_-]{6,}\b/g, "[REDACTED_SECRET]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED_EMAIL]")
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, "[REDACTED_AWS_KEY]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]");
  if (next !== value) redaction.status = "redacted";
  return next;
}

function randomHex(bytes) {
  return randomBytes(bytes).toString("hex");
}

function relativeTracePath(rootDir, tracePath) {
  const normalizedRoot = String(rootDir).replace(/\\/g, "/").replace(/\/$/, "");
  const normalizedTrace = String(tracePath).replace(/\\/g, "/");
  return normalizedTrace.startsWith(`${normalizedRoot}/`)
    ? normalizedTrace.slice(normalizedRoot.length + 1)
    : normalizedTrace;
}
