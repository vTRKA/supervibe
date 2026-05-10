#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import {
  formatDesignVariantSetReport,
  validateAllDesignVariantSets,
  validateDesignVariantSet,
} from "./lib/design-variant-set.mjs";

function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    slug: "",
    requestedVariantCount: null,
    all: false,
    json: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--all") {
      options.all = true;
      continue;
    }
    if (item === "--json") {
      options.json = true;
      continue;
    }
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      options[key] = true;
      continue;
    }
    if (key === "requested") options.requestedVariantCount = Number(value);
    else options[key] = value;
    index += 1;
  }
  return options;
}

export function validateDesignVariantSetCli(argv = process.argv) {
  const options = parseArgs(argv);
  const result = options.all && !options.slug
    ? validateAllDesignVariantSets(options.root)
    : validateDesignVariantSet(options.root, {
      slug: options.slug,
      requestedVariantCount: options.requestedVariantCount,
    });
  return {
    options,
    result,
    output: options.json ? JSON.stringify(result, null, 2) : formatDesignVariantSetReport(result),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { result, output } = validateDesignVariantSetCli(process.argv);
  console.log(output);
  process.exit(result.pass ? 0 : 1);
}
