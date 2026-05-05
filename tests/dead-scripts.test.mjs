import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([".git", ".supervibe", "models", "node_modules"]);
const TEXT_FILE_PATTERN = /\.(cjs|csv|editorconfig|gitattributes|gitignore|js|json|md|mjs|nvmrc|ps1|sh|tpl|txt|yaml|yml)$/i;

test("top-level script entrypoints are referenced by package, hooks, docs, tests, or commands", async () => {
  const scripts = (await readdir(join(ROOT, "scripts"), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".mjs"))
    .map((entry) => `scripts/${entry.name}`)
    .sort();
  const corpus = await readReferenceCorpus(ROOT);
  const unreferenced = [];

  for (const script of scripts) {
    const windowsPath = script.replace(/\//g, "\\");
    const scriptName = script.split("/").pop();
    const references = corpus.filter(({ relPath, content }) => {
      if (relPath === script) return false;
      return content.includes(script)
        || content.includes(windowsPath)
        || content.includes(scriptName);
    });
    if (references.length === 0) unreferenced.push(script);
  }

  assert.deepEqual(unreferenced, []);
});

async function readReferenceCorpus(rootDir) {
  const paths = await collectFiles(rootDir);
  const out = [];
  for (const filePath of paths) {
    const relPath = normalizePath(relative(rootDir, filePath));
    if (!isTextReferenceFile(relPath)) continue;
    out.push({
      relPath,
      content: await readFile(filePath, "utf8"),
    });
  }
  return out;
}

async function collectFiles(dirPath, out = []) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const child = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(child, out);
    } else if (entry.isFile()) {
      out.push(child);
    }
  }
  return out;
}

function isTextReferenceFile(relPath) {
  return TEXT_FILE_PATTERN.test(relPath) || relPath.startsWith(".husky/");
}

function normalizePath(value) {
  return String(value || "").split(sep).join("/");
}
