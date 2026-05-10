#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import {
  validateSupervibeAgentRunRequest,
} from "./lib/supervibe-agent-run-contract.mjs";

export function formatSupervibeAgentRunReport(result = {}) {
  const lines = [
    "SUPERVIBE_AGENT_RUN_PREFLIGHT",
    `PASS: ${result.pass === true}`,
    `AGENT: ${result.agent || "none"}`,
    `HOST_INVOCATION_SOURCE: ${result.hostInvocationSource || "none"}`,
    `HOST_INVOCATION_ID: ${result.hostInvocationId || "none"}`,
    `RECEIPT: ${result.receipt || "none"}`,
    `ISSUES: ${(result.issues || []).length}`,
  ];
  for (const item of result.issues || []) {
    lines.push(`ISSUE: ${item.code} - ${item.message}`);
  }
  if (result.pass === true) {
    lines.push("NEXT: issue or validate the bound workflow receipt; do not replace this proof with prompt-role output.");
  }
  return lines.join("\n");
}

function parseArgs(argv = []) {
  const options = {};
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return options;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  if (options.help || options.h) {
    console.log([
      "SUPERVIBE_AGENT_RUN_HELP",
      "USAGE:",
      "  node scripts/supervibe-agent-run.mjs --agent creative-director --task <summary> --host-invocation-source codex-spawn-agent --host-invocation-id <runtime-id> --receipt <receipt.json>",
      "",
      "This preflight rejects prompt-role-only output before it can be counted as a real specialist invocation.",
    ].join("\n"));
    process.exit(0);
  }
  const result = validateSupervibeAgentRunRequest(options);
  console.log(formatSupervibeAgentRunReport(result));
  process.exit(result.pass ? 0 : 2);
}
