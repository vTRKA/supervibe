#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import {
  evaluateDesignQualityGate,
  formatDesignQualityGateReport,
} from "./lib/design-quality-gate-aggregator.mjs";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = evaluateDesignQualityGate(arg("--root", process.cwd()), {
    slug: arg("--slug", ""),
    requireReviews: process.argv.includes("--require-reviews"),
  });
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatDesignQualityGateReport(result));
  }
  process.exit(result.pass ? 0 : 2);
}
