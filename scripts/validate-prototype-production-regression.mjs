#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import {
  formatPrototypeProductionRegression,
  validatePrototypeProductionRegression,
} from "./lib/prototype-production-regression.mjs";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validatePrototypeProductionRegression(arg("--root", process.cwd()), {
    slug: arg("--slug", ""),
    prototypePath: arg("--prototype", ""),
    productionPath: arg("--production", ""),
    requirePair: process.argv.includes("--require-pair") || process.argv.includes("--active"),
  });
  console.log(formatPrototypeProductionRegression(result));
  process.exit(result.pass ? 0 : 2);
}
