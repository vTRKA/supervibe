#!/usr/bin/env node

import { formatRetrievalGoldenEvalReport, runRetrievalGoldenEval } from "./lib/supervibe-retrieval-golden-eval.mjs";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log([
    "SUPERVIBE_RETRIEVAL_EVAL_HELP",
    "Usage:",
    "  npm run supervibe:retrieval-eval -- --case-file tests/fixtures/retrieval-golden/cases.json",
    "  npm run supervibe:retrieval-eval -- --case-file cases.json --json",
    "",
    "Cases assert expected memory IDs, RAG paths, CodeGraph symbols, retrieval stages, and token budget.",
  ].join("\n"));
  process.exit(0);
}

try {
  const report = await runRetrievalGoldenEval({
    rootDir: args.root || process.cwd(),
    caseFile: args["case-file"] || args.file,
    out: args.out,
    now: args.now || new Date().toISOString(),
  });
  console.log(args.json ? JSON.stringify(report, null, 2) : formatRetrievalGoldenEvalReport(report));
  if (!report.pass && report.summary.total > 0) process.exitCode = 1;
} catch (error) {
  console.error(`SUPERVIBE_RETRIEVAL_EVAL_ERROR: ${error.message}`);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--json") parsed.json = true;
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
