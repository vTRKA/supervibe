import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { discoverSourceFiles } from "./supervibe-index-policy.mjs";

const CONTEXT_BUDGET_TIERS = Object.freeze({
  tiny: { maxTokens: 800, repoMapTokens: 300, ragTokens: 350, graphTokens: 150 },
  standard: { maxTokens: 2400, repoMapTokens: 900, ragTokens: 1100, graphTokens: 400 },
  deep: { maxTokens: 6000, repoMapTokens: 2200, ragTokens: 2800, graphTokens: 1000 },
  refactor: { maxTokens: 9000, repoMapTokens: 3600, ragTokens: 3400, graphTokens: 2000 },
});

export async function buildRepoMap({ rootDir = process.cwd(), maxFiles = 200, tier = "standard" } = {}) {
  const inventory = await discoverSourceFiles(rootDir, { explain: false });
  const files = [];
  for (const file of inventory.files.slice(0, maxFiles)) {
    const relPath = file.relPath || file.path;
    const absPath = join(rootDir, relPath);
    let content = "";
    if (existsSync(absPath)) {
      try { content = await readFile(absPath, "utf8"); } catch {}
    }
    const symbols = extractSymbols(content);
    files.push({
      path: relPath.replace(/\\/g, "/"),
      language: file.language || inferLanguage(relPath),
      symbols,
      exportedSymbols: symbols.filter((symbol) => symbol.exported),
      testLinks: inferTestLinks(relPath, inventory.files),
      entryPoint: isEntryPoint(relPath),
      rank: rankFile(relPath, symbols),
      estimatedTokens: estimateTokens(`${relPath}\n${symbols.map((symbol) => symbol.signature).join("\n")}`),
    });
  }
  const sortedFiles = files.sort((a, b) => b.rank - a.rank || a.path.localeCompare(b.path));
  return {
    schemaVersion: 1,
    generatedAt: "deterministic-local",
    tier,
    budgets: CONTEXT_BUDGET_TIERS,
    fileCount: sortedFiles.length,
    files: sortedFiles,
    deterministicHash: stableHash(sortedFiles.map((file) => `${file.path}:${file.rank}:${file.symbols.map((symbol) => symbol.name).join(",")}`).join("|")),
  };
}

export function selectRepoMapContext(repoMap = {}, { tier = repoMap.tier || "standard", query = "" } = {}) {
  const budget = CONTEXT_BUDGET_TIERS[tier] || CONTEXT_BUDGET_TIERS.standard;
  const queryTerms = buildRepoMapQueryTerms(query);
  const ranked = (repoMap.files || []).map((file) => {
    const queryMatchScore = repoMapQueryMatchScore(file, queryTerms);
    return {
      ...file,
      queryMatchScore,
      queryMatched: queryMatchScore > 0,
      queryBoost: queryMatchScore > 0 ? 40 + queryMatchScore * 8 : 0,
    };
  });
  const hasQueryMatches = queryTerms.size > 0 && ranked.some((file) => file.queryMatched);
  const primaryCandidates = hasQueryMatches
    ? ranked.filter((file) => file.queryMatched)
    : ranked;
  const secondaryCandidates = hasQueryMatches
    ? ranked.filter((file) => !file.queryMatched)
    : [];
  const selected = [];
  const omitted = [];
  let usedTokens = 0;

  const addCandidates = (candidates, { allowUnmatched = false } = {}) => {
    for (const file of sortRepoMapCandidates(candidates, { preferQueryMatch: hasQueryMatches })) {
      const nextTokens = usedTokens + file.estimatedTokens;
      if (nextTokens <= budget.repoMapTokens) {
        selected.push(file);
        usedTokens = nextTokens;
      } else {
        omitted.push({
          path: file.path,
          reason: "repo-map token ceiling",
          estimatedTokens: file.estimatedTokens,
          rank: file.rank,
          queryMatchScore: file.queryMatchScore || 0,
        });
      }
    }
  };

  addCandidates(primaryCandidates, { allowUnmatched: !hasQueryMatches });
  if (hasQueryMatches && selected.length === 0) {
    addCandidates(secondaryCandidates, { allowUnmatched: true });
  } else if (hasQueryMatches && selected.length < 3) {
    for (const file of sortRepoMapCandidates(secondaryCandidates, { preferQueryMatch: false })) {
      if (selected.length >= 3) break;
      const nextTokens = usedTokens + file.estimatedTokens;
      if (nextTokens <= budget.repoMapTokens) {
        selected.push(file);
        usedTokens = nextTokens;
      }
    }
  }

  if (hasQueryMatches) {
    const selectedPaths = new Set(selected.map((file) => file.path));
    for (const file of secondaryCandidates) {
      if (selectedPaths.has(file.path)) continue;
      omitted.push({
        path: file.path,
        reason: "repo-map query relevance filter",
        estimatedTokens: file.estimatedTokens,
        rank: file.rank,
        queryMatchScore: file.queryMatchScore || 0,
      });
    }
  }

  return {
    tier,
    budget,
    usedTokens,
    selected,
    omitted,
    query: {
      terms: [...queryTerms],
      matchedFiles: ranked.filter((file) => file.queryMatched).length,
      relevanceFilter: hasQueryMatches,
    },
  };
}

export function formatRepoMapContext(selection = {}) {
  return [
    "SUPERVIBE_REPO_MAP_CONTEXT",
    `TIER: ${selection.tier || "standard"}`,
    `TOKENS: ${selection.usedTokens || 0}/${selection.budget?.repoMapTokens || 0}`,
    `SELECTED: ${selection.selected?.length || 0}`,
    `OMITTED: ${selection.omitted?.length || 0}`,
    ...((selection.selected || []).slice(0, 12).map((file) => `- ${file.path} rank=${file.rank} symbols=${file.symbols.map((symbol) => symbol.name).slice(0, 4).join(",") || "none"}`)),
    ...((selection.omitted || []).slice(0, 5).map((file) => `  omitted ${file.path}: ${file.reason}`)),
  ].join("\n");
}

const REPO_MAP_QUERY_STOP_WORDS = new Set([
  "agent",
  "agents",
  "code",
  "context",
  "docs",
  "file",
  "files",
  "repo",
  "script",
  "scripts",
  "source",
  "supervibe",
  "test",
  "tests",
]);

function buildRepoMapQueryTerms(query = "") {
  return new Set(String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3)
    .filter((term) => !REPO_MAP_QUERY_STOP_WORDS.has(term)));
}

function repoMapQueryMatchScore(file = {}, queryTerms = new Set()) {
  if (!queryTerms.size) return 0;
  const path = String(file.path || "").toLowerCase();
  const symbolText = (file.symbols || [])
    .map((symbol) => `${symbol.name || ""} ${symbol.signature || ""}`)
    .join(" ")
    .toLowerCase();
  let score = 0;
  for (const term of queryTerms) {
    if (path.includes(term)) score += 4;
    if (symbolText.includes(term)) score += 2;
  }
  return score;
}

function sortRepoMapCandidates(candidates = [], { preferQueryMatch = false } = {}) {
  return [...candidates].sort((left, right) => {
    if (preferQueryMatch && left.queryMatched !== right.queryMatched) return left.queryMatched ? -1 : 1;
    return (right.rank + right.queryBoost) - (left.rank + left.queryBoost)
      || (right.queryMatchScore || 0) - (left.queryMatchScore || 0)
      || left.path.localeCompare(right.path);
  });
}

function extractSymbols(content = "") {
  const symbols = [];
  const patterns = [
    { re: /export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)/g, kind: "function", exported: true },
    { re: /export\s+class\s+([A-Za-z0-9_$]+)/g, kind: "class", exported: true },
    { re: /export\s+const\s+([A-Za-z0-9_$]+)\s*=/g, kind: "const", exported: true },
    { re: /(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)/g, kind: "function", exported: false },
    { re: /class\s+([A-Za-z0-9_$]+)/g, kind: "class", exported: false },
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern.re)) {
      const name = match[1];
      if (!name || symbols.some((symbol) => symbol.name === name)) continue;
      const args = match[2] ? `(${String(match[2]).slice(0, 80)})` : "";
      symbols.push({
        name,
        kind: pattern.kind,
        exported: pattern.exported,
        signature: `${pattern.exported ? "export " : ""}${pattern.kind} ${name}${args}`,
      });
    }
  }
  return symbols.slice(0, 30);
}

function rankFile(path, symbols) {
  let rank = symbols.filter((symbol) => symbol.exported).length * 10 + symbols.length * 2;
  if (isEntryPoint(path)) rank += 25;
  if (/^(scripts|commands|skills|agents)\//.test(path.replace(/\\/g, "/"))) rank += 10;
  if (/test|spec|fixture/i.test(path)) rank += 4;
  return rank;
}

function isEntryPoint(path) {
  return /(^|\/)(index|main|cli|server|supervibe-status|supervibe-context-pack|build-code-index)\.[cm]?[jt]s$/.test(path.replace(/\\/g, "/"));
}

function inferTestLinks(path, files = []) {
  const base = path.replace(/\.[^.]+$/, "").split(/[\\/]/).pop();
  return files
    .map((file) => file.relPath || file.path)
    .filter((candidate) => candidate && /test|spec/i.test(candidate) && candidate.includes(base))
    .slice(0, 5);
}

function inferLanguage(path) {
  if (/\.mjs$|\.js$/.test(path)) return "javascript";
  if (/\.ts$|\.tsx$/.test(path)) return "typescript";
  if (/\.md$/.test(path)) return "markdown";
  return "text";
}

function estimateTokens(text = "") {
  return Math.max(1, Math.ceil(String(text).length / 4));
}

function stableHash(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  return Math.abs(hash).toString(16);
}
