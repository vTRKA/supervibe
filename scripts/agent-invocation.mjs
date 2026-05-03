#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  logInvocation,
  setInvocationLogPath,
} from "./lib/agent-invocation-logger.mjs";

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
    "  node scripts/agent-invocation.mjs log --agent <agent-id> --host codex --host-invocation-id <runtime-id> --task <summary> --confidence <0-10>",
    "",
    "NOTES:",
    "  This records a real host agent invocation id in .supervibe/memory/agent-invocations.jsonl.",
    "  Use the same id in workflow receipts as --host-invocation-id with the matching --host-invocation-source.",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
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
    });

    console.log("SUPERVIBE_AGENT_INVOCATION_LOGGED");
    console.log(`AGENT: ${record.agent_id}`);
    console.log(`HOST: ${host}`);
    console.log(`HOST_SOURCE: ${source}`);
    console.log(`INVOCATION_ID: ${record.invocation_id}`);
    console.log("EVIDENCE: .supervibe/memory/agent-invocations.jsonl");
    process.exit(0);
  } catch (error) {
    console.error("SUPERVIBE_AGENT_INVOCATION_ERROR");
    console.error(`ERROR: ${error.message}`);
    process.exit(2);
  }
}
