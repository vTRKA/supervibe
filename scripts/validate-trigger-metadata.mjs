#!/usr/bin/env node
import { lintTriggerMetadata, formatTriggerMetadataLint } from "./lib/supervibe-trigger-metadata-linter.mjs";

const result = lintTriggerMetadata({ root: process.cwd() });
console.log(formatTriggerMetadataLint(result));

if (!result.pass) {
  process.exitCode = 1;
}
