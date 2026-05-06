#!/usr/bin/env node

import {
  buildAgentTechReadinessReport,
  formatAgentTechReadinessReport,
} from "./lib/supervibe-agent-tech-readiness.mjs";

const args = parseArgs(process.argv.slice(2));
const report = await buildAgentTechReadinessReport({
  rootDir: args.root || process.cwd(),
  repoMapMaxFiles: Number(args["repo-map-max-files"] || 120),
  now: args.now || new Date().toISOString(),
});

if (args.json) console.log(JSON.stringify(report, null, 2));
else console.log(formatAgentTechReadinessReport(report));
if (!report.pass) process.exitCode = 1;

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") parsed.json = true;
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
