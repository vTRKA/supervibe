import { existsSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";

const DEFAULT_MAX_SIMILARITY = 0.92;

export function validateScreenshotSimilarityEvidence(rootDir = process.cwd(), {
  prototypeSlug = "",
  manifestPath = null,
  maxSimilarity = DEFAULT_MAX_SIMILARITY,
} = {}) {
  const evidencePath = manifestPath
    ? normalizeRelPath(manifestPath)
    : `.supervibe/artifacts/prototypes/${prototypeSlug}/screenshot-similarity.json`;
  const absPath = join(rootDir, ...evidencePath.split("/"));
  if (!existsSync(absPath)) {
    return {
      pass: true,
      status: "not-provided",
      evidencePath,
      maxSimilarity,
      checkedPairs: 0,
      issues: [],
      warnings: [{
        code: "screenshot-similarity-evidence-missing",
        file: evidencePath,
        message: "screenshot similarity evidence was not provided; DOM fingerprint remains the enforced fallback",
      }],
    };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(readFileSync(absPath, "utf8"));
  } catch (error) {
    return {
      pass: false,
      status: "failed",
      evidencePath,
      maxSimilarity,
      checkedPairs: 0,
      issues: [{
        code: "invalid-screenshot-similarity-json",
        file: evidencePath,
        message: error.message,
      }],
      warnings: [],
    };
  }

  const pairs = Array.isArray(parsed.pairs) ? parsed.pairs : [];
  const issues = [];
  for (const pair of pairs) {
    const similarity = Number(pair.similarity ?? pair.score);
    if (!Number.isFinite(similarity)) {
      issues.push(issue("invalid-screenshot-similarity-score", evidencePath, `${pair.left || "left"} vs ${pair.right || "right"} missing numeric similarity`));
      continue;
    }
    if (similarity > maxSimilarity) {
      issues.push(issue("screenshot-variants-too-similar", evidencePath, `${pair.left || "left"} vs ${pair.right || "right"} similarity ${similarity} exceeds ${maxSimilarity}`));
    }
  }

  return {
    pass: issues.length === 0,
    status: issues.length ? "failed" : "passed",
    evidencePath,
    maxSimilarity,
    checkedPairs: pairs.length,
    issues,
    warnings: [],
  };
}

function issue(code, file, message) {
  return { code, file, message };
}

function normalizeRelPath(path = "") {
  return String(path || "").split(sep).join("/").replace(/^\.\//, "");
}
