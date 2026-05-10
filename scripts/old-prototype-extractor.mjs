#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import {
  extractOldPrototypeSemanticMap,
} from "./lib/old-prototype-extractor.mjs";

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  const input = options.input || options.path;
  if (!input || options.help || options.h) {
    console.log([
      "SUPERVIBE_OLD_PROTOTYPE_EXTRACTOR",
      "USAGE:",
      "  node scripts/old-prototype-extractor.mjs --input <file-or-dir> [--output semantic-map.json]",
    ].join("\n"));
    process.exit(input ? 0 : 1);
  }
  try {
    const result = extractOldPrototypeSemanticMap(input, { outputPath: options.output });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.checkedFiles > 0 ? 0 : 2);
  } catch (error) {
    console.error("SUPERVIBE_OLD_PROTOTYPE_EXTRACTOR_ERROR");
    console.error(`ERROR: ${error.message}`);
    process.exit(2);
  }
}
