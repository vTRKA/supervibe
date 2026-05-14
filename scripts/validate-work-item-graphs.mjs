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

export async function validateWorkItemGraphFiles({ rootDir = process.cwd(), files = [], requireSourcePlanSnapshot = false, scopeMode = "graph-strict" } = {}) {
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
    checked: results.length,
    scopeMode,
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      root: { type: "string" },
      file: { type: "string", short: "f" },
      all: { type: "boolean", default: false },
      strict: { type: "boolean", default: false },
      "scope-file": { type: "string" },
      "graph-id": { type: "string" },
      "scope-graph-id": { type: "string" },
      "fixture-dir": { type: "string" },
      "require-source-plan-snapshot": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(`Usage:
  node scripts/validate-work-item-graphs.mjs --file .supervibe/memory/work-items/<epic>/graph.json
  node scripts/validate-work-item-graphs.mjs --scope-file .supervibe/memory/work-items/<epic>/graph.json
  node scripts/validate-work-item-graphs.mjs --graph-id <epic-id>
  node scripts/validate-work-item-graphs.mjs --strict
  node scripts/validate-work-item-graphs.mjs --fixture-dir tests/fixtures/work-item-graphs
  node scripts/validate-work-item-graphs.mjs --file .supervibe/memory/work-items/<epic>/graph.json --require-source-plan-snapshot`);
    return;
  }

  const root = resolve(values.root || process.cwd());
  const scopeMode = resolveGraphScopeMode(values);
  let files = resolveScopedGraphFiles(values, root);
  if (files.length === 0) {
    files = values["fixture-dir"]
      ? await walkGraphs(resolve(root, values["fixture-dir"]))
      : await walkGraphs(join(root, ".supervibe", "memory", "work-items"));
  }
  const graphIds = splitCliList(values["graph-id"] || values["scope-graph-id"]);
  const discovered = files.length;
  if (graphIds.length > 0) {
    files = await filterGraphFilesById(files, graphIds);
  }

  if (files.length === 0) {
    console.log("SCOPE: " + scopeMode);
    console.log("CHECKED: 0");
    console.log("DISCOVERED: " + discovered);
    console.log("[validate-work-item-graphs] no work-item graph files found; skipping");
    return;
  }

  const report = await validateWorkItemGraphFiles({
    rootDir: root,
    files,
    requireSourcePlanSnapshot: Boolean(values["require-source-plan-snapshot"]),
    scopeMode,
  });
  console.log("SCOPE: " + report.scopeMode);
  console.log("CHECKED: " + report.checked);
  console.log("DISCOVERED: " + discovered);
  for (const result of report.results) {
    const rel = relative(root, result.file).split(sep).join("/");
    if (result.validation.valid) {
      console.log(`OK   work-item-graph ${rel}`);
    } else {
      console.error(`FAIL work-item-graph ${rel}`);
      for (const issue of result.validation.issues) {
        console.error(`  - ${issue.code}: ${issue.message}`);
        const repairScope = formatRepairScope(issue.repairScope);
        if (repairScope) console.error("    repair-scope: " + repairScope);
        if (issue.missingProducerProofFields?.length) console.error("    missing-proof-fields: " + issue.missingProducerProofFields.join(","));
      }
    }
  }
  if (!report.pass) {
    console.error(`\n${report.results.filter((item) => !item.validation.valid).length}/${report.results.length} work-item graph artifact(s) failed`);
    process.exit(1);
  }
  console.log(`\nAll ${report.results.length} work-item graph artifact(s) passed`);
}


function resolveGraphScopeMode(values = {}) {
  if (values.strict || values.all) return "graph-strict";
  if (values.file || values["scope-file"] || values["fixture-dir"] || values["graph-id"] || values["scope-graph-id"]) return "graph-scoped";
  return "graph-strict";
}

function resolveScopedGraphFiles(values = {}, root = process.cwd()) {
  const rawFiles = splitCliList(values["scope-file"] || values.file || "");
  return rawFiles.map((file) => resolve(root, file));
}

function splitCliList(value = "") {
  return String(value || "")
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function filterGraphFilesById(files = [], graphIds = []) {
  const wanted = new Set(graphIds.map((id) => String(id).toLowerCase()));
  const matched = [];
  for (const file of files) {
    try {
      const graph = JSON.parse(await readFile(file, "utf8"));
      const ids = [graph.epicId, graph.graph_id, graph.id].map((id) => String(id || "").toLowerCase()).filter(Boolean);
      if (ids.some((id) => wanted.has(id))) matched.push(file);
    } catch {
      // Invalid JSON is left to the normal validator when directly scoped by file.
    }
  }
  return matched;
}

function formatRepairScope(scope = null) {
  if (!scope) return "";
  return [
    ["command", scope.command],
    ["stage", scope.stage],
    ["graphId", scope.graphId],
    ["handoffId", scope.handoffId],
    ["outputArtifact", scope.outputArtifact],
    ["subjectIds", Array.isArray(scope.subjectIds) ? scope.subjectIds.join(",") : scope.subjectIds],
  ]
    .filter(([, value]) => value)
    .map(([key, value]) => key + "=" + value)
    .join(" ");
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
