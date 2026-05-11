#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatDesignActiveCompletionReport,
  validateDesignActiveCompletion,
} from "./lib/design-active-completion.mjs";

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
    "SUPERVIBE_DESIGN_ACTIVE_COMPLETION_HELP",
    "USAGE:",
    "  node scripts/validate-design-active-completion.mjs",
    "  node scripts/validate-design-active-completion.mjs --active --command /supervibe-design --slug agent-chat --handoff-id run-123 --requested-variants 5",
    "  node scripts/validate-design-active-completion.mjs --active --command /supervibe-design --slug agent-chat --handoff-id run-123 --requested-variants 5 --require-capability-plan --require-browser-evidence",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  if (options.help || options.h) {
    console.log(usage());
    process.exit(0);
  }
  try {
    const result = validateDesignActiveCompletion(resolve(options.root || process.cwd()), {
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
    console.log(options.json ? JSON.stringify(result, null, 2) : formatDesignActiveCompletionReport(result));
    process.exit(result.pass ? 0 : 1);
  } catch (error) {
    console.error("SUPERVIBE_DESIGN_ACTIVE_COMPLETION_ERROR");
    console.error(`ERROR: ${error.message}`);
    process.exit(2);
  }
}
