#!/usr/bin/env node

import {
  buildAgentRetrievalTelemetryReportFromProject,
  formatAgentRetrievalTelemetryReport,
  writeStrengtheningTasks,
} from "./lib/supervibe-agent-retrieval-telemetry.mjs";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log([
    "SUPERVIBE_AGENT_RETRIEVAL_HEALTH_HELP",
    "Usage:",
    "  npm run supervibe:agent-retrieval-health",
    "  npm run supervibe:agent-retrieval-health -- --write-strengthening-tasks",
    "  npm run supervibe:agent-retrieval-health -- --strict",
  ].join("\n"));
  process.exit(0);
}

try {
  const rootDir = args.root || process.cwd();
  const report = await buildAgentRetrievalTelemetryReportFromProject({
    rootDir,
    limit: args.limit || 1000,
    window: args.window || 20,
  });
  let writeResult = null;
  if (args["write-strengthening-tasks"]) {
    writeResult = await writeStrengtheningTasks(report, { rootDir });
  }
  if (args.json) console.log(JSON.stringify({ ...report, writeResult }, null, 2));
  else {
    console.log(formatAgentRetrievalTelemetryReport(report));
    if (writeResult) console.log(`OUT: ${writeResult.outPath}\nTASKS_WRITTEN: ${writeResult.count}`);
  }
  if (args.strict && !report.pass) process.exitCode = 2;
} catch (error) {
  console.error(`SUPERVIBE_AGENT_RETRIEVAL_HEALTH_ERROR: ${error.message}`);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--strict") parsed.strict = true;
    else if (arg === "--write-strengthening-tasks") parsed["write-strengthening-tasks"] = true;
    else if (arg.startsWith("--")) {
      const key = arg.replace(/^--/, "");
      if (key.includes("=")) {
        const [name, value] = key.split(/=(.*)/s);
        parsed[name] = value;
      } else {
        parsed[key] = argv[i + 1]?.startsWith("--") ? true : argv[++i];
      }
    }
  }
  return parsed;
}
