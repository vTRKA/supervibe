#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { parseArgs } from "node:util";

import {
  formatEpicCompletionReport,
  validateEpicCompletion,
} from "./lib/supervibe-epic-completion-validator.mjs";

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
  requireEpicClosed = true,
  requireFollowups = false,
} = {}) {
  const results = [];
  for (const file of files) {
    const graph = JSON.parse(String(await readFile(file, "utf8")).replace(/^\uFEFF/, ""));
    const report = validateEpicCompletion(graph, {
      production,
      requireEvidence,
      allowSkipped,
      allowDryRunEvidence,
      requireEpicClosed,
      requireFollowups,
    });
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
      "allow-open-epic": { type: "boolean", default: false },
      "allow-skipped": { type: "boolean", default: true },
      "no-evidence-required": { type: "boolean", default: false },
      "require-followups": { type: "boolean", default: false },
      "non-production": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(`Usage:
  node scripts/validate-epic-completion.mjs --file .supervibe/memory/work-items/<epic>/graph.json
  node scripts/validate-epic-completion.mjs --all
  node scripts/validate-epic-completion.mjs --fixture-dir tests/fixtures/completed-work-item-graphs

Completion validation is stricter than graph-shape validation: required tasks must be terminal,
dependencies must be terminal, the epic must be closed, and production completion needs non-dry-run evidence.`);
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
    console.log("[validate-epic-completion] no work-item graph files found; skipping");
    return;
  }

  const report = await validateEpicCompletionFiles({
    rootDir: root,
    files,
    production: !values["non-production"],
    requireEvidence: !values["no-evidence-required"],
    allowSkipped: values["allow-skipped"] !== false,
    allowDryRunEvidence: values["allow-dry-run-evidence"],
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

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`;
if (isMain || process.argv[1]?.endsWith("validate-epic-completion.mjs")) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
