#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import {
  applyAgentProvisioningPlan,
  createAgentProvisioningPlan,
  formatAgentProvisioningApply,
  formatAgentProvisioningPlan,
} from "./lib/agent-provisioning.mjs";

const args = parseArgs(process.argv.slice(2));
const SCRIPT_PLUGIN_ROOT = fileURLToPath(new URL("../", import.meta.url));
const projectRoot = args["project-root"] || args.project || process.cwd();
const pluginRoot = args["plugin-root"] || SCRIPT_PLUGIN_ROOT;
const agentIds = splitList(args.agents);
const skillIds = splitList(args.skills);

try {
  const plan = createAgentProvisioningPlan({
    projectRoot,
    pluginRoot,
    adapterId: args.host || null,
    agentIds,
    skillIds,
  });

  if (args.json && !args.apply) {
    console.log(JSON.stringify({ plan }, null, 2));
  } else if (args.apply) {
    const result = await applyAgentProvisioningPlan(plan, { refreshContext: args["no-context"] !== true });
    if (args.json) console.log(JSON.stringify({ plan, result }, null, 2));
    else console.log(formatAgentProvisioningApply(result));
  } else {
    console.log(formatAgentProvisioningPlan(plan));
  }
} catch (error) {
  console.error(`provision-agents error: ${error.message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {};
  const booleans = new Set(["apply", "json", "no-context"]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (booleans.has(key)) parsed[key] = true;
    else {
      parsed[key] = argv[index + 1];
      index += 1;
    }
  }
  return parsed;
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
