import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

export function validatePrototypeProductionRegression(rootDir = process.cwd(), {
  prototypePath = "",
  productionPath = "",
  slug = "",
} = {}) {
  const resolvedPrototype = prototypePath || (slug ? `.supervibe/artifacts/prototypes/${slug}/index.html` : "");
  const resolvedProduction = productionPath || defaultProductionPath(rootDir);
  if (!resolvedPrototype || !resolvedProduction) {
    return skipped("missing-pair-path", resolvedPrototype, resolvedProduction);
  }
  const prototypeAbs = join(rootDir, ...normalizeRelPath(resolvedPrototype).split("/"));
  const productionAbs = join(rootDir, ...normalizeRelPath(resolvedProduction).split("/"));
  if (!existsSync(prototypeAbs) || !existsSync(productionAbs)) {
    return skipped("pair-not-found", resolvedPrototype, resolvedProduction);
  }

  const prototypeText = readFileSync(prototypeAbs, "utf8");
  const productionText = readFileSync(productionAbs, "utf8");
  const prototype = extractUiContract(prototypeText, { kind: "prototype" });
  const production = extractUiContract(productionText, { kind: "production" });
  const issues = [];

  if (!samePrefix(prototype.sections, production.sections)) {
    issues.push(issue("section-order-drift", "high", `section order differs: prototype=${prototype.sections.join(">") || "none"} production=${production.sections.join(">") || "none"}`));
  }
  for (const phrase of prototype.keyText) {
    if (!production.normalizedText.includes(normalizeText(phrase))) {
      issues.push(issue("key-text-missing", "high", `production missing key text: ${phrase}`));
    }
  }
  for (const [name, count] of Object.entries(prototype.componentCounts)) {
    const actual = production.componentCounts[name] || 0;
    if (actual < count) issues.push(issue("component-count-regression", "medium", `${name} count regressed: prototype=${count} production=${actual}`));
  }
  if (prototype.canonicalUrl && production.canonicalUrl && prototype.canonicalUrl !== production.canonicalUrl) {
    issues.push(issue("canonical-url-drift", "high", `canonical URL differs: prototype=${prototype.canonicalUrl} production=${production.canonicalUrl}`));
  }
  const overflowEvidence = collectOverflowEvidence(rootDir, { prototypePath: resolvedPrototype, productionPath: resolvedProduction });
  if (!overflowEvidence.pass) {
    issues.push(issue("viewport-overflow-evidence-missing", "medium", "missing 375/1440/1920 overflow evidence for prototype-production transfer"));
  }

  return {
    pass: !issues.some((item) => item.severity === "high"),
    status: issues.length ? "issues" : "pass",
    prototypePath: normalizeRelPath(resolvedPrototype),
    productionPath: normalizeRelPath(resolvedProduction),
    prototype,
    production,
    overflowEvidence,
    issues,
  };
}

export function formatPrototypeProductionRegression(result = {}) {
  const lines = [
    "SUPERVIBE_PROTOTYPE_PRODUCTION_REGRESSION",
    `PASS: ${result.pass === true}`,
    `STATUS: ${result.status || "unknown"}`,
    `PROTOTYPE: ${result.prototypePath || "none"}`,
    `PRODUCTION: ${result.productionPath || "none"}`,
    `ISSUES: ${(result.issues || []).length}`,
  ];
  for (const item of result.issues || []) lines.push(`ISSUE: ${item.severity} ${item.code} - ${item.message}`);
  if (result.overflowEvidence) {
    lines.push(`OVERFLOW_EVIDENCE: ${result.overflowEvidence.pass === true} ${result.overflowEvidence.path || "none"}`);
  }
  return lines.join("\n");
}

function extractUiContract(text = "", { kind = "prototype" } = {}) {
  const stripped = stripCodeNoise(text, { kind });
  const sections = extractSections(text, stripped);
  const keyText = extractKeyText(text, stripped);
  return {
    sections,
    keyText,
    canonicalUrl: extractCanonicalUrl(text),
    componentCounts: {
      sections: countPattern(text, /<section\b/g),
      buttons: countPattern(text, /<button\b/g),
      links: countPattern(text, /<a\b|<Link\b/g),
      forms: countPattern(text, /<form\b/g),
    },
    normalizedText: normalizeText(stripped),
  };
}

function extractSections(rawText, stripped) {
  const sections = [];
  const sectionPattern = /<section\b([^>]*)>([\s\S]*?)(?=<section\b|<\/main>|<\/body>|$)/gi;
  let match;
  while ((match = sectionPattern.exec(rawText))) {
    const attrs = match[1] || "";
    const body = match[2] || "";
    const id = attrValue(attrs, "data-section") || attrValue(attrs, "id") || attrValue(attrs, "aria-label");
    const heading = firstHeading(body);
    const value = slug(id || heading || `section-${sections.length + 1}`);
    sections.push(value);
  }
  if (sections.length) return sections;
  return firstHeadings(stripped, 6).map(slug);
}

function extractKeyText(rawText, stripped) {
  const headings = firstHeadings(rawText, 8);
  const visible = headings.length ? headings : firstSentences(stripped, 8);
  return visible.map((item) => item.trim()).filter((item) => item.length >= 4).slice(0, 8);
}

function firstHeading(text) {
  const match = text.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  return match ? stripTags(match[1]).trim() : "";
}

function firstHeadings(text, limit) {
  return [...String(text).matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((match) => stripTags(match[1]).trim())
    .filter(Boolean)
    .slice(0, limit);
}

function firstSentences(text, limit) {
  return String(text)
    .split(/[.\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 12)
    .slice(0, limit);
}

function extractCanonicalUrl(text) {
  const html = text.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
    || text.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  if (html) return html[1];
  const next = text.match(/canonical\s*:\s*["']([^"']+)["']/i);
  return next ? next[1] : "";
}

function collectOverflowEvidence(rootDir, { prototypePath, productionPath }) {
  const roots = [
    dirnameRel(prototypePath),
    dirnameRel(productionPath),
  ];
  for (const root of roots) {
    for (const relPath of walkEvidence(rootDir, root)) {
      const text = readFileSync(join(rootDir, ...relPath.split("/")), "utf8");
      const normalized = normalizeText(text);
      const hasViewports = ["375", "1440", "1920"].every((value) => normalized.includes(value));
      const clean = !/\boverflow\s*:\s*(fail|failed|true|detected)\b/i.test(text);
      if (hasViewports && clean) return { pass: true, path: relPath };
    }
  }
  return { pass: false, path: null };
}

function walkEvidence(rootDir, relDir) {
  const absDir = join(rootDir, ...normalizeRelPath(relDir).split("/"));
  if (!existsSync(absDir)) return [];
  const out = [];
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const relPath = normalizeRelPath(`${relDir}/${entry.name}`);
    const absPath = join(rootDir, ...relPath.split("/"));
    if (entry.isDirectory()) out.push(...walkEvidence(rootDir, relPath));
    else if (entry.isFile() && /\.(json|md|txt)$/i.test(entry.name) && statSync(absPath).size <= 1_000_000) out.push(relPath);
  }
  return out;
}

function defaultProductionPath(rootDir) {
  const candidates = [
    "frontend/src/app/page.tsx",
    "src/app/page.tsx",
    "app/page.tsx",
    "pages/index.tsx",
  ];
  return candidates.find((item) => existsSync(join(rootDir, ...item.split("/")))) || "";
}

function skipped(status, prototypePath, productionPath) {
  return {
    pass: true,
    status,
    prototypePath: prototypePath || null,
    productionPath: productionPath || null,
    issues: [],
  };
}

function issue(code, severity, message) {
  return { code, severity, message };
}

function samePrefix(left = [], right = []) {
  if (left.length === 0 || right.length === 0) return true;
  if (right.length < left.length) return false;
  return left.every((item, index) => right[index] === item);
}

function stripCodeNoise(text, { kind }) {
  let value = String(text || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  if (kind === "production") {
    value = value
      .replace(/className=(?:"[^"]*"|'[^']*'|{[^}]*})/g, " ")
      .replace(/import\s+[^;]+;/g, " ")
      .replace(/export\s+const\s+metadata[\s\S]*?};/g, " ");
  }
  return stripTags(value).replace(/[{}[\]()`;:=]/g, " ");
}

function stripTags(text) {
  return String(text || "").replace(/<[^>]+>/g, " ");
}

function attrValue(attrs, name) {
  const match = String(attrs || "").match(new RegExp(`${name}\\s*=\\s*(?:"([^"]+)"|'([^']+)'|{["']([^"']+)["']})`, "i"));
  return match ? match[1] || match[2] || match[3] || "" : "";
}

function countPattern(text, pattern) {
  return [...String(text || "").matchAll(pattern)].length;
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function slug(value) {
  return normalizeText(value).replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function dirnameRel(path) {
  const normalized = normalizeRelPath(path);
  const parts = normalized.split("/");
  parts.pop();
  return parts.join("/");
}

function normalizeRelPath(path) {
  return String(path || "").split(sep).join("/").replace(/\\/g, "/").replace(/^\.\//, "");
}
