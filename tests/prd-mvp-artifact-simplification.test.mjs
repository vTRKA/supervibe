import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const ACTIVE_SCAN_ROOTS = [
  "agents",
  "skills",
  "commands",
  "docs/templates",
  "scripts",
  "tests",
  "stack-packs",
  "templates",
  ".codex-plugin",
  ".claude-plugin",
  ".cursor-plugin",
  ".opencode",
  "package.json",
  "package-lock.json",
  "registry.yaml",
];

const TEXT_EXTENSIONS = new Set([".js", ".json", ".md", ".mjs", ".yaml", ".yml"]);
const lifecycleAcronym = ["S", "D", "L", "C"].join("");
const decisionAcronym = ["A", "D", "R"].join("");
const proposalAcronym = ["R", "F", "C"].join("");
const lifecycleSlug = lifecycleAcronym.toLowerCase();
const decisionSlug = decisionAcronym.toLowerCase();
const proposalSlug = proposalAcronym.toLowerCase();

const LEGACY_PATTERNS = [
  { label: "legacy lifecycle acronym", pattern: new RegExp(`\\b${lifecycleAcronym}\\b|${lifecycleSlug}`, "i") },
  {
    label: "legacy architecture decision acronym",
    pattern: new RegExp(`\\b${decisionAcronym}\\b|supervibe:${decisionSlug}|${decisionSlug}-artifacts|${decisionSlug}-template|validate${decisionAcronym[0]}${decisionAcronym.slice(1).toLowerCase()}Artifact`, "i"),
  },
  {
    label: "legacy proposal acronym",
    pattern: new RegExp(`\\b${proposalAcronym}\\b|${proposalSlug}-artifacts|${proposalSlug}-template|validate${proposalAcronym[0]}${proposalAcronym.slice(1).toLowerCase()}Artifact`, "i"),
  },
];

const TEMPLATE_PLACEHOLDER_PATTERNS = [
  { label: "angle placeholder token", pattern: /<[a-z0-9][^>\n]{0,80}>/i },
  { label: "brace placeholder token", pattern: /\{[a-z0-9][^}\n]{0,80}\}/i },
  { label: "ellipsis placeholder", pattern: /\.\.\./ },
  {
    label: "generic file placeholder",
    pattern: /\b(?:path\/file\.ext|path\/existing\.ext|tests\/path\/test\.ext|src\/path\/new-file\.ext|docs\/path\/new-doc\.md)\b/i,
  },
  { label: "binary yes-no placeholder", pattern: /\byes\s*\/\s*no\b/i },
  { label: "pass-fail placeholder", pattern: /\bpass\s+or\s+fail\b/i },
  { label: "same-fields placeholder", pattern: /\(same fields\)|same fields/i },
  { label: "tbd placeholder", pattern: /\bTBD\b/i },
  { label: "empty bullet field", pattern: /^\s*[-*]\s+[A-Z][^:\n]{2,80}:\s*$/ },
];

async function collectFiles(path) {
  if (!existsSync(path)) return [];
  const stat = await import("node:fs/promises").then((fs) => fs.stat(path));
  if (stat.isFile()) return isTextFile(path) ? [path] : [];

  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".supervibe") continue;
    files.push(...await collectFiles(join(path, entry.name)));
  }
  return files;
}

function isTextFile(path) {
  const index = path.lastIndexOf(".");
  return index >= 0 && TEXT_EXTENSIONS.has(path.slice(index));
}

function rel(path) {
  return relative(process.cwd(), path).split(sep).join("/");
}

test("active product workflow surfaces use PRD plus MVP readiness only", async () => {
  const files = (await Promise.all(ACTIVE_SCAN_ROOTS.map(collectFiles))).flat();
  const offenders = [];

  for (const file of files) {
    let text;
    try {
      text = await readFile(file, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const { label, pattern } of LEGACY_PATTERNS) {
        if (pattern.test(line)) offenders.push(`${rel(file)}:${index + 1}: ${label}: ${line.trim()}`);
      }
    });
  }

  assert.deepEqual(offenders, []);
});

test("docs templates do not contain weak placeholder scaffolding", async () => {
  const files = await collectFiles("docs/templates");
  const offenders = [];

  for (const file of files) {
    const lines = stripFencedCodeLines(await readFile(file, "utf8"));
    lines.forEach((line, index) => {
      for (const { label, pattern } of TEMPLATE_PLACEHOLDER_PATTERNS) {
        if (pattern.test(line)) offenders.push(`${rel(file)}:${index + 1}: ${label}: ${line.trim()}`);
      }
    });
  }

  assert.deepEqual(offenders, []);
});

test("legacy artifact templates, validators, and skill directory are removed", () => {
  for (const path of [
    `docs/templates/${decisionAcronym}-template.md`,
    `docs/templates/${proposalAcronym}-template.md`,
    `skills/${decisionSlug}/SKILL.md`,
    `scripts/validate-${decisionSlug}-artifacts.mjs`,
    `scripts/validate-${proposalSlug}-artifacts.mjs`,
    `tests/${decisionSlug}-artifact-validator.test.mjs`,
    `tests/${proposalSlug}-artifact-validator.test.mjs`,
  ]) {
    assert.equal(existsSync(path), false, `${path} should be removed`);
  }
});

test("package scripts do not expose legacy artifact validators", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(`validate:${decisionSlug}-artifacts` in packageJson.scripts, false);
  assert.equal(`validate:${proposalSlug}-artifacts` in packageJson.scripts, false);
  assert.ok(!packageJson.scripts.check.includes(`validate:${decisionSlug}-artifacts`));
  assert.ok(!packageJson.scripts.check.includes(`validate:${proposalSlug}-artifacts`));
});

function stripFencedCodeLines(markdown) {
  let inFence = false;
  return markdown.split(/\r?\n/).map((line) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return "";
    }
    return inFence ? "" : line;
  });
}
