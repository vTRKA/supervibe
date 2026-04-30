import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { detectFileLocalContractDrift } from "./supervibe-file-local-contracts.mjs";

export function detectAnchorDrift({
  anchors = [],
  files = {},
  symbols = [],
  summaries = [],
  contracts = [],
  fileSnapshots = {},
} = {}) {
  const issues = [];
  const seen = new Set();
  const symbolByFile = groupBy(symbols, (symbol) => symbol.filePath || symbol.path);

  for (const anchor of anchors) {
    if (seen.has(anchor.anchorId)) {
      issues.push(issue("duplicate-anchor-id", "risky", `duplicate anchor id ${anchor.anchorId}`, { anchorId: anchor.anchorId }));
    }
    seen.add(anchor.anchorId);

    if (!(anchor.filePath in files) && !(anchor.filePath in fileSnapshots)) {
      issues.push(issue("anchor-file-missing", "safe", `anchor ${anchor.anchorId} points to missing file ${anchor.filePath}`, { anchorId: anchor.anchorId, filePath: anchor.filePath }));
      continue;
    }
    if (anchor.symbolName) {
      const names = new Set((symbolByFile.get(anchor.filePath) || []).map((symbol) => symbol.name));
      if (names.size > 0 && !names.has(anchor.symbolName)) {
        issues.push(issue("anchor-symbol-renamed", "risky", `anchor ${anchor.anchorId} symbol ${anchor.symbolName} was not found`, { anchorId: anchor.anchorId, symbolName: anchor.symbolName }));
      } else if (names.size === 0 && files[anchor.filePath] && !new RegExp(`\\b${escapeRegExp(anchor.symbolName)}\\b`).test(files[anchor.filePath])) {
        issues.push(issue("anchor-symbol-renamed", "risky", `anchor ${anchor.anchorId} symbol ${anchor.symbolName} was not found`, { anchorId: anchor.anchorId, symbolName: anchor.symbolName }));
      }
    }
    if (!anchor.verificationRefs?.length) {
      issues.push(issue("anchor-verification-missing", "safe", `anchor ${anchor.anchorId} has no verification refs`, { anchorId: anchor.anchorId }));
    }
  }

  const knownFiles = new Set([...Object.keys(files), ...Object.keys(fileSnapshots)]);
  for (const summary of summaries.filter((item) => item.accepted !== false && item.rejected !== true)) {
    if (!knownFiles.has(summary.filePath)) {
      issues.push(issue("summary-for-deleted-code", "safe", `summary ${summary.summaryId} points to deleted file ${summary.filePath}`, { summaryId: summary.summaryId, filePath: summary.filePath }));
    }
  }

  const contractDrift = detectFileLocalContractDrift({ contracts, fileSnapshots });
  for (const contractIssue of contractDrift.issues) {
    issues.push(issue("file-local-contract-drift", "risky", `file-local contract drift: ${contractIssue.code}`, contractIssue));
  }

  return {
    ok: issues.length === 0,
    issues,
    safeFixes: issues.filter((entry) => entry.fixType === "safe"),
    riskyFixes: issues.filter((entry) => entry.fixType === "risky"),
    nextAction: issues.length ? "run anchor doctor fix for derived index only, then review risky source/comment changes manually" : "anchor index is current",
  };
}

export async function fixDerivedAnchorIndex({
  rootDir = process.cwd(),
  anchors = [],
  outPath = null,
} = {}) {
  const target = outPath || join(rootDir, ".claude", "memory", "anchors", "semantic-anchor-index.json");
  await mkdir(dirname(target), { recursive: true });
  const backupPath = `${target}.bak`;
  try {
    await copyFile(target, backupPath);
  } catch {
    await writeFile(backupPath, `${JSON.stringify({ anchors: [] }, null, 2)}\n`, "utf8");
  }
  const index = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    anchors,
    source: "derived-index",
  };
  await writeFile(target, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  return {
    changed: true,
    outPath: target,
    backupPath,
    sourceCommentsModified: false,
  };
}

export async function readDerivedAnchorIndex(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { schemaVersion: 1, anchors: [] };
    throw error;
  }
}

export function formatAnchorDriftReport(report = {}) {
  return [
    "SUPERVIBE_ANCHOR_DRIFT",
    `OK: ${Boolean(report.ok)}`,
    `ISSUES: ${(report.issues || []).length}`,
    `SAFE_FIXES: ${(report.safeFixes || []).length}`,
    `RISKY_FIXES: ${(report.riskyFixes || []).length}`,
    ...((report.issues || []).map((entry) => `- ${entry.code}:${entry.fixType} ${entry.message}`)),
    `NEXT_ACTION: ${report.nextAction || "none"}`,
  ].join("\n");
}

function issue(code, fixType, message, extra = {}) {
  return { code, fixType, message, ...extra };
}

function groupBy(values = [], keyFn) {
  const map = new Map();
  for (const value of values) {
    const key = keyFn(value);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  }
  return map;
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
