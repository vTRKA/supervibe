#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { parseArgs } from "node:util";

import {
  buildWorkflowSummaryContractMatrix,
  WORKFLOW_SUMMARY_FINAL_VALIDATION_COMMANDS,
  WORKFLOW_SUMMARY_REQUIRED_LAYERS,
  WORKFLOW_SUMMARY_STAGES,
  workflowSummaryIntentFromStage,
} from "./lib/workflow-summary-contract.mjs";
import { validateWorkflowSummaryArtifact } from "./lib/supervibe-post-stage-actions.mjs";

const DEFAULT_SUMMARY_ROOT = ".supervibe/artifacts/summaries";
const DEFAULT_FIXTURE_ROOT = "tests/fixtures/artifacts/workflow-summaries/valid";

const SOURCE_LAYER_FILES = Object.freeze({
  router: ["scripts/lib/supervibe-trigger-router.mjs"],
  "command-catalog": ["scripts/lib/supervibe-command-catalog.mjs"],
  "command-docs": {
    spec: ["commands/supervibe-brainstorm.md"],
    plan: ["commands/supervibe-plan.md"],
  },
  skills: {
    spec: ["skills/brainstorming/SKILL.md"],
    plan: ["skills/writing-plans/SKILL.md"],
  },
  schema: ["docs/templates/workflow-summary-artifact.schema.json"],
  formatter: ["scripts/lib/supervibe-post-stage-actions.mjs"],
  validator: ["scripts/validate-workflow-summary-artifacts.mjs"],
  tests: [
    "tests/supervibe-post-stage-actions.test.mjs",
    "tests/supervibe-commands-routing.test.mjs",
    "tests/supervibe-trigger-router.test.mjs",
  ],
});

let values = { json: false, "check-contract": true };
let rootDir = process.cwd();

async function runCli() {
  const parsed = parseArgs({
    options: {
      file: { type: "string", multiple: true },
      all: { type: "boolean", default: false },
      "fixture-dir": { type: "string" },
      json: { type: "boolean", default: false },
      "check-contract": { type: "boolean", default: true },
    },
  });
  values = parsed.values;
  rootDir = process.cwd();
  const targets = new Set(values.file || []);
  if (values.all) {
    for (const file of await collectJsonFiles(join(rootDir, DEFAULT_SUMMARY_ROOT))) {
      targets.add(relative(rootDir, file).replaceAll(sep, "/"));
    }
    for (const file of await collectJsonFiles(join(rootDir, values["fixture-dir"] || DEFAULT_FIXTURE_ROOT))) {
      targets.add(relative(rootDir, file).replaceAll(sep, "/"));
    }
  }
  await main([...targets]);
}

async function main(files) {
  const issues = [];
  if (values["check-contract"] !== false) issues.push(...validateContractMatrix());
  for (const file of files) {
    const path = join(rootDir, file);
    if (!existsSync(path)) {
      issues.push(issue(file, "WSA_FILE_MISSING", "summary artifact file does not exist"));
      continue;
    }
    let artifact;
    try {
      artifact = JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      issues.push(issue(file, "WSA_JSON_PARSE", error.message));
      continue;
    }
    for (const message of validateWorkflowSummaryArtifact(artifact)) {
      const code = String(message).includes(":") ? String(message).split(":", 1)[0] : "WSA_VALIDATION";
      issues.push(issue(file, code, message));
    }
  }
  if (values.json) {
    console.log(JSON.stringify({ ok: issues.length === 0, checked: files.length, issues }, null, 2));
  } else {
    console.log("SUPERVIBE_WORKFLOW_SUMMARY_ARTIFACTS");
    console.log(`CHECKED: ${files.length}`);
    console.log(`CONTRACT_STAGES: ${WORKFLOW_SUMMARY_STAGES.join(",")}`);
    console.log(`ISSUES: ${issues.length}`);
    for (const item of issues) console.log(`- ${item.file}: ${item.code}: ${item.message}`);
  }
  if (issues.length) process.exitCode = 1;
}

function validateContractMatrix() {
  const issues = [];
  const matrix = buildWorkflowSummaryContractMatrix();
  const stages = new Set(matrix.map((row) => row.stage));
  for (const stage of WORKFLOW_SUMMARY_STAGES) {
    if (!stages.has(stage)) issues.push(issue("workflow-summary-contract", "WSA_CONTRACT_STAGE_MISSING", `missing matrix row for ${stage}`));
  }
  for (const row of matrix) {
    for (const layer of WORKFLOW_SUMMARY_REQUIRED_LAYERS) {
      const hasLayer = layer === "router" ? Boolean(row.command)
        : layer === "command-catalog" ? Boolean(row.command)
        : layer === "command-docs" ? Boolean(row.command)
        : layer === "skills" ? Boolean(row.skill)
        : layer === "templates" || layer === "schema" ? Boolean(row.template)
        : layer === "formatter" || layer === "validator" || layer === "tests" ? true
        : layer === "receipts" ? Array.isArray(row.receiptCategories) && row.receiptCategories.length > 0
        : layer === "final-suite" ? WORKFLOW_SUMMARY_FINAL_VALIDATION_COMMANDS.length > 0
        : false;
      if (!hasLayer) issues.push(issue("workflow-summary-contract", "WSA_CONTRACT_LAYER_MISSING", `${row.stage} missing ${layer}`));
      issues.push(...validateSourceLayerEvidence(row, layer));
    }
  }
  return issues;
}

function validateSourceLayerEvidence(row, layer) {
  const files = sourceFilesForLayer(row, layer);
  if (!files.length) return [];
  const issues = [];
  const tokens = sourceTokensForLayer(row, layer);
  let combined = "";
  for (const file of files) {
    const full = join(rootDir, file);
    if (!existsSync(full)) {
      issues.push(issue(file, "WSA_SOURCE_LAYER_FILE_MISSING", `missing source file for ${row.stage} ${layer}`));
      continue;
    }
    combined += "\n" + readFileSync(full, "utf8");
  }
  const comparable = combined.toLowerCase();
  if (tokens.length && combined && !tokens.some((token) => comparable.includes(String(token).toLowerCase()))) {
    issues.push(issue(files.join(","), "WSA_SOURCE_LAYER_TOKEN_MISSING", `${layer} does not mention ${row.stage} using any of: ${tokens.join(", ")}`));
  }
  return issues;
}

function sourceFilesForLayer(row, layer) {
  const specStage = row.stage.includes("spec");
  const configured = SOURCE_LAYER_FILES[layer];
  if (!configured) return [];
  if (Array.isArray(configured)) return configured;
  return specStage ? configured.spec || [] : configured.plan || [];
}

function sourceTokensForLayer(row, layer) {
  if (["receipts", "final-suite", "templates"].includes(layer)) return [];
  if (["router", "command-catalog"].includes(layer)) return [workflowSummaryIntentFromStage(row.stage), row.stage];
  if (["command-docs", "skills", "schema", "tests"].includes(layer)) return [row.stage, row.artifactPathPattern.split("/").pop()];
  if (["formatter", "validator"].includes(layer)) return ["workflow-summary", "visualSummary", "sourceArtifact"];
  return [];
}

async function collectJsonFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await collectJsonFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".json")) out.push(full);
  }
  return out;
}

function issue(file, code, message) {
  return { file, code, message };
}

function failFatal(error) {
  console.error("SUPERVIBE_WORKFLOW_SUMMARY_ARTIFACTS_ERROR");
  console.error(error?.stack || error?.message || error);
  process.exit(1);
}

if (process.argv[1]?.endsWith("validate-workflow-summary-artifacts.mjs")) {
  runCli().catch(failFatal);
}
