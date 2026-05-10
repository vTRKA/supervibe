#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildTaskGraphMaturityReport,
  formatTaskGraphMaturityReport,
} from "./lib/supervibe-task-graph-maturity.mjs";

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
    "SUPERVIBE_TASK_GRAPH_MATURITY_HELP",
    "USAGE:",
    "  node scripts/supervibe-task-graph-maturity.mjs [--root .] [--json] [--require-active-graph]",
    "",
    "Checks task graph integration maturity across routing, loop actions, UI controls, tracker sync, validators, tests, fixtures, and optional current graph coverage.",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  if (options.help || options.h) {
    console.log(usage());
    process.exit(0);
  }
  const rootDir = resolve(options.root || process.cwd());
  const report = buildTaskGraphMaturityReport(rootDir, {
    requireActiveGraph: Boolean(options["require-active-graph"]),
  });
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatTaskGraphMaturityReport(report));
  }
  process.exit(report.pass ? 0 : 1);
}
