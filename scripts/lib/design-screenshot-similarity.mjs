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
  const expectedVariantIds = variantIdsForPrototype(rootDir, prototypeSlug);
  for (const pair of pairs) {
    for (const side of ["left", "right"]) {
      const id = String(pair[side] || "").trim();
      if (!id) {
        issues.push(issue("missing-screenshot-variant-id", evidencePath, `pair is missing ${side} variant id`));
      } else if (expectedVariantIds.size && !expectedVariantIds.has(id)) {
        issues.push(issue("screenshot-variant-not-in-manifest", evidencePath, `${side} variant ${id} is not present in variant-manifest.json`));
      }
    }
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

function variantIdsForPrototype(rootDir, prototypeSlug = "") {
  if (!prototypeSlug) return new Set();
  const manifestPath = join(rootDir, ".supervibe", "artifacts", "prototypes", prototypeSlug, "variant-manifest.json");
  if (!existsSync(manifestPath)) return new Set();
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
    return new Set((Array.isArray(parsed.variants) ? parsed.variants : [])
      .map((variant) => String(variant.id || "").trim())
      .filter(Boolean));
  } catch {
    return new Set();
  }
}
