import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { preflight as memoryPreflight } from "./memory-preflight.mjs";
import { composeDesignRecommendation, searchDesignIntelligence } from "./design-intelligence-search.mjs";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const DEFAULT_SCAN_DIRS = ["prototypes", "skills", "agents/_design", "commands", "docs"];

export async function designContextPreflight({
  query,
  projectRoot = ROOT,
  limit = 5,
  domains = [],
  stack = null,
  scanDirs = DEFAULT_SCAN_DIRS,
} = {}) {
  const request = String(query ?? "").trim();
  const missingSources = [];

  const memory = await safeMemoryPreflight({ query: request, projectRoot, limit });
  if (memory.unavailable) missingSources.push("memory");

  const code = await scanCodebaseForDesignContext({ query: request, projectRoot, limit, scanDirs });
  if (code.length === 0) missingSources.push("code");

  const designLookup = domains.length > 0
    ? (await Promise.all(domains.map((domain) => searchDesignIntelligence({
        query: request,
        domain,
        stack,
        maxResults: limit,
        projectRoot,
      })))).flat()
    : (await composeDesignRecommendation({ query: request, stack, projectRoot, maxResultsPerDomain: 2 })).evidence;
  if (designLookup.length === 0) missingSources.push("designLookup");

  return {
    query: request,
    memory: memory.matches,
    code,
    designLookup,
    conflicts: detectContextConflicts({ memory: memory.matches, code, designLookup }),
    missingSources,
    recommendedNextQueries: recommendNextQueries({ query: request, designLookup, stack }),
  };
}

export async function scanCodebaseForDesignContext({
  query,
  projectRoot = ROOT,
  limit = 5,
  scanDirs = DEFAULT_SCAN_DIRS,
} = {}) {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const files = [];
  for (const dir of scanDirs) {
    await collectFiles(join(projectRoot, dir), files, projectRoot);
  }

  const matches = [];
  for (const file of files) {
    let content;
    try {
      content = await readFile(join(projectRoot, file), "utf8");
    } catch {
      continue;
    }
    const lower = content.toLowerCase();
    const hits = tokens.filter((token) => lower.includes(token));
    if (hits.length === 0) continue;
    matches.push({
      path: file,
      score: hits.length / tokens.length,
      matchedTokens: hits,
      snippet: bestSnippet(content, hits),
    });
  }
  return matches.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, limit);
}

function detectContextConflicts({ memory, code, designLookup }) {
  const conflicts = [];
  const hasApprovedSystem = code.some((item) => /prototypes\/_design-system|design-system/i.test(item.path));
  const suggestsBrand = designLookup.some((row) => row.kind === "collateral" || /color|style|typography/.test(row.domain));
  if (hasApprovedSystem && suggestsBrand) {
    conflicts.push({
      code: "approved-system-first",
      message: "Approved design-system/code evidence exists; generic lookup can only suggest extensions, not override tokens.",
      precedence: "approved design system > project memory > codebase patterns > accessibility law > external lookup",
    });
  }
  if (memory.some((entry) => /rejected/i.test(entry.path ?? entry.category ?? ""))) {
    conflicts.push({
      code: "prior-rejection-present",
      message: "Prior rejected design memory exists; do not reintroduce it without explicit rationale.",
    });
  }
  return conflicts;
}

function recommendNextQueries({ query, designLookup, stack }) {
  const recommendations = new Set();
  recommendations.add(`${query} accessibility token states`);
  recommendations.add(`${query} approved design system extensions`);
  if (stack) recommendations.add(`${query} ${stack} implementation handoff`);
  if (designLookup.some((row) => row.kind === "slides")) recommendations.add(`${query} slide narrative chart copy`);
  if (designLookup.some((row) => row.domain === "charts")) recommendations.add(`${query} chart fallback color accessibility`);
  return [...recommendations].slice(0, 5);
}

async function safeMemoryPreflight({ query, projectRoot, limit }) {
  try {
    const matches = await memoryPreflight({ query, projectRoot, limit, similarity: 0.2 });
    return { matches, unavailable: false };
  } catch (error) {
    return {
      matches: [],
      unavailable: true,
      error: error.message,
    };
  }
}

async function collectFiles(dir, out, projectRoot) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".git", "data"].includes(entry.name)) continue;
      await collectFiles(full, out, projectRoot);
    } else if (/\.(md|json|css|html|mjs|js|yaml|yml)$/i.test(entry.name)) {
      out.push(relative(projectRoot, full).replace(/\\/g, "/"));
    }
  }
}

function bestSnippet(content, tokens) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== "");
  const lowerTokens = tokens.map((token) => token.toLowerCase());
  const line = lines.find((candidate) => lowerTokens.some((token) => candidate.toLowerCase().includes(token))) ?? lines[0] ?? "";
  return line.trim().slice(0, 240);
}

function tokenize(value) {
  return [...new Set(String(value)
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s-]/giu, " ")
    .split(/[\s-]+/)
    .filter((token) => token.length >= 3))];
}
