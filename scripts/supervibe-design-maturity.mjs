#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildDesignAgentMaturityReport,
  formatDesignAgentMaturityReport,
} from "./lib/design-agent-maturity.mjs";

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
    "SUPERVIBE_DESIGN_AGENT_MATURITY_HELP",
    "USAGE:",
    "  node scripts/supervibe-design-maturity.mjs [--root .] [--json]",
    "",
    "Checks design-agent maturity across design-system ownership, local design intelligence, workflow gates, creative/trend coverage, component-library bridges, design memory writeback, and release regression coverage.",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  if (options.help || options.h) {
    console.log(usage());
    process.exit(0);
  }

  const rootDir = resolve(options.root || process.cwd());
  const report = buildDesignAgentMaturityReport(rootDir);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatDesignAgentMaturityReport(report));
  }
  process.exit(report.pass ? 0 : 1);
}
