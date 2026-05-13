#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildStrictReleaseGateReport,
  formatStrictReleaseGateReport,
} from "./lib/supervibe-strict-release-gate.mjs";

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
    "SUPERVIBE_STRICT_RELEASE_GATE_HELP",
    "USAGE:",
    "  node scripts/validate-strict-release-gate.mjs [--root .] [--json] [--global-capability|--require-active-proof]",
    "",
    "Checks release readiness across active workflow proof, strict plan/review, trusted epic completion, task graph runtime maturity, design workflow report, token strictness, and .supervibe GC strictness.",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  if (options.help || options.h) {
    console.log(usage());
    process.exit(0);
  }

  const report = await buildStrictReleaseGateReport(resolve(options.root || process.cwd()), {
    requireActiveProof: options["global-capability"] === true
      ? false
      : options["require-active-proof"] === true
        ? true
        : undefined,
    workflowRunId: options["workflow-run"] || options.run || null,
  });
  console.log(options.json ? JSON.stringify(report, null, 2) : formatStrictReleaseGateReport(report));
  process.exit(report.pass ? 0 : 1);
}
