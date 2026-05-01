import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import test from "node:test";

const TEXT_EXTENSIONS = new Set([
  "",
  ".cjs",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ps1",
  ".sh",
  ".tpl",
  ".txt",
  ".yaml",
  ".yml",
]);

test("Supervibe-owned project state defaults to .supervibe, not Claude project state", () => {
  const offenders = [];
  for (const file of trackedTextFiles()) {
    const text = readFileSync(file, "utf8");
    const normalized = text.replace(/\r\n/g, "\n");
    if (normalized.includes([".claude", "memory"].join("/"))) {
      offenders.push(`${file}: literal Claude memory path`);
    }
    if (normalized.includes([".claude", "memory"].join("\\"))) {
      offenders.push(`${file}: literal Claude memory path`);
    }
    if (/["']\.claude["']\s*,\s*["']memory["']/.test(normalized)) {
      offenders.push(`${file}: joined Claude memory path`);
    }
    if (normalized.includes([".claude", "confidence-log.jsonl"].join("/"))) {
      offenders.push(`${file}: literal Claude confidence log path`);
    }
    if (/["']\.claude["']\s*,\s*["']confidence-log\.jsonl["']/.test(normalized)) {
      offenders.push(`${file}: joined Claude confidence log path`);
    }
    for (const legacyPath of [
      [".claude", "effectiveness.jsonl"].join("/"),
      [".claude", "research-cache"].join("/"),
      [".claude", "sync-config.yaml"].join("/"),
      [".claude", "_archive"].join("/"),
    ]) {
      if (normalized.includes(legacyPath)) {
        offenders.push(`${file}: legacy Supervibe state path ${legacyPath}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

function trackedTextFiles() {
  const output = execFileSync("git", ["ls-files"], { encoding: "utf8" });
  return output
    .split("\n")
    .filter(Boolean)
    .filter((file) => !file.startsWith("models/") && !file.startsWith("grammars/"))
    .filter((file) => TEXT_EXTENSIONS.has(extname(file)));
}
