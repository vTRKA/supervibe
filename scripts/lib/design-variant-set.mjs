import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import {
  DESIGN_DIVERSITY_AXES,
  STRUCTURAL_DIVERSITY_AXES,
  scoreVariantPair,
} from "./design-diversity-benchmark.mjs";
import {
  hasFeedbackOverlayMarker,
  validateFeedbackPayloadBinding,
} from "./design-feedback-payload-validator.mjs";
import {
  compareLayoutFingerprints,
  extractDesignLayoutFingerprint,
} from "./design-layout-fingerprint.mjs";
import {
  validateScreenshotSimilarityEvidence,
} from "./design-screenshot-similarity.mjs";

const DEFAULT_MIN_CHANGED_AXES = 3;
const DEFAULT_MIN_STRUCTURAL_AXES = 1;
const REQUIRED_OLD_PROTOTYPE_SIGNALS = Object.freeze(["tasks", "approvals", "memory", "skills", "automations"]);

export function buildDesignAcceptanceContract({
  brief = "",
  slug = "",
  target = "unknown",
  referenceSources = [],
  wizard = null,
} = {}) {
  const text = String(brief || "");
  const normalized = text.toLowerCase();
  const requestedVariantCount = requestedVariantCountFromWizard(wizard)
    || requestedVariantCountFromText(text)
    || 1;
  const refs = extractReferenceSources(text, referenceSources);
  const oldPrototypeEvidenceRequired = refs.some((source) => /old|prototype|screen-chat/i.test(source.value))
    || /old\s+prototypes?|стар(ые|ых)\s+прототип|screen-chat/i.test(normalized);
  const feedbackOverlayPerVariant = /feedback\s+overlay|feedback-overlay|фидбек|оверле|overlay/i.test(text);
  const darkThemeRequired = /dark\s+theme|темн|светл[а-я\s]+не\s+поощр/i.test(text);
  const lightThemeDiscouraged = /light\s+themes?\s+(?:discouraged|not\s+encouraged)|светл[а-я\s]+не\s+поощр/i.test(text);
  const hiddenNavigation = /hide\s+navigation|hidden\s+nav|navigation\s+under\s+a\s+button|спрят[а-я]+\s+навигац|навигац[а-я\s]+кноп/i.test(text);
  const floatingDrawers = /floating\s+drawers?|парящ[а-я\s]+дровер|drawer/i.test(text);
  const unifiedChat = /common\s+chat|single\s+chat|without\s+choosing\s+agents|общий\s+чат|без\s+выбора\s+агент/i.test(text);
  const chatWindowsDiscouraged = /chat[s]?\s+in\s+windows?\s+(?:discouraged|not\s+encouraged)|чаты?\s+в\s+окн[а-я\s]+не\s+поощр/i.test(text);
  const fullscreenAppScreen = /1\s*(?::|to)\s*1|fullscreen|full-screen|app\s+screen|как\s+в\s+прилож/i.test(text);
  const separateFullscreenArtifacts = requestedVariantCount > 1
    && (/different|разн|separate|отдельн|variant/i.test(text) || fullscreenAppScreen);
  const primarySwitcherForbidden = requestedVariantCount > 1;

  return {
    schemaVersion: 1,
    slug: slug || null,
    target,
    requestedVariantCount,
    separateFullscreenArtifacts,
    feedbackOverlayPerVariant,
    oldPrototypeEvidenceRequired,
    darkThemeRequired,
    lightThemeDiscouraged,
    hiddenNavigation,
    floatingDrawers,
    unifiedChat,
    chatWindowsDiscouraged,
    fullscreenAppScreen,
    primarySwitcherForbidden,
    referenceSources: refs,
    oldPrototypeSignalsRequired: oldPrototypeEvidenceRequired ? [...REQUIRED_OLD_PROTOTYPE_SIGNALS] : [],
    acceptanceCriteria: acceptanceCriteriaFor({
      requestedVariantCount,
      separateFullscreenArtifacts,
      feedbackOverlayPerVariant,
      oldPrototypeEvidenceRequired,
      darkThemeRequired,
      hiddenNavigation,
      floatingDrawers,
      unifiedChat,
      chatWindowsDiscouraged,
      fullscreenAppScreen,
      primarySwitcherForbidden,
    }),
  };
}

export function buildDesignVariantSet({
  slug = "",
  acceptanceContract = {},
} = {}) {
  const safeSlug = sanitizePathPart(slug || acceptanceContract.slug || "design-run");
  const requestedVariantCount = Math.max(1, Math.trunc(Number(acceptanceContract.requestedVariantCount || 1)));
  const active = requestedVariantCount > 1;
  const base = `.supervibe/artifacts/prototypes/${safeSlug}`;
  if (!active) {
    return {
      schemaVersion: 1,
      active: false,
      slug: safeSlug,
      requestedVariantCount,
      variants: [],
      manifestPath: `${base}/variant-manifest.json`,
      previewManifestPath: `${base}/preview-manifest.json`,
      diversityReportPath: `${base}/diversity-report.json`,
      primarySwitcherForbidden: false,
    };
  }

  const variants = [];
  for (let index = 0; index < requestedVariantCount; index += 1) {
    const id = `variant-${index + 1}`;
    variants.push({
      id,
      label: `Variant ${index + 1}`,
      artifactPath: `${base}/variants/${id}/index.html`,
      feedbackTargetId: `${safeSlug}:${id}`,
      reviewArtifacts: {
        polish: `${base}/_reviews/${id}-polish.md`,
        a11y: `${base}/_reviews/${id}-a11y.md`,
      },
      fullscreen: true,
      primaryArtifact: true,
    });
  }

  return {
    schemaVersion: 1,
    active: true,
    slug: safeSlug,
    requestedVariantCount,
    variants,
    manifestPath: `${base}/variant-manifest.json`,
    previewManifestPath: `${base}/preview-manifest.json`,
    diversityReportPath: `${base}/diversity-report.json`,
    separateArtifactsRequired: acceptanceContract.separateFullscreenArtifacts !== false,
    feedbackOverlayRequired: acceptanceContract.feedbackOverlayPerVariant === true,
    oldPrototypeEvidenceRequired: acceptanceContract.oldPrototypeEvidenceRequired === true,
    primarySwitcherForbidden: acceptanceContract.primarySwitcherForbidden !== false,
    oldPrototypeSignalsRequired: acceptanceContract.oldPrototypeSignalsRequired || [],
  };
}

export function validateDesignVariantSet(rootDir = process.cwd(), {
  slug = "",
  requestedVariantCount = null,
  acceptanceContract = null,
  minChangedAxes = DEFAULT_MIN_CHANGED_AXES,
  minChangedStructuralAxes = DEFAULT_MIN_STRUCTURAL_AXES,
} = {}) {
  const contract = acceptanceContract || {};
  const safeSlug = slug ? sanitizePathPart(slug) : "";
  const requested = requestedVariantCountFromOption(requestedVariantCount)
    || requestedVariantCountFromOption(contract.requestedVariantCount)
    || null;
  const prototypeRoot = safeSlug ? join(rootDir, ".supervibe", "artifacts", "prototypes", safeSlug) : null;
  const manifestRelPath = safeSlug ? `.supervibe/artifacts/prototypes/${safeSlug}/variant-manifest.json` : null;
  const manifestPath = manifestRelPath ? join(rootDir, ...manifestRelPath.split("/")) : null;
  const issues = [];
  const warnings = [];

  if (!safeSlug) {
    return validateAllVariantSets(rootDir, { minChangedAxes, minChangedStructuralAxes });
  }

  if (!manifestPath || !existsSync(manifestPath)) {
    if (requested && requested > 1) {
      issues.push(issue("missing-variant-manifest", manifestRelPath, `requested ${requested} separate variants but variant-manifest.json is missing`));
    }
    const rootIndex = prototypeRoot ? join(prototypeRoot, "index.html") : null;
    if (rootIndex && existsSync(rootIndex) && isPrimarySwitcherShell(readText(rootIndex))) {
      issues.push(issue("primary-switcher-shell", rel(rootDir, rootIndex), "one switcher/comparison shell cannot satisfy an explicit multi-variant delivery"));
    }
    return result({
      slug: safeSlug,
      manifestPath: manifestRelPath,
      requestedVariantCount: requested || 0,
      checkedVariants: 0,
      issues,
      warnings,
      status: issues.length ? "failed" : "not-started",
    });
  }

  const manifest = readJsonFile(manifestPath, manifestRelPath, issues);
  if (!manifest) {
    return result({
      slug: safeSlug,
      manifestPath: manifestRelPath,
      requestedVariantCount: requested || 0,
      checkedVariants: 0,
      issues,
      warnings,
      status: "failed",
    });
  }

  const variants = Array.isArray(manifest.variants) ? manifest.variants : [];
  const expectedCount = requested
    || requestedVariantCountFromOption(manifest.requestedVariantCount)
    || variants.length;
  const overlayRequired = contract.feedbackOverlayPerVariant === true || manifest.feedbackOverlayRequired === true;
  const oldEvidenceRequired = contract.oldPrototypeEvidenceRequired === true || manifest.oldPrototypeEvidenceRequired === true;
  const separateRequired = contract.separateFullscreenArtifacts === true || manifest.separateArtifactsRequired === true || expectedCount > 1;
  const primarySwitcherForbidden = contract.primarySwitcherForbidden === true || manifest.primarySwitcherForbidden === true || expectedCount > 1;

  if (expectedCount > 1 && variants.length !== expectedCount) {
    issues.push(issue("variant-count-mismatch", manifestRelPath, `expected ${expectedCount} variants, found ${variants.length}`));
  }

  const rootIndex = prototypeRoot ? join(prototypeRoot, "index.html") : null;
  if (primarySwitcherForbidden && rootIndex && existsSync(rootIndex) && isPrimarySwitcherShell(readText(rootIndex))) {
    issues.push(issue("primary-switcher-shell", rel(rootDir, rootIndex), "primary artifact is a switcher/comparison shell instead of separate fullscreen variants"));
  }

  const artifactPaths = new Set();
  const feedbackTargets = new Set();
  const computedFingerprints = [];
  for (const [index, variant] of variants.entries()) {
    const variantId = variant.id || `variant-${index + 1}`;
    validateVariantShape(variant, variantId, manifestRelPath, issues);
    const artifactPath = normalizeRelPath(variant.artifactPath);
    if (!artifactPath) {
      issues.push(issue("missing-variant-artifact-path", manifestRelPath, `${variantId}: artifactPath is required`));
    } else {
      if (artifactPaths.has(artifactPath)) {
        issues.push(issue("duplicate-variant-artifact", artifactPath, `${variantId}: artifactPath must be unique`));
      }
      artifactPaths.add(artifactPath);
      const absArtifact = join(rootDir, ...artifactPath.split("/"));
      if (!existsSync(absArtifact)) {
        issues.push(issue("missing-variant-artifact", artifactPath, `${variantId}: variant artifact file is missing`));
      } else {
        const artifactText = readText(absArtifact);
        if (overlayRequired && !hasFeedbackOverlay(artifactText)) {
          issues.push(issue("missing-feedback-overlay", artifactPath, `${variantId}: feedback overlay marker is missing`));
        }
        if (overlayRequired && variant.feedbackTargetId) {
          const payload = validateFeedbackPayloadBinding(artifactText, {
            feedbackTargetId: variant.feedbackTargetId,
            overlayRequired: true,
          });
          if (!payload.targetPresent) {
            issues.push(issue("feedback-target-not-bound", artifactPath, `${variantId}: feedback target id is not present in the artifact`));
          }
          if (!payload.payloadBindsTarget || !payload.dispatchesPayload) {
            issues.push(issue("feedback-payload-not-bound", artifactPath, `${variantId}: feedback overlay must dispatch a payload with feedbackTargetId`));
          }
        }
        if (separateRequired && isPrimarySwitcherShell(artifactText)) {
          issues.push(issue("variant-is-switcher-shell", artifactPath, `${variantId}: variant artifact contains a switcher/comparison shell`));
        }
        computedFingerprints.push(extractDesignLayoutFingerprint(artifactText, { file: artifactPath }));
      }
    }

    if (!strongText(variant.feedbackTargetId)) {
      issues.push(issue("missing-feedback-target", manifestRelPath, `${variantId}: feedbackTargetId is required`));
    } else if (feedbackTargets.has(variant.feedbackTargetId)) {
      issues.push(issue("duplicate-feedback-target", manifestRelPath, `${variantId}: feedbackTargetId must be unique`));
    }
    feedbackTargets.add(variant.feedbackTargetId);

    if (separateRequired && variant.fullscreen !== true) {
      issues.push(issue("variant-not-fullscreen", manifestRelPath, `${variantId}: fullscreen must be true for explicit app-screen variants`));
    }
    if (oldEvidenceRequired && !hasOldPrototypeEvidence(variant)) {
      issues.push(issue("missing-old-prototype-evidence", manifestRelPath, `${variantId}: old prototype functional evidence is required`));
    }
  }

  for (let leftIndex = 0; leftIndex < variants.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < variants.length; rightIndex += 1) {
      const pair = scoreVariantPair(variants[leftIndex], variants[rightIndex]);
      if (pair.changedAxisCount < minChangedAxes) {
        issues.push(issue(
          "same-shell-variant-pair",
          manifestRelPath,
          `${pair.left} vs ${pair.right} changes ${pair.changedAxisCount}/${minChangedAxes} axes (${pair.changedAxes.join(", ") || "none"})`,
        ));
      }
      if (pair.changedStructuralAxisCount < minChangedStructuralAxes) {
        issues.push(issue(
          "same-structure-variant-pair",
          manifestRelPath,
          `${pair.left} vs ${pair.right} changes ${pair.changedStructuralAxisCount}/${minChangedStructuralAxes} structural axes (${pair.changedStructuralAxes.join(", ") || "none"})`,
        ));
      }
    }
  }

  const layoutComparison = compareLayoutFingerprints(computedFingerprints);
  if (expectedCount > 1 && computedFingerprints.length === variants.length) {
    for (const group of layoutComparison.duplicateShellGroups) {
      issues.push(issue(
        "duplicate-computed-layout-shell",
        manifestRelPath,
        `computed DOM layout shell is shared by ${group.count} variants: ${group.files.join(", ")}`,
      ));
    }
  }

  const screenshotSimilarity = expectedCount > 1
    ? validateScreenshotSimilarityEvidence(rootDir, { prototypeSlug: safeSlug })
    : null;
  if (screenshotSimilarity) {
    issues.push(...screenshotSimilarity.issues);
    const expectedPairs = expectedScreenshotPairCount(expectedCount);
    const coveredPairs = screenshotCoveredPairCount(screenshotSimilarity);
    if (screenshotSimilarity.status !== "passed" || coveredPairs < expectedPairs) {
      issues.push(issue(
        "missing-screenshot-similarity-evidence",
        screenshotSimilarity.evidencePath,
        `multi-variant validation requires screenshot similarity evidence for all requested variant pairs (${coveredPairs}/${expectedPairs})`,
      ));
    }
    warnings.push(...screenshotSimilarity.warnings);
  }

  return result({
    slug: safeSlug,
    manifestPath: manifestRelPath,
    requestedVariantCount: expectedCount || 0,
    checkedVariants: variants.length,
    issues,
    warnings,
    status: issues.length ? "failed" : "passed",
    evidenceStatus: {
      computedLayout: computedFingerprints.length === variants.length && variants.length > 0 ? "checked" : "partial",
      computedLayoutUniqueShells: layoutComparison.uniqueShellCount,
      screenshotSimilarity: screenshotSimilarity?.status || "not-required",
    },
  });
}

export function validateAllDesignVariantSets(rootDir = process.cwd(), options = {}) {
  return validateAllVariantSets(rootDir, options);
}

export function formatDesignVariantSetReport(result = {}) {
  const lines = [
    "SUPERVIBE_DESIGN_VARIANT_SET",
    `PASS: ${result.pass === true}`,
    `STATUS: ${result.status || "unknown"}`,
    `SLUG: ${result.slug || "none"}`,
    `MANIFEST: ${result.manifestPath || "none"}`,
    `REQUESTED_VARIANTS: ${result.requestedVariantCount || 0}`,
    `CHECKED_VARIANTS: ${result.checkedVariants || 0}`,
    `COMPUTED_LAYOUT_EVIDENCE: ${result.evidenceStatus?.computedLayout || "none"}`,
    `COMPUTED_LAYOUT_UNIQUE_SHELLS: ${result.evidenceStatus?.computedLayoutUniqueShells ?? 0}`,
    `SCREENSHOT_SIMILARITY_EVIDENCE: ${result.evidenceStatus?.screenshotSimilarity || "none"}`,
    `ISSUES: ${result.issues?.length || 0}`,
    `WARNINGS: ${result.warnings?.length || 0}`,
  ];
  for (const warning of result.warnings || []) {
    lines.push(`WARNING: ${warning.code} ${warning.file} - ${warning.message}`);
  }
  for (const item of result.issues || []) {
    lines.push(`ISSUE: ${item.code} ${item.file} - ${item.message}`);
  }
  return lines.join("\n");
}

function validateAllVariantSets(rootDir, options = {}) {
  const slugs = listVariantManifestSlugs(rootDir);
  if (slugs.length === 0) {
    return result({
      slug: null,
      manifestPath: null,
      requestedVariantCount: 0,
      checkedVariants: 0,
      issues: [],
      warnings: [],
      status: "not-started",
    });
  }
  const children = slugs.map((slug) => validateDesignVariantSet(rootDir, { ...options, slug }));
  const issues = children.flatMap((child) => child.issues || []);
  const warnings = children.flatMap((child) => child.warnings || []);
  return {
    schemaVersion: 1,
    pass: issues.length === 0,
    status: issues.length ? "failed" : "passed",
    slug: null,
    manifestPath: null,
    requestedVariantCount: children.reduce((sum, child) => sum + Number(child.requestedVariantCount || 0), 0),
    checkedVariants: children.reduce((sum, child) => sum + Number(child.checkedVariants || 0), 0),
    variantSets: children,
    issues,
    warnings,
  };
}

function requestedVariantCountFromWizard(wizard = null) {
  const value = wizard?.decisions?.creative_alternatives?.variantCount;
  return requestedVariantCountFromOption(value);
}

function requestedVariantCountFromText(text = "") {
  const value = String(text || "");
  const digitMatch = value.match(/(?:^|[^\d])([2-9]|10)\s+(?:[^\n.]{0,80})?(?:variants?|вариант)/i);
  if (digitMatch) return Number(digitMatch[1]);
  if (/\bfive\b(?:[^\n.]{0,80})?(?:variants?)/i.test(value) || /пять(?:[^\n.]{0,80})?вариант/i.test(value)) return 5;
  return null;
}

function requestedVariantCountFromOption(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 1 ? Math.trunc(count) : null;
}

function expectedScreenshotPairCount(variantCount) {
  const count = Number(variantCount);
  if (!Number.isFinite(count) || count <= 1) return 0;
  return Math.trunc(count * (count - 1) / 2);
}

function screenshotCoveredPairCount(screenshot = {}) {
  const count = Number(screenshot.coveredPairs ?? screenshot.uniquePairs ?? screenshot.checkedPairs ?? 0);
  return Number.isFinite(count) ? count : 0;
}

function extractReferenceSources(text = "", referenceSources = []) {
  const out = [];
  for (const source of Array.isArray(referenceSources) ? referenceSources : []) {
    if (!source) continue;
    if (typeof source === "string") out.push({ kind: "reference", value: source });
    else if (source.value) out.push({ kind: source.kind || "reference", value: String(source.value) });
  }
  const seen = new Set(out.map((source) => source.value));
  for (const match of String(text || "").matchAll(/file:\/\/\/[^\s)]+/gi)) {
    const value = decodeUrlish(match[0]);
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({ kind: "file-url", value });
  }
  for (const match of String(text || "").matchAll(/[A-Za-z]:[\\/][^\n\r,;]+/g)) {
    const value = match[0].trim().replace(/[.)]+$/, "");
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({ kind: "windows-path", value });
  }
  return out;
}

function acceptanceCriteriaFor(flags = {}) {
  const criteria = [];
  if (flags.requestedVariantCount === 5 && flags.separateFullscreenArtifacts) criteria.push("five-separate-fullscreen-artifacts");
  else if (flags.requestedVariantCount > 1 && flags.separateFullscreenArtifacts) criteria.push("separate-fullscreen-artifacts");
  if (flags.feedbackOverlayPerVariant) criteria.push("feedback-overlay-per-variant");
  if (flags.oldPrototypeEvidenceRequired) criteria.push("old-prototype-functional-evidence");
  if (flags.darkThemeRequired) criteria.push("dark-theme-required");
  if (flags.hiddenNavigation) criteria.push("navigation-hidden-under-button");
  if (flags.floatingDrawers) criteria.push("floating-drawers");
  if (flags.unifiedChat) criteria.push("unified-chat-no-agent-picker");
  if (flags.chatWindowsDiscouraged) criteria.push("no-chat-window-composition");
  if (flags.fullscreenAppScreen) criteria.push("one-to-one-app-screen");
  if (flags.primarySwitcherForbidden) criteria.push("no-primary-switcher-shell");
  return criteria;
}

function readJsonFile(path, relPath, issues) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    issues.push(issue("invalid-variant-manifest-json", relPath, `variant manifest is not valid JSON: ${error.message}`));
    return null;
  }
}

function validateVariantShape(variant = {}, variantId = "variant", file = "variant-manifest.json", issues = []) {
  for (const field of ["id", "label", "artifactPath", "feedbackTargetId", "differsBecause", "givesUp", "gains"]) {
    if (!strongText(variant[field])) {
      issues.push(issue("missing-variant-field", file, `${variantId}: ${field} is required`));
    }
  }
  for (const axis of DESIGN_DIVERSITY_AXES) {
    if (!strongText(variant.axes?.[axis])) {
      issues.push(issue("missing-diversity-axis", file, `${variantId}: axis ${axis} is required`));
    }
  }
  for (const axis of STRUCTURAL_DIVERSITY_AXES) {
    if (!strongText(variant.axes?.[axis])) {
      issues.push(issue("missing-structural-diversity-axis", file, `${variantId}: structural axis ${axis} is required`));
    }
  }
  for (const field of [
    "referencePacket",
    "screenshotPlan",
    "tokenNotes",
    "domLayoutSignature",
    "cssTokenSignature",
    "screenshotViewportPlan",
    "interactionMotionSignature",
  ]) {
    if (!strongText(variant.evidence?.[field])) {
      issues.push(issue("missing-variant-evidence", file, `${variantId}: evidence.${field} is required`));
    }
  }
}

function hasOldPrototypeEvidence(variant = {}) {
  const evidence = Array.isArray(variant.oldPrototypeEvidence)
    ? variant.oldPrototypeEvidence.join(" ")
    : String(variant.oldPrototypeEvidence || variant.evidence?.referencePacket || "");
  if (!strongText(evidence)) return false;
  const lower = evidence.toLowerCase();
  return REQUIRED_OLD_PROTOTYPE_SIGNALS.every((signal) => lower.includes(signal));
}

function hasFeedbackOverlay(text = "") {
  return hasFeedbackOverlayMarker(text) || /HAS_FEEDBACK\s*=\s*true/i.test(text);
}

function isPrimarySwitcherShell(text = "") {
  const value = String(text || "");
  return /role=["']tab|data-variant-switcher|variant-switcher|comparison-shell|switcher|переключател/i.test(value);
}

function listVariantManifestSlugs(rootDir) {
  const root = join(rootDir, ".supervibe", "artifacts", "prototypes");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .filter((entry) => {
      const manifest = join(root, entry.name, "variant-manifest.json");
      return existsSync(manifest) && statSync(manifest).isFile();
    })
    .map((entry) => entry.name)
    .sort();
}

function result({ slug, manifestPath, requestedVariantCount, checkedVariants, issues, warnings, status, evidenceStatus = null }) {
  return {
    schemaVersion: 1,
    pass: issues.length === 0,
    status,
    slug: slug || null,
    manifestPath: manifestPath || null,
    requestedVariantCount,
    checkedVariants,
    evidenceStatus,
    issues,
    warnings,
  };
}

function readText(path) {
  return readFileSync(path, "utf8");
}

function issue(code, file, message) {
  return { code, file, message };
}

function strongText(value) {
  const text = String(value ?? "").trim();
  return text.length >= 3 && !/^(tbd|todo|n\/a|none|null|undefined|same)$/i.test(text);
}

function sanitizePathPart(value = "") {
  return String(value || "design-run").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "design-run";
}

function normalizeRelPath(path = "") {
  return String(path || "").split(sep).join("/").replace(/^\.\//, "");
}

function rel(rootDir, path) {
  return normalizeRelPath(relative(rootDir, path));
}

function decodeUrlish(value) {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}
