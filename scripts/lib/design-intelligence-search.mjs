import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const DEFAULT_DATA_DIR = join(ROOT, "skills", "design-intelligence", "data");

const DOMAIN_ALIASES = new Map([
  ["products", "product"],
  ["product", "product"],
  ["styles", "style"],
  ["style", "style"],
  ["colors", "color"],
  ["color", "color"],
  ["typography", "typography"],
  ["fonts", "google-fonts"],
  ["google fonts", "google-fonts"],
  ["ux", "ux"],
  ["ux-guidelines", "ux"],
  ["charts", "charts"],
  ["chart", "charts"],
  ["icons", "icons"],
  ["icon", "icons"],
  ["landing", "landing"],
  ["app", "app-interface"],
  ["app-interface", "app-interface"],
  ["interface", "app-interface"],
  ["react performance", "react-performance"],
  ["react-performance", "react-performance"],
  ["reasoning", "ui-reasoning"],
  ["ui-reasoning", "ui-reasoning"],
  ["slides", "slides"],
  ["deck", "slides"],
  ["presentation", "slides"],
  ["collateral", "collateral"],
  ["brand asset", "collateral"],
]);

const STACK_ALIASES = new Map([
  ["next.js", "nextjs"],
  ["next", "nextjs"],
  ["react native", "react-native"],
  ["react-native", "react-native"],
  ["tailwind", "html-tailwind"],
  ["html tailwind", "html-tailwind"],
  ["jetpack compose", "jetpack-compose"],
  ["nuxt ui", "nuxt-ui"],
  ["nuxt-ui", "nuxt-ui"],
  ["three.js", "threejs"],
  ["three", "threejs"],
]);

let cachedData = null;

export async function loadDesignIntelligenceData({ projectRoot = ROOT, dataDir = DEFAULT_DATA_DIR } = {}) {
  if (cachedData?.dataDir === dataDir) return cachedData;

  const manifestPath = join(dataDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const documents = [];

  for (const domain of manifest.domains ?? []) {
    if (domain.status !== "adapted" || !domain.importedPath) continue;
    const csvPath = join(projectRoot, domain.importedPath);
    let csv;
    try {
      csv = await readFile(csvPath, "utf8");
    } catch {
      continue;
    }
    const rows = parseCsv(csv);
    rows.forEach((fields, index) => {
      documents.push(normalizeRow({ domain, fields, index }));
    });
  }

  cachedData = {
    dataDir,
    manifest,
    documents,
    domains: [...new Set(documents.map((doc) => doc.domain))].sort(),
    stacks: [...new Set(documents.filter((doc) => doc.kind === "stack").map((doc) => doc.stack))].sort(),
  };
  return cachedData;
}

export async function searchDesignIntelligence({
  query,
  domain = null,
  kind = null,
  stack = null,
  maxResults = 5,
  minScore = 0,
  projectRoot = ROOT,
} = {}) {
  const data = await loadDesignIntelligenceData({ projectRoot });
  const queryText = String(query ?? "").trim();
  const queryTokens = tokenize(queryText);
  const requestedDomain = normalizeDomain(domain);
  const requestedStack = normalizeStack(stack);

  let candidates = data.documents;
  if (requestedDomain) {
    candidates = requestedDomain === "slides" || requestedDomain === "collateral"
      ? candidates.filter((doc) => doc.kind === requestedDomain || doc.domain.startsWith(`${requestedDomain}:`))
      : candidates.filter((doc) => doc.domain === requestedDomain);
  }
  if (kind) {
    candidates = candidates.filter((doc) => doc.kind === kind);
  }
  if (requestedStack) {
    candidates = candidates.filter((doc) => doc.stack === requestedStack);
  }

  if (queryTokens.length === 0) {
    return candidates.slice(0, maxResults).map((doc) => toResult(doc, 0, []));
  }

  const documentFrequencies = new Map();
  for (const doc of candidates) {
    for (const token of new Set(doc.tokens)) {
      documentFrequencies.set(token, (documentFrequencies.get(token) ?? 0) + 1);
    }
  }

  const avgLength = candidates.length
    ? candidates.reduce((sum, doc) => sum + doc.tokens.length, 0) / candidates.length
    : 1;
  const scored = candidates
    .map((doc) => {
      const { score, matchedTokens } = scoreBm25(doc, queryTokens, documentFrequencies, candidates.length, avgLength);
      return toResult(doc, score, matchedTokens);
    })
    .filter((result) => result.score >= minScore && result.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, maxResults);

  return scored;
}

export async function composeDesignRecommendation({
  query,
  projectRoot = ROOT,
  maxResultsPerDomain = 3,
  stack = null,
} = {}) {
  const intentDomains = inferDesignDomains(query);
  const evidence = [];

  for (const domain of intentDomains) {
    const rows = await searchDesignIntelligence({
      query,
      domain,
      maxResults: maxResultsPerDomain,
      projectRoot,
    });
    evidence.push(...rows);
  }

  if (stack) {
    evidence.push(...await searchDesignIntelligence({
      query,
      kind: "stack",
      stack,
      maxResults: maxResultsPerDomain,
      projectRoot,
    }));
  }

  const uniqueEvidence = dedupeResults(evidence).slice(0, maxResultsPerDomain * Math.max(2, intentDomains.length));
  return {
    query: String(query ?? ""),
    sourceCommit: (await loadDesignIntelligenceData({ projectRoot })).manifest.sourceCommitShort,
    precedence: [
      "approved design system",
      "project memory",
      "codebase patterns",
      "accessibility law",
      "external lookup",
    ],
    recommendation: summarizeEvidence(uniqueEvidence),
    evidence: uniqueEvidence,
    conflicts: [],
    missingDomains: intentDomains.filter((domain) => !uniqueEvidence.some((row) => row.domain === domain || row.kind === domain)),
    checklist: buildChecklist(uniqueEvidence),
  };
}

export function formatDesignEvidence(results = []) {
  if (results.length === 0) return "Design Intelligence Evidence: no matching rows found.";
  const lines = ["Design Intelligence Evidence:"];
  for (const row of results) {
    lines.push(`- ${row.id} score=${row.score.toFixed(3)} domain=${row.domain}: ${row.title}`);
  }
  return lines.join("\n");
}

export function inferDesignDomains(query = "") {
  const text = String(query).toLowerCase();
  const domains = new Set(["product", "style", "color", "typography", "ux"]);
  if (hasAny(text, ["landing", "лендинг", "conversion", "cta"])) domains.add("landing");
  if (hasAny(text, ["chart", "graph", "data viz", "график", "диаграм"])) domains.add("charts");
  if (hasAny(text, ["icon", "икон", "lucide"])) domains.add("icons");
  if (hasAny(text, ["mobile", "ios", "android", "touch", "мобиль"])) domains.add("app-interface");
  if (hasAny(text, ["deck", "slide", "presentation", "презентац", "слайд"])) domains.add("slides");
  if (hasAny(text, ["logo", "brand asset", "collateral", "cip", "фирстиль", "логотип"])) domains.add("collateral");
  if (hasAny(text, ["react performance", "render", "memo", "hydrate"])) domains.add("react-performance");
  return [...domains];
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\"") {
      if (inQuotes && text[i + 1] === "\"") {
        cell += "\"";
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  if (rows.length === 0) return [];

  const headers = rows.shift().map((header) => header.trim());
  return rows
    .filter((cells) => cells.some((value) => String(value).trim() !== ""))
    .map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}

function normalizeRow({ domain, fields, index }) {
  const title = pickFirst(fields, [
    "Product Type",
    "Style Category",
    "Type",
    "Pattern Name",
    "Font Pairing Name",
    "Issue",
    "Guideline",
    "Icon Name",
    "Best Chart Type",
    "Recommended_Pattern",
    "layout_name",
    "strategy_name",
    "formula_name",
    "Palette Name",
    "Industry",
    "Style Name",
    "Deliverable",
    "Context Name",
    "name",
    "Family",
  ]) || `${domain.id} row ${index + 1}`;
  const rowNo = fields.No || fields.id || fields.ID || String(index + 1);
  const id = `${domain.id}:${safeId(rowNo)}:${safeId(title).slice(0, 48)}`;
  const searchable = buildSearchableText(fields, domain);
  return {
    id,
    rowIndex: index,
    rowNo: String(rowNo),
    domain: domain.id,
    kind: domain.kind,
    stack: domain.kind === "stack" ? domain.id.replace(/^stack:/, "") : null,
    title,
    sourcePath: domain.sourcePath,
    importedPath: domain.importedPath,
    sourceCommit: domain.sourceCommitShort ?? "b7e3af8",
    fields,
    searchFields: domain.searchFields ?? [],
    displayFields: domain.displayFields ?? [],
    criticalFields: domain.criticalFields ?? [],
    text: searchable,
    tokens: tokenize(searchable),
  };
}

function buildSearchableText(fields, domain) {
  const searchFields = domain.searchFields?.length ? domain.searchFields : Object.keys(fields);
  const weighted = [];
  for (const field of searchFields) {
    if (fields[field]) weighted.push(`${field} ${fields[field]} ${fields[field]}`);
  }
  for (const [key, value] of Object.entries(fields)) {
    if (!searchFields.includes(key) && value) weighted.push(`${key} ${value}`);
  }
  return weighted.join("\n");
}

function scoreBm25(doc, queryTokens, documentFrequencies, documentCount, avgLength) {
  const k1 = 1.4;
  const b = 0.75;
  const frequencies = new Map();
  for (const token of doc.tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);

  let score = 0;
  const matchedTokens = [];
  for (const token of queryTokens) {
    const tf = frequencies.get(token) ?? 0;
    if (tf === 0) continue;
    matchedTokens.push(token);
    const df = documentFrequencies.get(token) ?? 0;
    const idf = Math.log(1 + (documentCount - df + 0.5) / (df + 0.5));
    const denominator = tf + k1 * (1 - b + b * (doc.tokens.length / Math.max(1, avgLength)));
    score += idf * ((tf * (k1 + 1)) / denominator);
  }

  return { score, matchedTokens };
}

function toResult(doc, score, matchedTokens) {
  return {
    id: doc.id,
    domain: doc.domain,
    kind: doc.kind,
    stack: doc.stack,
    rowNo: doc.rowNo,
    score,
    title: doc.title,
    recommendation: pickRecommendation(doc.fields),
    sourcePath: doc.sourcePath,
    importedPath: doc.importedPath,
    sourceCommit: doc.sourceCommit,
    matchedTokens,
    platformScope: doc.fields.Platform || doc.fields.platform || "any",
    severity: doc.fields.Severity || doc.fields.severity || null,
    fields: compactFields(doc.fields, doc.displayFields),
    criticalFields: compactFields(doc.fields, doc.criticalFields),
  };
}

function pickRecommendation(fields) {
  return pickFirst(fields, [
    "Primary Style Recommendation",
    "Recommended_Pattern",
    "Guideline",
    "Do",
    "Best Chart Type",
    "Pattern Name",
    "Description",
    "Best For",
    "Recommended Effects",
    "Key Considerations",
    "components",
    "use_case",
    "Best Practices",
  ]) || "";
}

function compactFields(fields, preferred = []) {
  const entries = preferred.length > 0
    ? preferred.map((field) => [field, fields[field]]).filter(([, value]) => value)
    : Object.entries(fields).filter(([, value]) => value);
  return Object.fromEntries(entries.slice(0, 16));
}

function summarizeEvidence(evidence) {
  if (evidence.length === 0) {
    return "No matching design intelligence rows found; rely on approved project memory and design-system facts.";
  }
  const top = evidence.slice(0, 4).map((row) => `${row.domain}:${row.title}`).join("; ");
  return `Use retrieved design intelligence as advisory evidence, then reconcile with approved memory and tokens: ${top}.`;
}

function buildChecklist(evidence) {
  const checklist = new Set([
    "Run memory and code preflight before producing artifacts.",
    "Cite every retrieved row used in the final design decision.",
    "Do not override approved design-system tokens without an explicit extension approval.",
  ]);
  for (const row of evidence) {
    if (row.severity) checklist.add(`Handle ${row.domain} severity ${row.severity}: ${row.title}.`);
    if (row.domain === "charts") checklist.add("Include chart fallback and accessibility notes.");
    if (row.kind === "stack") checklist.add(`Preserve stack guidance for ${row.stack}.`);
    if (row.kind === "slides") checklist.add("Validate deck narrative, layout, copy, and chart fit.");
  }
  return [...checklist];
}

function dedupeResults(results) {
  const seen = new Set();
  const deduped = [];
  for (const result of results.sort((a, b) => b.score - a.score)) {
    if (seen.has(result.id)) continue;
    seen.add(result.id);
    deduped.push(result);
  }
  return deduped;
}

function normalizeDomain(domain) {
  if (!domain) return null;
  const key = String(domain).toLowerCase().trim();
  return DOMAIN_ALIASES.get(key) ?? key;
}

function normalizeStack(stack) {
  if (!stack) return null;
  const key = String(stack).toLowerCase().trim();
  return STACK_ALIASES.get(key) ?? key.replace(/\s+/g, "-");
}

function pickFirst(object, keys) {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
}

function safeId(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9а-яё]+/giu, "-")
    .replace(/^-+|-+$/g, "") || "row";
}

function tokenize(value) {
  return [...new Set(String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-zа-яё0-9\s-]/giu, " ")
    .split(/[\s-]+/)
    .filter((token) => token.length >= 2))];
}

function hasAny(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase));
}
