#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildDesignWorkflowReport,
  formatDesignWorkflowReport,
} from "./lib/design-workflow-report.mjs";

function parseArgs(argv = process.argv) {
  const options = { root: process.cwd(), json: false };
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    if (key === "json") {
      options.json = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = value;
    index += 1;
  }
  return options;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  const report = buildDesignWorkflowReport(resolve(options.root || process.cwd()), {
    active: options.active === true,
    command: options.command || options.workflow,
    host: options.host,
    slug: options.slug,
    handoffId: options["handoff-id"] || options.handoffId || options.handoff,
    workflowRunId: options["workflow-run-id"] || options.workflowRunId,
    requestedVariantCount: options["requested-variants"] || options.requestedVariants || options.requested,
    requireCapabilityPlan: options["require-capability-plan"] === true || options.requireCapabilityPlan === true,
    requireBrowserEvidence: options["require-browser-evidence"] === true || options.requireBrowserEvidence === true,
    pluginRoot: options["plugin-root"] || options.pluginRoot,
  });
  console.log(options.json ? JSON.stringify(report, null, 2) : formatDesignWorkflowReport(report));
  process.exit(report.pass ? 0 : 1);
}
