import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const DESIGN_DIVERSITY_AXES = Object.freeze([
  "palette",
  "typography",
  "motion",
  "imagery",
  "hierarchy",
  "density",
  "composition",
  "interaction",
]);

const REQUIRED_VARIANT_FIELDS = Object.freeze([
  "id",
  "label",
  "differsBecause",
  "givesUp",
  "gains",
]);

const REQUIRED_EVIDENCE_FIELDS = Object.freeze([
  "referencePacket",
  "screenshotPlan",
  "tokenNotes",
]);

const DEFAULT_OPTIONS = Object.freeze({
  minCases: 5,
  minVariantsPerCase: 3,
  minChangedAxes: 3,
});

export function validateDesignDiversityFixture(fixture = {}, options = {}) {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  const issues = [];
  const cases = Array.isArray(fixture.cases) ? fixture.cases : [];

  if (fixture.schemaVersion !== 1) {
    issues.push(issue("fixture", "schema-version", "schemaVersion must be 1"));
  }

  if (cases.length < settings.minCases) {
    issues.push(issue("fixture", "too-few-cases", `expected at least ${settings.minCases} benchmark cases`));
  }

  for (const [caseIndex, item] of cases.entries()) {
    validateCase(item, caseIndex, settings, issues);
  }

  return {
    pass: issues.length === 0,
    checkedCases: cases.length,
    issues,
  };
}

export function scoreVariantPair(left = {}, right = {}, axes = DESIGN_DIVERSITY_AXES) {
  const changedAxes = [];
  for (const axis of axes) {
    const leftValue = normalizeAxisValue(left.axes?.[axis]);
    const rightValue = normalizeAxisValue(right.axes?.[axis]);
    if (leftValue && rightValue && leftValue !== rightValue) changedAxes.push(axis);
  }
  return {
    left: left.id || "left",
    right: right.id || "right",
    changedAxes,
    changedAxisCount: changedAxes.length,
  };
}

export function loadDesignDiversityFixture(rootDir, relPath = "tests/fixtures/design-diversity-benchmark.json") {
  const fixturePath = join(rootDir, ...relPath.split("/"));
  if (!existsSync(fixturePath)) {
    return {
      fixturePath,
      fixture: null,
      error: "missing-fixture",
    };
  }
  try {
    return {
      fixturePath,
      fixture: JSON.parse(readFileSync(fixturePath, "utf8")),
      error: null,
    };
  } catch (error) {
    return {
      fixturePath,
      fixture: null,
      error: `invalid-json: ${error.message}`,
    };
  }
}

function validateCase(item = {}, caseIndex, settings, issues) {
  const caseId = item.id || `case-${caseIndex + 1}`;
  if (!item.id) issues.push(issue(caseId, "missing-case-id", "case id is required"));
  if (!strongText(item.brief)) issues.push(issue(caseId, "missing-brief", "case brief must be concrete"));
  if (!strongText(item.target)) issues.push(issue(caseId, "missing-target", "case target is required"));
  if (!strongText(item.intent)) issues.push(issue(caseId, "missing-intent", "case intent is required"));

  const variants = Array.isArray(item.variants) ? item.variants : [];
  if (variants.length < settings.minVariantsPerCase) {
    issues.push(issue(caseId, "too-few-variants", `expected at least ${settings.minVariantsPerCase} variants`));
  }

  for (const [variantIndex, variant] of variants.entries()) {
    validateVariant(caseId, variant, variantIndex, issues);
  }

  for (let leftIndex = 0; leftIndex < variants.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < variants.length; rightIndex += 1) {
      const pair = scoreVariantPair(variants[leftIndex], variants[rightIndex]);
      if (pair.changedAxisCount < settings.minChangedAxes) {
        issues.push(issue(
          caseId,
          "same-shell-variant-pair",
          `${pair.left} vs ${pair.right} changes ${pair.changedAxisCount}/${settings.minChangedAxes} required axes (${pair.changedAxes.join(", ") || "none"})`,
        ));
      }
    }
  }
}

function validateVariant(caseId, variant = {}, variantIndex, issues) {
  const variantId = variant.id || `${caseId}/variant-${variantIndex + 1}`;
  for (const field of REQUIRED_VARIANT_FIELDS) {
    if (!strongText(variant[field])) {
      issues.push(issue(variantId, "missing-variant-field", `variant must provide ${field}`));
    }
  }

  for (const axis of DESIGN_DIVERSITY_AXES) {
    if (!strongText(variant.axes?.[axis])) {
      issues.push(issue(variantId, "missing-diversity-axis", `variant axis ${axis} is required`));
    }
  }

  for (const field of REQUIRED_EVIDENCE_FIELDS) {
    if (!strongText(variant.evidence?.[field])) {
      issues.push(issue(variantId, "missing-evidence-field", `variant evidence must provide ${field}`));
    }
  }
}

function normalizeAxisValue(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean).sort().join("|");
  return String(value || "").trim().toLowerCase();
}

function strongText(value) {
  const text = normalizeAxisValue(value);
  return text.length >= 3 && !/^(tbd|todo|n\/a|none|null|undefined|same)$/i.test(text);
}

function issue(subject, code, message) {
  return { subject, code, message };
}
