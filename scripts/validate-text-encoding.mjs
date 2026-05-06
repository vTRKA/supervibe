#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  collectTextFiles,
  formatTextEncodingReport,
  repairMojibakeText,
  validateTextEncoding,
} from "./lib/text-encoding-quality.mjs";
import {
  resolveCliRoots,
} from "./lib/supervibe-cli-roots.mjs";

function fixMojibake(rootDir, options = {}) {
  let changed = 0;
  let repairs = 0;
  for (const file of collectTextFiles(rootDir, options)) {
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
  const roots = resolveCliRoots({ argv: process.argv.slice(2) });
  const rootDir = roots.root;
  const options = { includeGenerated: roots.args["include-generated"] === true };
  if (process.argv.includes("--fix")) {
    const result = fixMojibake(rootDir, options);
    console.log(`SUPERVIBE_TEXT_ENCODING_FIX\nFILES_CHANGED: ${result.changed}\nREPAIRS: ${result.repairs}`);
  }
  const validation = validateTextEncoding(rootDir, options);
  console.log(formatTextEncodingReport(validation));
  process.exit(validation.pass ? 0 : 1);
}
