#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const CREATIVE_REFERENCE_PACKS = Object.freeze([
  "creative-editorial.md",
  "creative-luxury.md",
  "creative-experimental-web.md",
  "creative-mobile-native.md",
  "creative-data-products.md",
  "creative-ai-products.md",
  "creative-devtools.md",
  "creative-regulated-trust.md",
]);

const TAXONOMY_PATH = "docs/references/creative-reference-taxonomy.md";
const PACK_DIR = "skills/design-intelligence/references/creative";

const TAXONOMY_REQUIRED = Object.freeze([
  /Creative Reference Taxonomy/i,
  /Fast path/i,
  /Medium path/i,
  /Full creative path/i,
  /Reference role/i,
  /Quality tier/i,
  /Golden briefs/i,
]);

const PACK_REQUIRED = Object.freeze([
  /^#\s+Creative Reference Pack:/im,
  /Reference role:/i,
  /Quality tier:/i,
  /Best for:/i,
  /Creative moves:/i,
  /Borrow:/i,
  /Avoid:/i,
  /Differentiation pressure:/i,
  /Do not use as style authority:/i,
]);

const FORBIDDEN_STYLE_AUTHORITY = Object.freeze([
  /\bin the style of\s+(Linear|Stripe|Apple|Notion|Slack|Airbnb|Uber|Shopify)\b/i,
  /\bmake it like\s+(Linear|Stripe|Apple|Notion|Slack|Airbnb|Uber|Shopify)\b/i,
  /\bcopy\s+(Linear|Stripe|Apple|Notion|Slack|Airbnb|Uber|Shopify)\b/i,
]);

function issue(file, code, message) {
  return { file, code, message };
}

function readProjectFile(rootDir, relPath) {
  const absPath = join(rootDir, ...relPath.split("/"));
  if (!existsSync(absPath)) return null;
  return readFileSync(absPath, "utf8");
}

function listExtraMarkdown(rootDir) {
  const absDir = join(rootDir, ...PACK_DIR.split("/"));
  if (!existsSync(absDir)) return [];
  return readdirSync(absDir)
    .filter((entry) => entry.endsWith(".md"))
    .filter((entry) => !CREATIVE_REFERENCE_PACKS.includes(entry))
    .sort();
}

export function validateCreativeReferencePacks(rootDir = process.cwd()) {
  const issues = [];
  const taxonomy = readProjectFile(rootDir, TAXONOMY_PATH);
  if (taxonomy === null) {
    issues.push(issue(TAXONOMY_PATH, "missing-taxonomy", `${TAXONOMY_PATH}: file not found`));
  } else {
    for (const pattern of TAXONOMY_REQUIRED) {
      if (!pattern.test(taxonomy)) {
        issues.push(issue(TAXONOMY_PATH, "missing-taxonomy-contract", `${TAXONOMY_PATH}: missing ${pattern}`));
      }
    }
  }

  for (const pack of CREATIVE_REFERENCE_PACKS) {
    const relPath = `${PACK_DIR}/${pack}`;
    const text = readProjectFile(rootDir, relPath);
    if (text === null) {
      issues.push(issue(relPath, "missing-pack", `${relPath}: file not found`));
      continue;
    }
    for (const pattern of PACK_REQUIRED) {
      if (!pattern.test(text)) {
        issues.push(issue(relPath, "missing-pack-contract", `${relPath}: missing ${pattern}`));
      }
    }
    for (const pattern of FORBIDDEN_STYLE_AUTHORITY) {
      if (pattern.test(text)) {
        issues.push(issue(relPath, "brand-name-style-authority", `${relPath}: contains forbidden style-authority prompt ${pattern}`));
      }
    }
    if (!/fast path|medium path|full creative path/i.test(text)) {
      issues.push(issue(relPath, "missing-path-fit", `${relPath}: must state fast path, medium path, or full creative path fit`));
    }
  }

  for (const extra of listExtraMarkdown(rootDir)) {
    issues.push(issue(`${PACK_DIR}/${extra}`, "unexpected-pack", `${PACK_DIR}/${extra}: add it to CREATIVE_REFERENCE_PACKS or remove it`));
  }

  return {
    pass: issues.length === 0,
    checked: CREATIVE_REFERENCE_PACKS.length + 1,
    issues,
  };
}

export function formatCreativeReferencePacksReport(result) {
  const lines = [
    "SUPERVIBE_CREATIVE_REFERENCE_PACKS",
    `PASS: ${result.pass}`,
    `CHECKED: ${result.checked}`,
    `ISSUES: ${result.issues.length}`,
  ];
  for (const item of result.issues) {
    lines.push(`ISSUE: ${item.code} ${item.file} - ${item.message}`);
  }
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateCreativeReferencePacks(process.cwd());
  console.log(formatCreativeReferencePacksReport(result));
  process.exit(result.pass ? 0 : 1);
}
