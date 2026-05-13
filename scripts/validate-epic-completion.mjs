#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { parseArgs } from "node:util";

import {
  formatEpicCompletionReport,
  validateEpicCompletion,
} from "./lib/supervibe-epic-completion-validator.mjs";
import {
  readWorkflowReceipts,
  validateWorkflowReceiptTrust,
} from "./lib/supervibe-workflow-receipt-runtime.mjs";
import {
  defaultWorkItemRegistryPath,
  readWorkItemRegistry,
} from "./lib/supervibe-work-item-registry.mjs";

async function walkGraphs(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walkGraphs(path));
    else if (entry.name === "graph.json" || entry.name.endsWith(".work-item-graph.json")) out.push(path);
  }
  return out;
}

export async function validateEpicCompletionFiles({
  rootDir = process.cwd(),
  files = [],
  production = true,
  requireEvidence = true,
  allowSkipped = true,
  allowDryRunEvidence = false,
  requireTrustedEvidence = false,
  trustedReceiptIds = [],
  trustedGraphReceiptIdsByGraphId = {},
  activePreCloseGraphIds = [],
  disallowLegacyEvidence = false,
  allowLegacyEvidence = false,
  requireEpicClosed = true,
  requireFollowups = false,
} = {}) {
  const results = [];
  const preCloseGraphIds = new Set((activePreCloseGraphIds || []).map(String).filter(Boolean));
  for (const file of files) {
    const graph = JSON.parse(String(await readFile(file, "utf8")).replace(/^\uFEFF/, ""));
    const graphId = graph.epicId || graph.graph_id || graph.items?.find?.((item) => item.type === "epic")?.itemId || null;
    const trustedGraphReceiptIds = graphId ? trustedGraphReceiptIdsByGraphId[graphId] || [] : [];
    const allowActivePreClose = Boolean(
      requireEpicClosed
        && graphId
        && preCloseGraphIds.has(String(graphId))
        && trustedGraphReceiptIds.length > 0,
    );
    const report = validateEpicCompletion(graph, {
      production,
      requireEvidence,
      allowSkipped,
      allowDryRunEvidence,
      requireTrustedEvidence,
      trustedReceiptIds,
      trustedGraphReceiptIds,
      disallowLegacyEvidence,
      allowLegacyEvidence,
      requireEpicClosed: requireEpicClosed && !allowActivePreClose,
      requireFollowups,
    });
    if (allowActivePreClose) {
      report.warnings.push({
        code: "active-preclose-epic",
        itemId: graphId,
        message: "Active epic is allowed to remain open during final release pre-close because a trusted graph-level completion receipt exists.",
      });
    }
    results.push({ file, report });
  }
  return {
    pass: results.every((result) => result.report.pass),
    results,
    rootDir,
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: "string", short: "f" },
      all: { type: "boolean", default: false },
      "fixture-dir": { type: "string" },
      "allow-dry-run-evidence": { type: "boolean", default: false },
      "require-trusted-evidence": { type: "boolean", default: false },
      "trusted-receipts": { type: "string" },
      "disallow-legacy-evidence": { type: "boolean", default: false },
      "allow-legacy-evidence": { type: "boolean", default: false },
      "allow-open-epic": { type: "boolean", default: false },
      "allow-active-preclose": { type: "boolean", default: false },
      "allow-skipped": { type: "boolean", default: true },
      "no-evidence-required": { type: "boolean", default: false },
      "require-followups": { type: "boolean", default: false },
      "non-production": { type: "boolean", default: false },
      "strict-coverage": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(`Usage:
  node scripts/validate-epic-completion.mjs --file .supervibe/memory/work-items/<epic>/graph.json
  node scripts/validate-epic-completion.mjs --all
  node scripts/validate-epic-completion.mjs --fixture-dir tests/fixtures/completed-work-item-graphs

Completion validation is stricter than graph-shape validation: required tasks must be terminal,
dependencies must be terminal, the epic must be closed, and production completion needs non-dry-run evidence.

Trusted mode:
  --require-trusted-evidence requires structured evidence to cite a runtime-issued trusted workflow receipt.
  --trusted-receipts <id,id> narrows accepted receipts to the listed trusted runtime receipts.
  --disallow-legacy-evidence rejects migrated legacy graph evidence unless --allow-legacy-evidence is also set.
  --allow-active-preclose allows the active registry epic to remain open only when a trusted graph-level completion receipt exists.`);
    return;
  }

  const root = process.cwd();
  const files = values.file
    ? [values.file]
    : values["fixture-dir"]
      ? await walkGraphs(join(root, values["fixture-dir"]))
      : values.all
        ? await walkGraphs(join(root, ".supervibe", "memory", "work-items"))
        : [];

  if (files.length === 0) {
    console.log("SUPERVIBE_EPIC_COMPLETION_COVERAGE");
    console.log("STATUS: no work-item graph files found");
    console.log("NO_COVERAGE: true");
    console.log(`PASS: ${values["strict-coverage"] ? "false" : "neutral"}`);
    console.log("NEXT_ACTION: atomize a reviewed plan before production completion validation");
    if (values["strict-coverage"]) process.exit(1);
    return;
  }

  const trustedReceiptIds = trustedReceiptIdsForValidation(root, {
    explicitReceiptIds: splitCsv(values["trusted-receipts"]),
  });
  const trustedGraphReceiptIdsByGraphId = trustedGraphReceiptIdsByGraphForValidation(root, {
    explicitReceiptIds: splitCsv(values["trusted-receipts"]),
  });
  const activePreCloseGraphIds = await activePreCloseGraphIdsForValidation(root, {
    enabled: Boolean(values["allow-active-preclose"]),
  });

  const report = await validateEpicCompletionFiles({
    rootDir: root,
    files,
    production: !values["non-production"],
    requireEvidence: !values["no-evidence-required"],
    allowSkipped: values["allow-skipped"] !== false,
    allowDryRunEvidence: values["allow-dry-run-evidence"],
    requireTrustedEvidence: values["require-trusted-evidence"],
    trustedReceiptIds,
    trustedGraphReceiptIdsByGraphId,
    activePreCloseGraphIds,
    disallowLegacyEvidence: values["disallow-legacy-evidence"],
    allowLegacyEvidence: values["allow-legacy-evidence"],
    requireEpicClosed: !values["allow-open-epic"],
    requireFollowups: values["require-followups"],
  });

  for (const result of report.results) {
    const rel = relative(root, result.file).split(sep).join("/");
    console.log(`FILE: ${rel}`);
    console.log(formatEpicCompletionReport(result.report));
  }
  if (!report.pass) {
    console.error(`\n${report.results.filter((item) => !item.report.pass).length}/${report.results.length} epic completion artifact(s) failed`);
    process.exit(1);
  }
  console.log(`\nAll ${report.results.length} epic completion artifact(s) passed`);
}

async function activePreCloseGraphIdsForValidation(rootDir, { enabled = false } = {}) {
  if (!enabled) return [];
  const registry = await readWorkItemRegistry(defaultWorkItemRegistryPath(rootDir));
  return [
    registry.activeEpicId,
    registry.epics?.[registry.activeEpicId]?.epicId,
    registry.epics?.[registry.activeEpicId]?.graphId,
  ].map(String).filter((value) => value && value !== "undefined" && value !== "null");
}

function trustedGraphReceiptIdsByGraphForValidation(rootDir, { explicitReceiptIds = [] } = {}) {
  const explicit = new Set((explicitReceiptIds || []).map(String).filter(Boolean));
  const out = {};
  for (const receipt of readWorkflowReceipts(rootDir)) {
    if (!receipt?.receiptId) continue;
    if (explicit.size > 0 && !explicit.has(String(receipt.receiptId))) continue;
    const graphId = receipt.graphId || receipt.workItemBinding?.graphId || null;
    if (!graphId) continue;
    const taskId = receipt.taskId || receipt.workItemId || receipt.graphTaskId || receipt.workItemBinding?.taskId || null;
    if (taskId) continue;
    const trust = validateWorkflowReceiptTrust(rootDir, receipt);
    if (!trust.pass) continue;
    if (!out[graphId]) out[graphId] = [];
    out[graphId].push(String(receipt.receiptId));
  }
  return out;
}

function trustedReceiptIdsForValidation(rootDir, { explicitReceiptIds = [] } = {}) {
  const explicit = new Set((explicitReceiptIds || []).map(String).filter(Boolean));
  const trusted = [];
  for (const receipt of readWorkflowReceipts(rootDir)) {
    if (!receipt?.receiptId) continue;
    if (explicit.size > 0 && !explicit.has(String(receipt.receiptId))) continue;
    const trust = validateWorkflowReceiptTrust(rootDir, receipt);
    if (trust.pass) trusted.push(String(receipt.receiptId));
  }
  return trusted;
}

function splitCsv(value = "") {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`;
if (isMain || process.argv[1]?.endsWith("validate-epic-completion.mjs")) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
