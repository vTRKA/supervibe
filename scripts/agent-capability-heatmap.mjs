#!/usr/bin/env node
import {
  buildAgentCapabilityHeatmap,
  formatCapabilityHeatmapMarkdown,
} from "./lib/supervibe-agent-empirical-hardening.mjs";

const args = new Set(process.argv.slice(2));

if (args.has("--help") || args.has("-h")) {
  console.log([
    "Usage: node scripts/agent-capability-heatmap.mjs [--json]",
    "",
    "Reports prompt/static agent capability from frontmatter, skills/tools, body contracts, and freshness.",
    "It does not prove active runtime execution, workflow receipts, Code RAG/CodeGraph readiness, or release maturity.",
  ].join("\n"));
  process.exit(0);
}

const rows = buildAgentCapabilityHeatmap({ rootDir: process.cwd() });

const metadata = {
  assessmentScope: "prompt-static-capability",
  evidenceBasis: "agent-frontmatter-body-contracts",
  runtimeProofStatus: "not-assessed",
  runtimeMaturity: "separate-runtime-receipt-and-workflow-gates",
};

if (args.has("--json")) {
  console.log(JSON.stringify({ schemaVersion: 1, ...metadata, rows }, null, 2));
} else {
  process.stdout.write(formatCapabilityHeatmapMarkdown(rows));
}
