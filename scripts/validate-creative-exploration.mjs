#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateCreativeExplorationFile,
} from "./lib/creative-exploration-contract.mjs";

export function formatCreativeExplorationReport(result = {}) {
  const lines = [
    "SUPERVIBE_CREATIVE_EXPLORATION",
    `PASS: ${result.pass === true}`,
    `STATUS: ${result.status || "checked"}`,
    `FILE: ${result.file || "none"}`,
    `GATE_STATUS: ${result.gateStatus || "unknown"}`,
    `CHECKED_DIRECTIONS: ${result.checkedDirections || 0}`,
    `PROTOTYPE_ARTIFACTS: ${result.prototypeArtifacts || 0}`,
    `ISSUES: ${(result.issues || []).length}`,
  ];
  for (const item of result.issues || []) {
    lines.push(`ISSUE: ${item.code} ${item.file} - ${item.message}`);
  }
  return lines.join("\n");
}

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  const rootDir = resolve(options.root || process.cwd());
  const result = validateCreativeExplorationFile(rootDir, options.file);
  console.log(formatCreativeExplorationReport(result));
  process.exit(result.pass ? 0 : 1);
}
