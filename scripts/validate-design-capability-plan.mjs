#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import {
  validateDesignCapabilityContracts,
} from "./lib/design-capability-plan.mjs";

export function formatDesignCapabilityPlanReport(result = {}) {
  const lines = [
    "SUPERVIBE_DESIGN_CAPABILITY_PLAN",
    `PASS: ${result.pass === true}`,
    `CHECKED: ${result.checked || 0}`,
    `MODES: ${(result.modes || []).join(", ")}`,
    `ISSUES: ${(result.issues || []).length}`,
  ];
  for (const item of result.issues || []) {
    lines.push(`ISSUE: ${item.code} ${item.file} - ${item.message}`);
  }
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateDesignCapabilityContracts(process.cwd());
  console.log(formatDesignCapabilityPlanReport(result));
  process.exit(result.pass ? 0 : 1);
}
