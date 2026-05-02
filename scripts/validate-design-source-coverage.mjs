#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, stableDesignDataHash } from "./lib/design-intelligence-search.mjs";

const CORE_DOMAINS = Object.freeze([
  "product",
  "style",
  "color",
  "typography",
  "ux",
  "app-interface",
  "charts",
  "icons",
  "landing",
  "google-fonts",
  "react-performance",
  "ui-reasoning",
]);

const STACKS = Object.freeze([
  "angular",
  "astro",
  "flutter",
  "html-tailwind",
  "jetpack-compose",
  "laravel",
  "nextjs",
  "nuxt-ui",
  "nuxtjs",
  "react",
  "react-native",
  "shadcn",
  "svelte",
  "swiftui",
  "threejs",
  "vue",
]);

const SLIDES = Object.freeze([
  "backgrounds",
  "charts",
  "color-logic",
  "copy",
  "layout-logic",
  "layouts",
  "strategies",
  "typography",
]);

const COLLATERAL = Object.freeze([
  "cip-deliverables",
  "cip-industries",
  "cip-mockup-contexts",
  "cip-styles",
  "icon-styles",
  "logo-colors",
  "logo-industries",
  "logo-styles",
]);

const REFERENCE_CARDS = Object.freeze([
  "asset-and-collateral-reference.md",
  "brand-reference.md",
  "design-system-reference.md",
  "professional-ui-priority-reference.md",
  "slide-deck-reference.md",
  "ui-styling-reference.md",
]);

const FORBIDDEN_SOURCE_MARKERS = Object.freeze([
  new RegExp(["ui", "ux", "pro", "max"].join("-"), "i"),
  /github\.com/i,
]);

function issue(file, code, message) {
  return { file, code, message };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function ensurePatterns({ rootDir, file, patterns, issues }) {
  const absPath = join(rootDir, ...file.split("/"));
  if (!existsSync(absPath)) {
    issues.push(issue(file, "missing-file", `${file}: file not found`));
    return;
  }
  const text = readFileSync(absPath, "utf8");
  for (const pattern of patterns) {
    if (!pattern.test(text)) {
      issues.push(issue(file, "missing-source-coverage-text", `${file}: missing ${pattern}`));
    }
  }
}

function findDomain(manifest, id) {
  return manifest.domains.find((domain) => domain.id === id);
}

export function validateDesignSourceCoverage(rootDir = process.cwd()) {
  const issues = [];
  const manifestPath = join(rootDir, "skills", "design-intelligence", "data", "manifest.json");
  if (!existsSync(manifestPath)) {
    return {
      pass: false,
      checked: 0,
      issues: [issue("skills/design-intelligence/data/manifest.json", "missing-file", "manifest not found")],
    };
  }

  const manifest = readJson(manifestPath);
  if (manifest.sourceReference !== "local-design-intelligence-pack") {
    issues.push(issue("skills/design-intelligence/data/manifest.json", "wrong-source-reference", "sourceReference must be local-design-intelligence-pack"));
  }
  if (!manifest.commandPolicy?.includes("no new slash command")) {
    issues.push(issue("skills/design-intelligence/data/manifest.json", "missing-command-policy", "manifest must forbid a standalone design lookup command"));
  }

  for (const id of CORE_DOMAINS) {
    if (!findDomain(manifest, id)) {
      issues.push(issue("skills/design-intelligence/data/manifest.json", "missing-core-domain", `missing core domain ${id}`));
    }
  }
  for (const stack of STACKS) {
    if (!findDomain(manifest, `stack:${stack}`)) {
      issues.push(issue("skills/design-intelligence/data/manifest.json", "missing-stack-domain", `missing stack domain ${stack}`));
    }
  }
  for (const slide of SLIDES) {
    if (!findDomain(manifest, `slides:${slide}`)) {
      issues.push(issue("skills/design-intelligence/data/manifest.json", "missing-slide-domain", `missing slide domain ${slide}`));
    }
  }
  for (const item of COLLATERAL) {
    if (!findDomain(manifest, `collateral:${item}`)) {
      issues.push(issue("skills/design-intelligence/data/manifest.json", "missing-collateral-domain", `missing collateral domain ${item}`));
    }
  }

  for (const domain of manifest.domains ?? []) {
    for (const field of ["canonicalSourceTree", "sourcePath", "packagedAssetPath"]) {
      const value = domain[field];
      if (!value) continue;
      for (const pattern of FORBIDDEN_SOURCE_MARKERS) {
        if (pattern.test(value)) {
          issues.push(issue("skills/design-intelligence/data/manifest.json", "non-neutral-source-path", `${domain.id}.${field} contains ${pattern}`));
        }
      }
    }

    const absPath = join(rootDir, ...domain.importedPath.split("/"));
    if (!existsSync(absPath)) {
      issues.push(issue(domain.importedPath, "missing-imported-data", `${domain.id}: imported data missing`));
      continue;
    }
    const text = readFileSync(absPath, "utf8");
    const rows = parseCsv(text).length;
    const sha256 = stableDesignDataHash(text);
    if (rows !== domain.rows) {
      issues.push(issue(domain.importedPath, "row-count-mismatch", `${domain.id}: expected ${domain.rows}, got ${rows}`));
    }
    if (sha256 !== domain.sha256) {
      issues.push(issue(domain.importedPath, "checksum-mismatch", `${domain.id}: checksum mismatch`));
    }
  }

  for (const asset of manifest.excludedAssets ?? []) {
    for (const pattern of FORBIDDEN_SOURCE_MARKERS) {
      if (pattern.test(asset.path)) {
        issues.push(issue("skills/design-intelligence/data/manifest.json", "non-neutral-excluded-path", `${asset.path} contains ${pattern}`));
      }
    }
  }
  for (const expected of ["design.csv", "draft.csv", "canvas-fonts", "installer-src", "preview"]) {
    if (!(manifest.excludedAssets ?? []).some((asset) => asset.path.includes(expected))) {
      issues.push(issue("skills/design-intelligence/data/manifest.json", "missing-excluded-family", `excluded assets must mention ${expected}`));
    }
  }

  for (const card of REFERENCE_CARDS) {
    const rel = `skills/design-intelligence/references/${card}`;
    if (!existsSync(join(rootDir, ...rel.split("/")))) {
      issues.push(issue(rel, "missing-reference-card", `${rel}: reference card missing`));
    }
  }

  ensurePatterns({
    rootDir,
    file: "references/design-intelligence-source-coverage.md",
    patterns: [
      /Design Intelligence Source Coverage/i,
      /Main design CSV data/i,
      /Stack CSV data/i,
      /Slide decision CSV data/i,
      /Logo, icon, CIP collateral CSV data/i,
      /skills\/design-intelligence\/data\/stacks/i,
      /skills\/design-intelligence\/data\/slides/i,
      /skills\/design-intelligence\/data\/collateral/i,
      /skills\/design-intelligence\/references/i,
      /Low-signal design\/draft backup files/i,
      /Font binaries and font license sidecars/i,
    ],
    issues,
  });

  return {
    pass: issues.length === 0,
    checked: (manifest.domains ?? []).length + REFERENCE_CARDS.length + 1,
    issues,
  };
}

export function formatDesignSourceCoverageReport(result) {
  const lines = [
    "SUPERVIBE_DESIGN_SOURCE_COVERAGE",
    `PASS: ${result.pass}`,
    `CHECKED: ${result.checked}`,
    `ISSUES: ${result.issues.length}`,
  ];
  for (const item of result.issues) {
    lines.push(`ISSUE: ${item.code} ${item.file} - ${item.message}`);
  }
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateDesignSourceCoverage(process.cwd());
  console.log(formatDesignSourceCoverageReport(result));
  process.exit(result.pass ? 0 : 1);
}
