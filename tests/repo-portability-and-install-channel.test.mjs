import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import test from "node:test";

const TEXT_EXTENSIONS = new Set([
  ".json",
  ".js",
  ".md",
  ".mjs",
  ".ps1",
  ".sh",
  ".yaml",
  ".yml",
]);
const TEXT_FILENAMES = new Set(["README", "LICENSE"]);
const SKIP_DIRS = new Set([".git", ".worktrees", "coverage", "node_modules", "worktrees"]);
const SKIP_FILES = new Set([normalizePath(join(".claude", "settings.local.json"))]);

test("repository source stays portable and does not regress to stale installer channels", async () => {
  const rootDir = process.cwd();
  const files = await collectTextFiles(rootDir);
  const forbidden = [
    { label: "hardcoded POSIX repo path", value: "D:" + "/repo" },
    { label: "hardcoded Windows repo path", value: "D:" + "\\repo" },
    { label: "hardcoded Windows rootDir fixture", value: "rootDir: " + "\"D:" },
    { label: "stale raw GitHub install channel", value: "raw.githubusercontent.com/vTRKA/supervibe/" + "v" + "1.8.1" },
    { label: "stale default installer ref", value: "SUPERVIBE_REF:-" + "v" + "1.8.1" },
    { label: "stale OpenCode pinned release tag", value: "supervibe.git#" + "v" + "1.7.0" },
    { label: "stale Gemini agent count", value: "73 specialist " + "agents" },
    { label: "stale agent registry count", value: "Agent system (" + "79 agents" },
    { label: "stale skill registry count", value: "Skill system (" + "40 skills" },
    { label: "stale old test count", value: "258+" + " tests" },
  ];
  const offenders = [];

  for (const filePath of files) {
    const text = await readStableFile(filePath);
    if (text === null) continue;
    for (const pattern of forbidden) {
      if (text.includes(pattern.value)) {
        offenders.push(`${normalizePath(relative(rootDir, filePath))}: ${pattern.label}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});

test("public install and update entry points document the live main channel", async () => {
  const expectedReferences = new Map([
    ["README.md", [
      "https://raw.githubusercontent.com/vTRKA/supervibe/main/install.sh",
      "https://raw.githubusercontent.com/vTRKA/supervibe/main/install.ps1",
      "https://raw.githubusercontent.com/vTRKA/supervibe/main/update.sh",
      "https://raw.githubusercontent.com/vTRKA/supervibe/main/update.ps1",
    ]],
    ["docs/install-integrity.md", [
      "https://raw.githubusercontent.com/vTRKA/supervibe/main/install.sh",
      "https://raw.githubusercontent.com/vTRKA/supervibe/main/install.ps1",
      "https://raw.githubusercontent.com/vTRKA/supervibe/main/update.sh",
      "https://raw.githubusercontent.com/vTRKA/supervibe/main/update.ps1",
    ]],
    ["install.sh", ["https://raw.githubusercontent.com/vTRKA/supervibe/main/install.sh"]],
    ["install.ps1", ["https://raw.githubusercontent.com/vTRKA/supervibe/main/install.ps1"]],
    ["update.sh", [
      "https://raw.githubusercontent.com/vTRKA/supervibe/main/install.sh",
      "https://raw.githubusercontent.com/vTRKA/supervibe/main/update.sh",
    ]],
    ["update.ps1", [
      "https://raw.githubusercontent.com/vTRKA/supervibe/main/install.ps1",
      "https://raw.githubusercontent.com/vTRKA/supervibe/main/update.ps1",
    ]],
  ]);

  for (const [relativePath, references] of expectedReferences) {
    const text = await readFile(join(process.cwd(), relativePath), "utf8");
    for (const reference of references) {
      assert.ok(text.includes(reference), `${relativePath} must contain ${reference}`);
    }
  }
});

async function collectTextFiles(rootDir, currentDir = rootDir) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...await collectTextFiles(rootDir, join(currentDir, entry.name)));
      continue;
    }
    if (!entry.isFile()) continue;

    const filePath = join(currentDir, entry.name);
    const relativePath = normalizePath(relative(rootDir, filePath));
    if (SKIP_FILES.has(relativePath)) continue;
    if (!isTextFile(entry.name)) continue;
    files.push(filePath);
  }

  return files;
}

function isTextFile(fileName) {
  return TEXT_EXTENSIONS.has(extname(fileName)) || TEXT_FILENAMES.has(fileName);
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

async function readStableFile(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
