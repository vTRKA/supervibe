#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildAgentSystemMaturityReport,
  formatAgentSystemMaturityReport,
} from "./lib/agent-system-maturity.mjs";
import { runRetrievalGoldenEval } from "./lib/supervibe-retrieval-golden-eval.mjs";
import { applyGoldenRetrievalMaturityGate } from "./lib/supervibe-codegraph-ui-map.mjs";

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
    "SUPERVIBE_AGENT_MATURITY_HELP",
    "USAGE:",
    "  node scripts/supervibe-agent-maturity.mjs [--root .] [--json] [--min-agent-invocations 10] [--min-host-agent-receipts 1] [--retrieval-golden-case-file <path>]",
    "  node scripts/supervibe-agent-maturity.mjs --active-command /supervibe-design --host codex --slug <slug> --handoff-id <id> [--plugin-root <path>]",
    "  node scripts/supervibe-agent-maturity.mjs --runtime-10of10-proof [--skip-release-check]",
    "",
    "Checks global agent-system maturity: command orchestration, specialist questions, continuation gates, receipts, host telemetry, Code Graph readiness, strict retrieval telemetry, eval coverage, and backlog/docs.",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  if (options.help || options.h) {
    console.log(usage());
    process.exit(0);
  }
  const rootDir = resolve(options.root || process.cwd());
  const baseReport = await buildAgentSystemMaturityReport(rootDir, {
    minAgentInvocations: options["min-agent-invocations"],
    minHostAgentReceipts: options["min-host-agent-receipts"],
    activeCommand: options["active-command"] || (options.active ? options.command : null),
    host: options.host || null,
    slug: options.slug || null,
    handoffId: options["handoff-id"] || options.handoffId || null,
    workflowRunId: options["workflow-run-id"] || options.workflowRunId || null,
    pluginRoot: resolve(options["plugin-root"] || options.pluginRoot || fileURLToPath(new URL("../", import.meta.url))),
    requireRuntimeState: options["runtime-10of10-proof"] === true || options["require-runtime-state"] === true,
    runtimeTenOfTenProof: options["runtime-10of10-proof"] === true,
  });
  let goldenReport;
  try {
    goldenReport = await runRetrievalGoldenEval({
      rootDir,
      caseFile: options["retrieval-golden-case-file"] || options["case-file"] || "tests/fixtures/retrieval-golden/agent-system-current.json",
      now: options.now || new Date().toISOString(),
    });
  } catch (error) {
    goldenReport = {
      pass: false,
      summary: { total: 0, failed: 1 },
      error: error.message,
    };
  }
  const report = applyGoldenRetrievalMaturityGate(baseReport, goldenReport);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatAgentSystemMaturityReport(report));
    if (options["runtime-10of10-proof"]) {
      console.log(formatRuntimeTenOfTenProofGate(report, {
        skipReleaseCheck: options["skip-release-check"] === true,
      }));
    }
  }
  process.exit(report.pass ? 0 : 1);
}

export function formatRuntimeTenOfTenProofGate(report = {}, { skipReleaseCheck = false } = {}) {
  const pass = report.pass === true;
  const blockers = Array.isArray(report.blockers) && report.blockers.length
    ? report.blockers.map((blocker) => `${blocker.id}:${blocker.nextAction || blocker.evidence || "blocked"}`)
    : Array.isArray(report.issues)
      ? report.issues.map((issue) => issue.code || issue.message || String(issue)).filter(Boolean)
      : [];
  return [
    "SUPERVIBE_RUNTIME_10_OF_10_PROOF",
    `STRICT_10_OF_10_READY: ${pass}`,
    "REFUSES_10_OF_10_WHEN_MISSING: true",
    "REQUIRED_EVIDENCE: user-gates,ui,memory,rag,codegraph,loop-scheduler,provider-config,provider-power-preset,plan-lifecycle,receipt-bridge,command-agent-readiness,maturity",
    `RELEASE_CHECK_REQUIRED: ${skipReleaseCheck ? "deferred-to-release-gate" : "true"}`,
    "RELEASE_CHECK_COMMAND: npm run check:release",
    `OPEN_BLOCKERS: ${blockers.length ? blockers.join(",") : "none"}`,
  ].join("\n");
}
