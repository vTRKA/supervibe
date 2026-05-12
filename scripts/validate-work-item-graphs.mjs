#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

import { validateWorkItemGraph } from "./lib/supervibe-plan-to-work-items.mjs";
import { validateEpicAgentContract } from "./lib/supervibe-epic-agent-contract.mjs";

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

export async function validateWorkItemGraphFiles({ rootDir = process.cwd(), files = [], requireSourcePlanSnapshot = false } = {}) {
  const results = [];
  for (const file of files) {
    const graph = JSON.parse(await readFile(file, "utf8"));
    let validation = validateWorkItemGraph(graph);
    const epicAgentContract = validateEpicAgentContract({ rootDir, graph, graphPath: file });
    if (!epicAgentContract.pass) {
      validation = {
        ...validation,
        valid: false,
        issues: [...validation.issues, ...epicAgentContract.issues],
      };
    }
    if (requireSourcePlanSnapshot) {
      const sourceIssues = await validateSourcePlanSnapshot({ graph, graphPath: file });
      if (sourceIssues.length > 0) {
        validation = {
          ...validation,
          valid: false,
          issues: [...validation.issues, ...sourceIssues],
        };
      }
    }
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
      "require-source-plan-snapshot": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(`Usage:
  node scripts/validate-work-item-graphs.mjs --file .supervibe/memory/work-items/<epic>/graph.json
  node scripts/validate-work-item-graphs.mjs --all
  node scripts/validate-work-item-graphs.mjs --fixture-dir tests/fixtures/work-item-graphs
  node scripts/validate-work-item-graphs.mjs --file .supervibe/memory/work-items/<epic>/graph.json --require-source-plan-snapshot`);
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

  const report = await validateWorkItemGraphFiles({
    rootDir: root,
    files,
    requireSourcePlanSnapshot: Boolean(values["require-source-plan-snapshot"]),
  });
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

async function validateSourcePlanSnapshot({ graph = {}, graphPath }) {
  const issues = [];
  const snapshot = graph.metadata?.sourcePlanSnapshot || {};
  const storedPath = snapshot.storedPath || graph.source?.snapshotPath;
  const expectedHash = snapshot.sha256 || graph.source?.sha256;
  if (!storedPath || !expectedHash) {
    issues.push(issue("missing-source-plan-snapshot", graph.epicId || graph.graph_id, "Graph is missing source plan snapshot metadata."));
    return issues;
  }

  const snapshotPath = resolve(dirname(graphPath), storedPath);
  if (!existsSync(snapshotPath)) {
    issues.push(issue("missing-source-plan-snapshot-file", graph.epicId || graph.graph_id, `Source plan snapshot file is missing: ${relative(process.cwd(), snapshotPath).split(sep).join("/")}`));
    return issues;
  }

  const content = await readFile(snapshotPath, "utf8");
  const actualHash = createHash("sha256").update(content).digest("hex");
  if (actualHash !== expectedHash) {
    issues.push(issue("source-plan-snapshot-hash-mismatch", graph.epicId || graph.graph_id, "Source plan snapshot hash does not match graph metadata.", {
      expectedHash,
      actualHash,
    }));
  }
  return issues;
}

function issue(code, itemId, message, extra = {}) {
  return { code, itemId: itemId || null, message, ...extra };
}

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`;
if (isMain || process.argv[1]?.endsWith("validate-work-item-graphs.mjs")) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
