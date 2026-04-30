#!/usr/bin/env node
import { readFileSync } from "node:fs";

const file = process.argv[2];
const allowedTypes = new Set(["feat", "fix", "chore", "docs", "test", "refactor", "perf", "ci", "build", "revert"]);

if (!file) fail("commit message file path is required");

const header = readFileSync(file, "utf8").split(/\r?\n/, 1)[0].trim();
if (/^(Merge|Revert)\b/.test(header)) process.exit(0);

const match = /^([a-z]+)(\([^)]+\))?: (.+)$/.exec(header);
if (!match) {
  fail("commit message must use Conventional Commits, e.g. fix: stabilize installer");
}

const [, type, , subject] = match;
if (!allowedTypes.has(type)) {
  fail(`unsupported commit type "${type}"`);
}

if (header.length > 100) {
  fail("commit message header must be 100 characters or fewer");
}

if (!subject || /^[A-Z]/.test(subject)) {
  fail("commit subject must be non-empty and should not start with an uppercase letter");
}

function fail(message) {
  console.error(`[commit-msg] ${message}`);
  process.exit(1);
}
