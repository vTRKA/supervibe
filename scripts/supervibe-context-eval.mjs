#!/usr/bin/env node

import { runContextPackEval, formatContextEvalReport } from "./lib/supervibe-context-eval.mjs";
import { evaluateRetrievalPipelineCalibration, formatRetrievalPipelineReport } from "./lib/supervibe-retrieval-pipeline.mjs";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log([
    "SUPERVIBE_CONTEXT_EVAL_HELP",
    "Usage:",
    "  npm run supervibe:context-eval -- --case-file .supervibe/evals/context-pack/cases.json",
    "  npm run supervibe:context-eval -- --case-file cases.json --out latest-report.json",
    "",
    "Cases assert required memory IDs, evidence snippets, semantic anchors, and token budgets.",
  ].join("\n"));
  process.exit(0);
}

const report = await runContextPackEval({
  rootDir: args.root || process.cwd(),
  caseFile: args["case-file"] || args.file,
  out: args.out,
  now: args.now || new Date().toISOString(),
});

if (args.json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(formatContextEvalReport(report));
  if (args.explain && args["case-file"]) {
    const cases = JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile(args["case-file"], "utf8")));
    console.log("");
    console.log(formatRetrievalPipelineReport(evaluateRetrievalPipelineCalibration(Array.isArray(cases) ? cases : cases.cases || [])));
  }
}
if (!report.pass) process.exitCode = report.summary.total === 0 ? 0 : 1;

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--explain") parsed.explain = true;
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
