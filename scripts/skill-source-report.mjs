#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import {
  buildSkillSourceReport,
  formatSkillSourceReport,
} from "./lib/skill-source-resolver.mjs";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const projectRoot = arg("--root", process.cwd());
  const json = process.argv.includes("--json");
  const report = buildSkillSourceReport({ projectRoot });
  console.log(json ? JSON.stringify(report, null, 2) : formatSkillSourceReport(report));
  process.exit(report.pass ? 0 : 1);
}
