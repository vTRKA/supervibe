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
  const expectedVariantSet = new Set(expectedVariantIds);
  const observedPairKeys = new Set();
  const duplicatePairKeys = new Set();
  for (const pair of pairs) {
    const left = String(pair.left || "").trim();
    const right = String(pair.right || "").trim();
    let pairValid = true;
    for (const side of ["left", "right"]) {
      const id = String(pair[side] || "").trim();
      if (!id) {
        issues.push(issue("missing-screenshot-variant-id", evidencePath, `pair is missing ${side} variant id`));
        pairValid = false;
      } else if (expectedVariantSet.size && !expectedVariantSet.has(id)) {
        issues.push(issue("screenshot-variant-not-in-manifest", evidencePath, `${side} variant ${id} is not present in variant-manifest.json`));
        pairValid = false;
      }
    }
    if (left && right && left === right) {
      issues.push(issue("self-screenshot-variant-pair", evidencePath, `${left} cannot be compared to itself`));
      pairValid = false;
    }
    if (pairValid && left && right) {
      const key = pairKey(left, right);
      if (observedPairKeys.has(key)) {
        if (!duplicatePairKeys.has(key)) {
          issues.push(issue("duplicate-screenshot-variant-pair", evidencePath, `${formatPairKey(key)} appears more than once`));
        }
        duplicatePairKeys.add(key);
      } else {
        observedPairKeys.add(key);
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
  const requiredPairKeys = expectedPairKeys(expectedVariantIds);
  const missingPairKeys = requiredPairKeys.filter((key) => !observedPairKeys.has(key));
  if (missingPairKeys.length > 0) {
    issues.push(issue(
      "missing-screenshot-variant-pairs",
      evidencePath,
      `missing screenshot similarity pairs: ${missingPairKeys.map(formatPairKey).slice(0, 10).join(", ")}${missingPairKeys.length > 10 ? ", ..." : ""}`,
    ));
  }

  return {
    pass: issues.length === 0,
    status: issues.length ? "failed" : "passed",
    evidencePath,
    maxSimilarity,
    checkedPairs: observedPairKeys.size,
    coveredPairs: observedPairKeys.size,
    rawPairs: pairs.length,
    expectedPairs: requiredPairKeys.length,
    missingPairs: missingPairKeys.map(formatPairKey),
    duplicatePairs: [...duplicatePairKeys].map(formatPairKey),
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
  if (!prototypeSlug) return [];
  const manifestPath = join(rootDir, ".supervibe", "artifacts", "prototypes", prototypeSlug, "variant-manifest.json");
  if (!existsSync(manifestPath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
    return (Array.isArray(parsed.variants) ? parsed.variants : [])
      .map((variant) => String(variant.id || "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function expectedPairKeys(variantIds = []) {
  const ids = variantIds.filter(Boolean);
  const keys = [];
  for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
      keys.push(pairKey(ids[leftIndex], ids[rightIndex]));
    }
  }
  return keys;
}

function pairKey(left = "", right = "") {
  return [String(left), String(right)].sort().join("::");
}

function formatPairKey(key = "") {
  return String(key).split("::").join(" vs ");
}
