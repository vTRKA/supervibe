#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { parseArgs } from "node:util";

export function normalizeVisualBlocks(source = {}) {
  if (typeof source === "string") return extractMarkdownBlocks(source);
  const record = isPlainObject(source) ? source : {};
  return array(firstPresent(record.visualBlocks, record.visual_blocks, record.blocks)).map((block) => {
    const item = isPlainObject(block) ? block : {};
    return {
      id: text(item.id),
      type: text(item.type) || "visual",
      title: text(item.title),
      altText: text(firstPresent(item.altText, item.alt_text, item.description)),
      content: text(firstPresent(item.content, item.body, item.markdown, item.html)),
      textFallback: text(firstPresent(item.textFallback, item.text_fallback, item.fallback)),
      evidenceIds: stringArray(firstPresent(item.evidenceIds, item.evidence_ids, item.evidence)),
    };
  });
}

export function validateVisualBlocks(source = {}) {
  const blocks = normalizeVisualBlocks(source);
  const issues = [];
  if (blocks.length === 0) add(issues, "visual-blocks-missing", "visualBlocks", "at least one visual block is required");
  for (const [index, block] of blocks.entries()) {
    const path = `visualBlocks[${index}]`;
    requireSafeId(block.id, "visual-block-id", `${path}.id`, issues);
    requireText(block.title, "visual-block-title", `${path}.title`, issues);
    requireText(block.altText, "visual-block-alt-text", `${path}.altText`, issues);
    requireText(block.content, "visual-block-content", `${path}.content`, issues);
    requireText(block.textFallback, "visual-block-text-fallback", `${path}.textFallback`, issues);
    if (hasCorruptedQuestionMarks([block.title, block.altText, block.content, block.textFallback].join("\n"))) {
      add(issues, "visual-block-corrupted-question-marks", path, "visual block appears corrupted with repeated question marks");
    }
    if (!Array.isArray(block.evidenceIds) || block.evidenceIds.length === 0) {
      add(issues, "visual-block-evidence-missing", `${path}.evidenceIds`, "visual block must include evidence ids");
    }
  }
  validateDuplicateIds(blocks, issues);
  return { pass: issues.length === 0, record: { visualBlocks: blocks }, issues };
}

function extractMarkdownBlocks(source) {
  const blocks = [];
  const fence = /```(?:visual|mermaid|html|svg)?\s*\n([\s\S]*?)```/gi;
  let match;
  let index = 0;
  while ((match = fence.exec(source))) {
    blocks.push({
      id: `visual-block-${index + 1}`,
      type: "markdown-fence",
      title: titleBefore(source.slice(0, match.index)) || `Visual Block ${index + 1}`,
      altText: altTextNear(source, match.index),
      content: match[1].trim(),
      textFallback: fallbackNear(source, match.index),
      evidenceIds: evidenceIds(source),
    });
    index += 1;
  }
  return blocks;
}

async function readInput(file) {
  const source = await readFile(file, "utf8");
  if (extname(file).toLowerCase() === ".json") return JSON.parse(source);
  return source;
}

async function walkFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walkFiles(path));
    else if (/\.(?:json|md|html)$/i.test(entry.name)) out.push(path);
  }
  return out.sort();
}

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: "string", short: "f", multiple: true },
      "fixture-dir": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log("Usage:\n  node scripts/validate-visual-blocks.mjs --file visual-blocks.json\n  node scripts/validate-visual-blocks.mjs --fixture-dir tests/fixtures/visual-blocks");
    return;
  }
  const root = process.cwd();
  const explicit = Array.isArray(values.file) ? values.file : values.file ? [values.file] : [];
  const files = explicit.length ? explicit : values["fixture-dir"] ? await walkFiles(join(root, values["fixture-dir"])) : [];
  if (files.length === 0) {
    console.log("[validate-visual-blocks] no visual blocks records found; skipping");
    return;
  }
  const results = [];
  for (const file of files) {
    const result = validateVisualBlocks(await readInput(file));
    results.push({ file, ...result });
    printResult("visual-blocks", root, file, result);
  }
  exitForResults(results, "visual blocks record(s)");
}

function requireSafeId(value, codeBase, path, issues) {
  if (!value) add(issues, `${codeBase}-missing`, path, `${path} is required`);
  else if (!/^[\x21-\x7e]+$/.test(value)) add(issues, `${codeBase}-invalid`, path, `${path} must be ASCII-safe`);
}

function requireText(value, codeBase, path, issues) {
  if (!value) add(issues, `${codeBase}-missing`, path, `${path} is required`);
  else if (!/^[\x09\x0a\x0d\x20-\x7e]+$/.test(value)) add(issues, `${codeBase}-invalid`, path, `${path} must be ASCII-safe text`);
}

function hasCorruptedQuestionMarks(value) {
  return /\?{5,}/.test(value) || (value.match(/\?/g) || []).length >= 8;
}

function validateDuplicateIds(blocks, issues) {
  const seen = new Set();
  for (const block of blocks) {
    if (!block.id) continue;
    if (seen.has(block.id)) add(issues, "visual-block-id-duplicate", "visualBlocks", `duplicate visual block id ${block.id}`);
    seen.add(block.id);
  }
}

function titleBefore(text) {
  const matches = [...text.matchAll(/^#{1,3}\s+(.+)$/gm)];
  return textFromMatch(matches.at(-1)?.[1]);
}

function altTextNear(text, index) {
  const before = text.slice(Math.max(0, index - 500), index);
  const match = /(?:Alt text|Alt|Description)\s*:\s*([^\r\n]+)/i.exec(before);
  return textFromMatch(match?.[1]);
}

function fallbackNear(text, index) {
  const after = text.slice(index, index + 700);
  const match = /(?:Text fallback|Fallback)\s*:\s*([^\r\n]+)/i.exec(after);
  return textFromMatch(match?.[1]);
}

function evidenceIds(text) {
  return [...text.matchAll(/\b(?:evidence|receipt)-[A-Za-z0-9_.:-]+\b/g)].map((match) => match[0]);
}

function printResult(label, root, file, result) {
  const rel = relative(root, file).split(sep).join("/");
  if (result.pass) console.log(`OK   ${label} ${rel}`);
  else {
    console.error(`FAIL ${label} ${rel}`);
    for (const issue of result.issues) console.error(`  - [${issue.code}] ${issue.path}: ${issue.message}`);
  }
}

function exitForResults(results, label) {
  const failed = results.filter((result) => !result.pass).length;
  if (failed > 0) {
    console.error(`\n${failed}/${results.length} ${label} failed`);
    process.exit(1);
  }
  console.log(`\nAll ${results.length} ${label} passed`);
}

function add(issues, code, path, message) {
  issues.push({ code, path, message });
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function stringArray(value) {
  return array(value).map(text).filter(Boolean);
}

function text(value) {
  return String(value ?? "").trim();
}

function textFromMatch(value) {
  return text(value).replace(/^`|`$/g, "");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`;
if (isMain || process.argv[1]?.endsWith("validate-visual-blocks.mjs")) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
