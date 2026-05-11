#!/usr/bin/env node
import { parseArgs } from "node:util";

import {
  defaultWorkItemRegistryPath,
  repairWorkItemRegistryIntegrity,
  validateWorkItemRegistryIntegrity,
} from "./lib/supervibe-work-item-registry.mjs";

function formatReport(report = {}) {
  const lines = [
    "SUPERVIBE_WORK_ITEM_INDEX",
    `PASS: ${report.pass === true}`,
    `REGISTRY: ${report.registryPath || "unknown"}`,
    `ACTIVE_EPIC: ${report.activeEpicId || "none"}`,
    `EPICS: ${report.epicCount || 0}`,
    `ISSUES: ${(report.issues || []).length}`,
  ];
  for (const issue of report.issues || []) {
    lines.push(`ISSUE: ${issue.code}${issue.epicId ? ` ${issue.epicId}` : ""} - ${issue.message}`);
  }
  return lines.join("\n");
}

async function main() {
  const { values } = parseArgs({
    options: {
      registry: { type: "string" },
      repair: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log([
      "SUPERVIBE_WORK_ITEM_INDEX_HELP",
      "USAGE:",
      "  node scripts/validate-work-item-index.mjs",
      "  node scripts/validate-work-item-index.mjs --registry .supervibe/memory/work-items/index.json",
      "  node scripts/validate-work-item-index.mjs --repair",
    ].join("\n"));
    return;
  }

  const registryPath = values.registry || defaultWorkItemRegistryPath(process.cwd());
  if (values.repair) {
    const result = await repairWorkItemRegistryIntegrity({
      rootDir: process.cwd(),
      registryPath,
    });
    if (values.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("SUPERVIBE_WORK_ITEM_INDEX_REPAIR");
      console.log(`BEFORE_PASS: ${result.before.pass}`);
      console.log(`BEFORE_ISSUES: ${result.before.issues.length}`);
      console.log(`AFTER_PASS: ${result.after.pass}`);
      console.log(`AFTER_ISSUES: ${result.after.issues.length}`);
      for (const issue of result.after.issues) console.log(`ISSUE: ${issue.code}${issue.epicId ? ` ${issue.epicId}` : ""} - ${issue.message}`);
    }
    if (!result.after.pass) process.exit(1);
    return;
  }

  const report = validateWorkItemRegistryIntegrity({
    rootDir: process.cwd(),
    registryPath,
  });
  console.log(values.json ? JSON.stringify(report, null, 2) : formatReport(report));
  if (!report.pass) process.exit(1);
}

await main();
