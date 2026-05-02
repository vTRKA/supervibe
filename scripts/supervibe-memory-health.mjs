#!/usr/bin/env node

import { buildMemoryHealthReport, formatMemoryHealthReport } from "./lib/supervibe-memory-health.mjs";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log([
    "SUPERVIBE_MEMORY_HEALTH_HELP",
    "Usage:",
    "  npm run supervibe:memory-health",
    "  npm run supervibe:memory-health -- --json",
    "  npm run supervibe:memory-health -- --strict",
  ].join("\n"));
  process.exit(0);
}

try {
  const report = await buildMemoryHealthReport({
    rootDir: args.root || process.cwd(),
    now: args.now || new Date().toISOString(),
    contextPackMaxTokens: args["context-pack-max-tokens"] || 3000,
  });
  console.log(args.json ? JSON.stringify(report, null, 2) : formatMemoryHealthReport(report));
  if (args.strict && !report.pass) process.exitCode = 2;
} catch (error) {
  console.error(`SUPERVIBE_MEMORY_HEALTH_ERROR: ${error.message}`);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--strict") parsed.strict = true;
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
