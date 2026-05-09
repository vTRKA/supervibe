#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { parseArgs } from "node:util";

import { validateWorkItemGraph } from "./lib/supervibe-plan-to-work-items.mjs";

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

export async function validateWorkItemGraphFiles({ rootDir = process.cwd(), files = [] } = {}) {
  const results = [];
  for (const file of files) {
    const graph = JSON.parse(await readFile(file, "utf8"));
    const validation = validateWorkItemGraph(graph);
    results.push({ file, validation });
  }
  return {
    pass: results.every((result) => result.validation.valid),
    results,
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: "string", short: "f" },
      all: { type: "boolean", default: false },
      "fixture-dir": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(`Usage:
  node scripts/validate-work-item-graphs.mjs --file .supervibe/memory/work-items/<epic>/graph.json
  node scripts/validate-work-item-graphs.mjs --all
  node scripts/validate-work-item-graphs.mjs --fixture-dir tests/fixtures/work-item-graphs`);
    return;
  }

  const root = process.cwd();
  const files = values.file
    ? [values.file]
    : values["fixture-dir"]
      ? await walkGraphs(join(root, values["fixture-dir"]))
      : await walkGraphs(join(root, ".supervibe", "memory", "work-items"));

  if (files.length === 0) {
    console.log("[validate-work-item-graphs] no work-item graph files found; skipping");
    return;
  }

  const report = await validateWorkItemGraphFiles({ rootDir: root, files });
  for (const result of report.results) {
    const rel = relative(root, result.file).split(sep).join("/");
    if (result.validation.valid) {
      console.log(`OK   work-item-graph ${rel}`);
    } else {
      console.error(`FAIL work-item-graph ${rel}`);
      for (const issue of result.validation.issues) console.error(`  - ${issue.code}: ${issue.message}`);
    }
  }
  if (!report.pass) {
    console.error(`\n${report.results.filter((item) => !item.validation.valid).length}/${report.results.length} work-item graph artifact(s) failed`);
    process.exit(1);
  }
  console.log(`\nAll ${report.results.length} work-item graph artifact(s) passed`);
}

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`;
if (isMain || process.argv[1]?.endsWith("validate-work-item-graphs.mjs")) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}

