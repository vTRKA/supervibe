#!/usr/bin/env node
import { existsSync, mkdirSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  logInvocation,
  setInvocationLogPath,
} from "./lib/agent-invocation-logger.mjs";
import {
  issueWorkflowInvocationReceipt,
} from "./lib/supervibe-workflow-receipt-runtime.mjs";
import {
  assertReceiptOutputContracts,
} from "./lib/agent-output-contracts.mjs";
import {
  appendTraceSpan,
  createTraceContext,
  createTraceSpan,
} from "./lib/supervibe-runtime-trace.mjs";
import {
  createHostManagedSubagentCleanupTarget,
  defaultRuntimeCleanupRegistryPath,
  registerRuntimeCleanupTarget,
} from "./lib/runtime-cleanup-registry.mjs";
import {
  removeAgentLeaseForInvocation,
  upsertAgentLeaseFromInvocation,
} from "./lib/supervibe-agent-lease-registry.mjs";

const HOST_INVOCATION_SOURCES = Object.freeze({
  claude: "claude-code-task-hook",
  codex: "codex-spawn-agent",
  cursor: "cursor-agent-run",
  gemini: "gemini-agent-run",
  opencode: "opencode-agent-run",
});

function parseArgs(argv) {
  const options = { operation: argv[2] || "help" };
  for (let index = 3; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = value;
    index += 1;
  }
  return options;
}

function usage() {
  return [
    "SUPERVIBE_AGENT_INVOCATION",
    "USAGE:",
    "  node scripts/agent-invocation.mjs log --agent <agent-id> --host codex --host-invocation-id <runtime-id> --task <summary> --confidence <0-10> [--changed-files a,b] [--risks text] [--recommendations text]",
    "  node scripts/agent-invocation.mjs log --agent <agent-id> --host codex --host-invocation-id <runtime-id> --task <summary> --confidence <0-10> --issue-receipt --command /supervibe-design --stage <stage-id> --handoff-id <id> --input-evidence a,b --output-artifacts a,b",
    "  node scripts/agent-invocation.mjs log --agent <agent-id> --host codex --host-invocation-id <runtime-id> --task <summary> --confidence <0-10> --retrieval-policy memory=mandatory,rag=mandatory,codegraph=optional --memory-ids id --rag-chunk-ids file:line --graph-symbols symbol --verification-commands \"npm test\" --redaction-status not-needed",
    "",
    "NOTES:",
    "  This records a real host agent invocation id in .supervibe/memory/agent-invocations.jsonl and writes typed agent-output artifacts.",
    "  Add --issue-receipt to atomically issue the matching workflow receipt after the invocation record and typed output are written.",
    "  Add retrieval evidence flags to write .supervibe/memory/evidence-ledger.jsonl and bind RAG/CodeGraph enforcement to the invocation.",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  if (options.help || options.h || options.operation === "--help" || options.operation === "-h") {
    console.log(usage());
    process.exit(0);
  }
  if (options.operation !== "log") {
    console.log(usage());
    process.exit(options.operation === "help" ? 0 : 1);
  }

  try {
    const rootDir = resolve(options.root || process.cwd());
    const agentId = options.agent || options["agent-id"] || options.reviewer || options.worker;
    const host = String(options.host || "codex").toLowerCase();
    const source = options.source || options["host-invocation-source"] || HOST_INVOCATION_SOURCES[host];
    const invocationId = options["host-invocation-id"] || options["invocation-id"];
    const taskSummary = options.task || options.summary || options.reason;
    const confidence = Number(options.confidence ?? options.score);

    if (!agentId) throw new Error("--agent required");
    if (!source) throw new Error("--host or --host-invocation-source required");
    if (!invocationId) throw new Error("--host-invocation-id required");
    if (!taskSummary) throw new Error("--task required");
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 10) {
      throw new Error("--confidence must be a number from 0 to 10");
    }

    if (truthyFlag(options["issue-receipt"] || options.issueReceipt)) {
      preflightReceiptIssue({
        options,
        rootDir,
        agentId,
        invocationId,
      });
    }

    const traceContext = createTraceContext({
      traceId: options["trace-id"] || process.env.SUPERVIBE_TRACE_ID || undefined,
      parentSpanId: options["parent-span-id"] || process.env.SUPERVIBE_PARENT_SPAN_ID || null,
    });
    const invocationSpanStartedAt = new Date().toISOString();
    const invocationSpan = createTraceSpan({
      name: "supervibe.agent.invocation",
      traceId: traceContext.traceId,
      spanId: options["span-id"] || undefined,
      parentSpanId: traceContext.parentSpanId,
      startTime: invocationSpanStartedAt,
      attributes: {
        "supervibe.agent.id": agentId,
        "supervibe.host": host,
        "supervibe.host.source": source,
        "supervibe.host.invocation_id": invocationId,
      },
    });
    const logPath = join(rootDir, ".supervibe", "memory", "agent-invocations.jsonl");
    mkdirSync(dirname(logPath), { recursive: true });
    setInvocationLogPath(logPath);
    let record = null;
    let receiptResult = null;
    try {
      record = await logInvocation({
        agent_id: agentId,
        task_summary: taskSummary,
        confidence_score: confidence,
        invocation_id: invocationId,
        host,
        host_invocation_source: source,
        session_id: options.session || options["session-id"] || null,
        status: options.status || "completed",
        trace_id: traceContext.traceId,
        span_id: invocationSpan.spanId,
        changedFiles: splitList(options["changed-files"] || options.changedFiles),
        risks: splitList(options.risks),
        recommendations: splitList(options.recommendations),
        subtool_usage: parseKeyValueNumbers(options["subtool-usage"] || options.subtoolUsage),
        retrievalPolicy: parseRetrievalPolicy(options["retrieval-policy"] || options.retrievalPolicy),
        evidence: buildEvidenceFromOptions(options),
        command: options.command || options.workflow || null,
        stage: options.stage || options["stage-id"] || null,
        handoff_id: options["handoff-id"] || options.handoff || null,
        workflow_run_id: options["workflow-run-id"] || options.workflowRunId || null,
        task_id: options["task-id"] || options["work-item-id"] || null,
        subject_type: options["subject-type"] || "agent",
        subject_id: options["subject-id"] || agentId,
        output_artifacts: splitList(options["output-artifacts"] || options.outputArtifacts),
      });
      receiptResult = await maybeIssueWorkflowReceipt({
        options,
        rootDir,
        agentId,
        source,
        invocationId,
        taskSummary,
        record,
        traceId: traceContext.traceId,
        spanId: record.span_id,
      });
      await maybeRecordAgentLease({
        rootDir,
        host,
        source,
        invocationId,
        agentId,
        taskSummary,
        record,
        options,
      });
      await maybeRegisterHostManagedSubagentCleanup({
        rootDir,
        host,
        source,
        invocationId,
        agentId,
        record,
        options,
      });
      const span = createTraceSpan({
        name: "supervibe.agent.invocation",
        traceId: traceContext.traceId,
        spanId: invocationSpan.spanId,
        parentSpanId: traceContext.parentSpanId,
        startTime: invocationSpanStartedAt,
        endTime: new Date().toISOString(),
        status: String(record.status || "completed").toLowerCase() === "completed" ? "ok" : String(record.status || "completed"),
        attributes: {
          "supervibe.agent.id": agentId,
          "supervibe.host": host,
          "supervibe.host.source": source,
          "supervibe.host.invocation_id": invocationId,
          "supervibe.workflow.command": options.command || options.workflow || null,
          "supervibe.workflow.stage": options.stage || options["stage-id"] || null,
          "supervibe.workflow.receipt_path": receiptResult?.receiptPath || null,
        },
      });
      record.span_id = span.spanId;
      await appendTraceSpan({ rootDir, span }).catch(() => null);
    } catch (error) {
      if (record && truthyFlag(options["issue-receipt"] || options.issueReceipt)) {
        await rollbackInvocationSideEffects({ rootDir, record });
      }
      throw error;
    }

    console.log("SUPERVIBE_AGENT_INVOCATION_LOGGED");
    console.log(`AGENT: ${record.agent_id}`);
    console.log(`HOST: ${host}`);
    console.log(`HOST_SOURCE: ${source}`);
    console.log(`INVOCATION_ID: ${record.invocation_id}`);
    console.log(`TRACE_ID: ${record.trace_id || "none"}`);
    console.log(`SPAN_ID: ${record.span_id || "none"}`);
    console.log("EVIDENCE: .supervibe/memory/agent-invocations.jsonl");
    console.log("AGENT_LEASE_REGISTRY: .supervibe/memory/agent-lease-registry.json");
    console.log(`AGENT_OUTPUT_JSON: ${record.structured_output.json}`);
    console.log(`AGENT_OUTPUT_SUMMARY: ${record.structured_output.summary}`);
    if (receiptResult) {
      console.log(`WORKFLOW_RECEIPT: ${receiptResult.receiptPath}`);
      console.log(`ARTIFACT_LINKS: ${receiptResult.artifactLinksPath}`);
    }
    process.exit(0);
  } catch (error) {
    console.error("SUPERVIBE_AGENT_INVOCATION_ERROR");
    console.error(`ERROR: ${error.message}`);
    process.exit(2);
  }
}

async function maybeRegisterHostManagedSubagentCleanup({
  rootDir,
  host,
  source,
  invocationId,
  agentId,
  record,
  options = {},
} = {}) {
  const status = String(record?.status || "completed").toLowerCase();
  if (host !== "codex") return null;
  if (source !== "codex-spawn-agent") return null;
  if (!["completed", "complete", "done", "closed"].includes(status)) return null;
  const target = createHostManagedSubagentCleanupTarget({
    host,
    hostInvocationSource: source,
    hostInvocationId: invocationId,
    agentId,
    status,
    completedAt: record?.ts || null,
    rootDir,
    command: options.command || options.workflow || null,
    stage: options.stage || options["stage-id"] || null,
    handoffId: options["handoff-id"] || options.handoff || null,
    workflowRunId: options["workflow-run-id"] || options.workflowRunId || null,
    taskId: options["task-id"] || options["work-item-id"] || null,
  });
  return registerRuntimeCleanupTarget(target, {
    path: defaultRuntimeCleanupRegistryPath(rootDir),
  });
}

async function maybeRecordAgentLease({
  rootDir,
  host,
  source,
  invocationId,
  agentId,
  taskSummary,
  record,
  options = {},
} = {}) {
  return upsertAgentLeaseFromInvocation({
    rootDir,
    record,
    owner: {
      agentId,
      host,
      hostInvocationSource: source,
      hostInvocationId: invocationId,
      task: taskSummary,
    },
    scope: {
      command: options.command || options.workflow || null,
      stage: options.stage || options["stage-id"] || null,
      handoffId: options["handoff-id"] || options.handoff || null,
      workflowRunId: options["workflow-run-id"] || options.workflowRunId || null,
      taskId: options["task-id"] || options["work-item-id"] || null,
      subjectType: options["subject-type"] || "agent",
      subjectId: options["subject-id"] || agentId,
      outputArtifacts: splitList(options["output-artifacts"] || options.outputArtifacts),
      allowedOutputScope: splitList(options["allowed-output-scope"] || options.allowedOutputScope),
    },
  });
}

async function maybeIssueWorkflowReceipt({ options, rootDir, agentId, source, invocationId, taskSummary, record, traceId = null, spanId = null }) {
  if (!truthyFlag(options["issue-receipt"] || options.issueReceipt)) return null;
  const command = options.command || options.workflow;
  const stage = options.stage || options["stage-id"];
  const handoffId = options["handoff-id"] || options.handoff;
  const subjectType = options["subject-type"] || "agent";
  const outputArtifacts = splitList(options["output-artifacts"] || options.outputArtifacts);
  if (!command) throw new Error("--command required when --issue-receipt is set");
  if (!stage) throw new Error("--stage required when --issue-receipt is set");
  if (!handoffId) throw new Error("--handoff-id required when --issue-receipt is set");
  if (!outputArtifacts.length) throw new Error("--output-artifacts required when --issue-receipt is set");
  return issueWorkflowInvocationReceipt({
    rootDir,
    command,
    subjectType,
    subjectId: options["subject-id"] || agentId,
    agentId,
    stage,
    invocationReason: options.reason || taskSummary,
    inputEvidence: splitList(options["input-evidence"] || options.inputEvidence),
    outputArtifacts,
    startedAt: options["started-at"] || record.ts,
    completedAt: options["completed-at"] || record.ts,
    runTimestamp: options["run-timestamp"] || null,
    handoffId,
    secret: options.secret || null,
    hostInvocation: {
      source,
      invocationId,
      agentId,
      traceId: traceId || options["trace-id"] || null,
      spanId: spanId || options["span-id"] || null,
    },
    graphId: options["graph-id"] || options["work-graph-id"] || null,
    taskId: options["task-id"] || options["work-item-id"] || null,
  });
}

function preflightReceiptIssue({ options, rootDir, agentId, invocationId }) {
  const command = options.command || options.workflow;
  const stage = options.stage || options["stage-id"];
  const subjectId = options["subject-id"] || agentId;
  const outputArtifacts = splitList(options["output-artifacts"] || options.outputArtifacts);
  if (!command) throw new Error("--command required when --issue-receipt is set");
  if (!stage) throw new Error("--stage required when --issue-receipt is set");
  if (!outputArtifacts.length) throw new Error("--output-artifacts required when --issue-receipt is set");
  for (const artifact of outputArtifacts) {
    const relPath = normalizeRelPath(isAbsolute(artifact) ? relative(rootDir, artifact) : artifact);
    if (isPlaceholderOutputArtifact(relPath)) {
      throw new Error("--output-artifacts must name stable output files; use .supervibe/artifacts/_agent-outputs/<host-invocation-id>/agent-output.json instead of none or placeholders");
    }
  }
  assertReceiptOutputContracts({
    rootDir,
    command,
    stage,
    subjectId,
    outputArtifacts,
  });
  const generated = expectedGeneratedOutputArtifacts(invocationId);
  const missing = outputArtifacts
    .map((artifact) => normalizeRelPath(isAbsolute(artifact) ? relative(rootDir, artifact) : artifact))
    .filter((artifact) => !generated.has(artifact))
    .filter((artifact) => !existsSync(join(rootDir, ...artifact.split("/"))));
  if (missing.length) {
    throw new Error(`--output-artifacts must exist before receipt issue or be the generated agent output artifact: ${missing.join(", ")}`);
  }
}

async function rollbackInvocationSideEffects({ rootDir, record }) {
  const invocationId = record?.invocation_id || record?.invocationId;
  if (!invocationId) return;
  await removeJsonlRecords(join(rootDir, ".supervibe", "memory", "agent-invocations.jsonl"), (entry) => {
    return (entry.invocation_id || entry.invocationId) === invocationId;
  });
  await removeJsonlRecords(join(rootDir, ".supervibe", "memory", "effectiveness.jsonl"), (entry) => {
    return entry.invocationId === invocationId || entry.invocation_id === invocationId;
  });
  await removeJsonlRecords(join(rootDir, ".supervibe", "memory", "evidence-ledger.jsonl"), (entry) => {
    return entry.invocationId === invocationId || entry.invocation_id === invocationId;
  });
  await removeAgentLeaseForInvocation({
    rootDir,
    hostInvocationSource: record.host_invocation_source || record.hostInvocationSource || "codex-spawn-agent",
    hostInvocationId: record.host_invocation_id || record.hostInvocationId || invocationId,
  });
  if (record.structured_output?.directory) {
    await rm(join(rootDir, ...normalizeRelPath(record.structured_output.directory).split("/")), { recursive: true, force: true });
  }
}

async function removeJsonlRecords(path, predicate) {
  if (!existsSync(path)) return;
  const lines = (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean);
  const kept = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (predicate(parsed)) continue;
      kept.push(line);
    } catch {
      kept.push(line);
    }
  }
  if (kept.length === 0) {
    await rm(path, { force: true });
    return;
  }
  await writeFile(path, `${kept.join("\n")}\n`, "utf8");
}

function expectedGeneratedOutputArtifacts(invocationId) {
  const segment = sanitizePathSegment(invocationId || "unknown");
  return new Set([
    `.supervibe/artifacts/_agent-outputs/${segment}/agent-output.json`,
    `.supervibe/artifacts/_agent-outputs/${segment}/summary.md`,
  ]);
}

function isPlaceholderOutputArtifact(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "none" || normalized === "<paths>" || normalized === "<path>" || normalized === "null";
}

function splitList(value) {
  if (!value) return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function buildEvidenceFromOptions(options = {}) {
  const evidence = {
    memoryIds: splitList(options["memory-ids"] || options.memoryIds),
    ragChunkIds: splitList(options["rag-chunk-ids"] || options.ragChunkIds),
    graphSymbols: splitList(options["graph-symbols"] || options.graphSymbols),
    citations: parseCitations(options.citations),
    verificationCommands: splitList(options["verification-commands"] || options.verificationCommands),
    redactionStatus: options["redaction-status"] || options.redactionStatus,
    bypassReasons: splitList(options["bypass-reasons"] || options.bypassReasons),
  };
  const hasEvidence = evidence.memoryIds.length
    || evidence.ragChunkIds.length
    || evidence.graphSymbols.length
    || evidence.citations.length
    || evidence.verificationCommands.length
    || evidence.redactionStatus
    || evidence.bypassReasons.length;
  return hasEvidence ? evidence : null;
}

function parseRetrievalPolicy(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (raw.startsWith("{")) return JSON.parse(raw);
  const policy = {};
  for (const item of raw.split(",")) {
    const [key, ...rest] = item.split("=");
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) continue;
    policy[normalizedKey] = rest.join("=").trim() || "mandatory";
  }
  return Object.keys(policy).length ? policy : null;
}

function parseKeyValueNumbers(value) {
  if (!value) return {};
  const out = {};
  for (const item of String(value).split(",")) {
    const [key, rawValue] = item.split("=");
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) continue;
    const number = Number(rawValue ?? 1);
    out[normalizedKey] = Number.isFinite(number) ? number : 1;
  }
  return out;
}

function parseCitations(value) {
  return splitList(value).map((item) => {
    const parts = item.split("|").map((part) => part.trim());
    if (parts.length >= 3) return { id: parts[0], source: parts[1], path: parts.slice(2).join("|") };
    return { id: parts[0], source: "local", path: parts[0] };
  });
}

function truthyFlag(value) {
  if (value === true) return true;
  return /^(1|true|yes|on)$/i.test(String(value || ""));
}

function normalizeRelPath(path) {
  return String(path ?? "").split(sep).join("/").replace(/^\.\//, "");
}

function sanitizePathSegment(value) {
  return String(value ?? "unknown").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}
