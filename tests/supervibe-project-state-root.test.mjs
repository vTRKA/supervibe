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

test("host-neutral scaffold files do not hardcode Claude project folders", () => {
  const offenders = [];
  for (const file of trackedTextFiles()) {
    if (!isHostNeutralScaffoldFile(file)) continue;
    const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    if (/\.claude[\\/]/.test(text)) {
      offenders.push(`${file}: host-neutral scaffold file references .claude/`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("shared agents skills rules and docs avoid Claude-only plugin root references", () => {
  const offenders = [];
  for (const file of trackedTextFiles()) {
    if (!isSharedHostArtifact(file)) continue;
    const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    const retiredBrand = ["evo", "lve"].join("");
    const staleVersionMarker = [".", retiredBrand, "-version"].join("");
    const providerRootMarker = ["CLAUDE", "_PLUGIN_ROOT"].join("");
    if (text.includes(providerRootMarker) || text.includes(".claude/code.db") || text.includes(staleVersionMarker)) {
      offenders.push(`${file}: Claude-only plugin root or stale project state reference`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("shared agents skills and rules use host-neutral instruction wording", () => {
  const offenders = [];
  for (const file of trackedTextFiles()) {
    if (!isSharedAgentSkillRule(file)) continue;
    const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    for (const pattern of [
      /\bCLAUDE\.md\b/,
      /\.claude\/(?:agents|rules|skills|settings|adr|genesis|stack-fingerprint)\b/,
    ]) {
      if (pattern.test(text)) {
        offenders.push(`${file}: shared artifact hardcodes a Claude host path/instruction file`);
        break;
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("runtime scripts do not hardcode provider-specific hook env names", () => {
  const offenders = [];
  const providerEnvMarkers = [
    ["CLAUDE", "_PLUGIN_ROOT"].join(""),
    ["CLAUDE", "_PROJECT_DIR"].join(""),
    ["CLAUDE", "_FILE_PATHS"].join(""),
  ];
  for (const file of trackedTextFiles()) {
    if (!file.startsWith("scripts/") && !file.startsWith("hooks/")) continue;
    const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    for (const marker of providerEnvMarkers) {
      if (text.includes(marker)) {
        offenders.push(`${file}: direct provider-specific hook env marker ${marker}`);
        break;
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("tracked shared surfaces avoid retired brand command and namespace names", () => {
  const offenders = [];
  const retiredBrand = ["evo", "lve"].join("");
  const patterns = [
    new RegExp([retiredBrand, ":[A-Za-z0-9_/-]+"].join("")),
    new RegExp(["/", retiredBrand, "(?:\\b|-)"].join("")),
    new RegExp(["\\[", retiredBrand, "\\]"].join("")),
    new RegExp(["namespace:\\s*", retiredBrand, "\\b"].join("")),
    new RegExp(["EV", "OLVE_"].join("")),
    new RegExp([retiredBrand, "-fb"].join("")),
    new RegExp(["__", retiredBrand].join("")),
    new RegExp(["\\.", retiredBrand, "(?:-version|\\b)"].join("")),
    new RegExp([retiredBrand, "-(?:detect|upgrade)\\.mjs"].join("")),
    new RegExp([["Evo", "lve"].join(""), " Framework"].join("")),
  ];
  for (const file of trackedTextFiles()) {
    if (file === "CHANGELOG.md") continue;
    const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        offenders.push(`${file}: retired brand route/namespace/reference matched ${pattern}`);
        break;
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
    .filter((file) => file !== "tests/supervibe-project-state-root.test.mjs")
    .filter((file) => !file.startsWith("models/") && !file.startsWith("grammars/"))
    .filter((file) => TEXT_EXTENSIONS.has(extname(file)));
}

function isSharedAgentSkillRule(file) {
  return file.startsWith("agents/") || file.startsWith("skills/") || file.startsWith("rules/");
}

function isHostNeutralScaffoldFile(file) {
  return (
    (file.startsWith("stack-packs/") && file.includes("/configs/")) ||
    file.startsWith("templates/gitignore/")
  );
}

function isSharedHostArtifact(file) {
  return (
    file.startsWith("agents/") ||
    file.startsWith("skills/") ||
    file.startsWith("rules/") ||
    file.startsWith("commands/") ||
    file.startsWith("docs/") ||
    file.startsWith("templates/") ||
    ["README.md", "AGENTS.md", "GEMINI.md"].includes(file)
  );
}
