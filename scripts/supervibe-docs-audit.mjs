#!/usr/bin/env node

import { auditDocsRelevance, formatDocsAuditReport } from "./lib/supervibe-docs-audit.mjs";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log([
    "SUPERVIBE_DOCS_AUDIT_HELP",
    "Usage:",
    "  npm run supervibe:docs-audit",
    "  npm run supervibe:docs-audit -- --json",
    "",
    "Scans docs/ for stale markers and separates real deletion candidates from intentional templates/internal specs/fixtures.",
  ].join("\n"));
  process.exit(0);
}

const report = await auditDocsRelevance({
  rootDir: args.root || process.cwd(),
  docsDir: args.docs || "docs",
});

if (args.json) console.log(JSON.stringify(report, null, 2));
else console.log(formatDocsAuditReport(report));
if (!report.pass) process.exitCode = 1;

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg.startsWith("--")) {
      const key = arg.replace(/^--/, "");
      parsed[key] = argv[i + 1]?.startsWith("--") ? true : argv[++i];
    }
  }
  return parsed;
}
