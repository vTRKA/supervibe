#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildAgentSystemMaturityReport,
  formatAgentSystemMaturityReport,
} from "./lib/agent-system-maturity.mjs";

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

function usage() {
  return [
    "SUPERVIBE_AGENT_MATURITY_HELP",
    "USAGE:",
    "  node scripts/supervibe-agent-maturity.mjs [--root .] [--json] [--min-agent-invocations 10] [--min-host-agent-receipts 1]",
    "",
    "Checks global agent-system maturity: command orchestration, specialist questions, continuation gates, receipts, host telemetry, Code Graph readiness, strict retrieval telemetry, eval coverage, and backlog/docs.",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  if (options.help || options.h) {
    console.log(usage());
    process.exit(0);
  }
  const rootDir = resolve(options.root || process.cwd());
  const report = await buildAgentSystemMaturityReport(rootDir, {
    minAgentInvocations: options["min-agent-invocations"],
    minHostAgentReceipts: options["min-host-agent-receipts"],
  });
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatAgentSystemMaturityReport(report));
  }
  process.exit(report.pass ? 0 : 1);
}
