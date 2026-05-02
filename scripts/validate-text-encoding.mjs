#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  collectTextFiles,
  formatTextEncodingReport,
  repairMojibakeText,
  validateTextEncoding,
} from "./lib/text-encoding-quality.mjs";

function fixMojibake(rootDir) {
  let changed = 0;
  let repairs = 0;
  for (const file of collectTextFiles(rootDir)) {
    const before = readFileSync(file, "utf8");
    const result = repairMojibakeText(before);
    if (result.repairs.length === 0) continue;
    writeFileSync(file, result.text, "utf8");
    changed += 1;
    repairs += result.repairs.length;
  }
  return { changed, repairs };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rootDir = process.cwd();
  if (process.argv.includes("--fix")) {
    const result = fixMojibake(rootDir);
    console.log(`SUPERVIBE_TEXT_ENCODING_FIX\nFILES_CHANGED: ${result.changed}\nREPAIRS: ${result.repairs}`);
  }
  const validation = validateTextEncoding(rootDir);
  console.log(formatTextEncodingReport(validation));
  process.exit(validation.pass ? 0 : 1);
}
