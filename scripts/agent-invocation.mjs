#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  logInvocation,
  setInvocationLogPath,
} from "./lib/agent-invocation-logger.mjs";
import {
  issueWorkflowInvocationReceipt,
} from "./lib/supervibe-workflow-receipt-runtime.mjs";

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
    "",
    "NOTES:",
    "  This records a real host agent invocation id in .supervibe/memory/agent-invocations.jsonl and writes typed agent-output artifacts.",
    "  Add --issue-receipt to atomically issue the matching workflow receipt after the invocation record and typed output are written.",
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

    const logPath = join(rootDir, ".supervibe", "memory", "agent-invocations.jsonl");
    mkdirSync(dirname(logPath), { recursive: true });
    setInvocationLogPath(logPath);
    const record = await logInvocation({
      agent_id: agentId,
      task_summary: taskSummary,
      confidence_score: confidence,
      invocation_id: invocationId,
      host,
      host_invocation_source: source,
      session_id: options.session || options["session-id"] || null,
      status: options.status || "completed",
      trace_id: options["trace-id"] || null,
      span_id: options["span-id"] || null,
      changedFiles: splitList(options["changed-files"] || options.changedFiles),
      risks: splitList(options.risks),
      recommendations: splitList(options.recommendations),
    });
    const receiptResult = await maybeIssueWorkflowReceipt({
      options,
      rootDir,
      agentId,
      source,
      invocationId,
      taskSummary,
      record,
    });

    console.log("SUPERVIBE_AGENT_INVOCATION_LOGGED");
    console.log(`AGENT: ${record.agent_id}`);
    console.log(`HOST: ${host}`);
    console.log(`HOST_SOURCE: ${source}`);
    console.log(`INVOCATION_ID: ${record.invocation_id}`);
    console.log("EVIDENCE: .supervibe/memory/agent-invocations.jsonl");
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

async function maybeIssueWorkflowReceipt({ options, rootDir, agentId, source, invocationId, taskSummary, record }) {
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
      traceId: options["trace-id"] || null,
      spanId: options["span-id"] || null,
    },
  });
}

function splitList(value) {
  if (!value) return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function truthyFlag(value) {
  if (value === true) return true;
  return /^(1|true|yes|on)$/i.test(String(value || ""));
}
