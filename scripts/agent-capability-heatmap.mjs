#!/usr/bin/env node
import {
  buildAgentCapabilityHeatmap,
  formatCapabilityHeatmapMarkdown,
} from "./lib/supervibe-agent-empirical-hardening.mjs";

const args = new Set(process.argv.slice(2));
const rows = buildAgentCapabilityHeatmap({ rootDir: process.cwd() });

if (args.has("--json")) {
  console.log(JSON.stringify({ schemaVersion: 1, rows }, null, 2));
} else {
  process.stdout.write(formatCapabilityHeatmapMarkdown(rows));
}
