#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { buildContextPack } from "./lib/supervibe-context-pack.mjs";
import { buildOrchestratedContextPackFromProject, formatContextSourceDiagnostics } from "./lib/supervibe-context-orchestrator.mjs";
import { buildUserOutcomeReportFromContextPack, formatUserOutcomeReport } from "./lib/supervibe-user-outcome-metrics.mjs";
import { buildPerformanceSloReport, formatPerformanceSloReport } from "./lib/supervibe-performance-slo.mjs";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log([
    "SUPERVIBE_CONTEXT_PACK_HELP",
    "Usage:",
    "  npm run supervibe:context-pack -- --file .claude/memory/work-items/<epic>/graph.json",
    "  npm run supervibe:context-pack -- --file graph.json --item T1 --out context.md",
    "  npm run supervibe:context-pack -- --file graph.json --json",
    "  npm run supervibe:context-pack -- --file graph.json --max-chars 12000",
  ].join("\n"));
  process.exit(0);
}

try {
  const pack = args.file ? await buildContextPack({
    rootDir: args.root || process.cwd(),
    graphPath: args.file,
    itemId: args.item || args["item-id"],
    query: args.query || "",
    memoryLimit: args["memory-limit"] || 6,
    evidenceLimit: args["evidence-limit"] || 8,
    maxChars: args["max-chars"] || 12_000,
    now: args.now || new Date().toISOString(),
  }) : await buildOrchestratedContextPackFromProject({
    rootDir: args.root || process.cwd(),
    query: args.query || "",
    maxTokens: args["max-tokens"] || 4000,
  });
  if (args.out) {
    await writeFile(args.out, pack.markdown || JSON.stringify(pack, null, 2), "utf8");
    console.log(`SUPERVIBE_CONTEXT_PACK\nOUT: ${args.out}\nTOKENS: ${pack.summary?.estimatedTokens ?? pack.tokenBudget?.estimatedTokens ?? 0}`);
  } else if (args.json) {
    console.log(JSON.stringify(pack, null, 2));
  } else if (args.explain) {
    const outcome = buildUserOutcomeReportFromContextPack(pack);
    const performance = buildPerformanceSloReport({ rootDir: args.root || process.cwd(), measurements: { tokenBudgetMax: pack.tokenBudget?.maxTokens || pack.summary?.estimatedTokens || 0 } });
    console.log(pack.markdown || [
      formatContextSourceDiagnostics(pack),
      "",
      formatUserOutcomeReport(outcome),
      "",
      formatPerformanceSloReport(performance),
      "",
      JSON.stringify({ confidence: pack.confidence, tokenBudget: pack.tokenBudget, repoMapBudget: pack.repoMapBudget }, null, 2),
    ].join("\n"));
  } else {
    console.log(pack.markdown || JSON.stringify(pack, null, 2));
  }
} catch (err) {
  console.error(`SUPERVIBE_CONTEXT_PACK_ERROR: ${err.message}`);
  process.exitCode = 1;
}

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
