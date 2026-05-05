import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";

const FRONTEND_SCAN_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".supervibe",
  ".claude",
  ".codex",
  ".cursor",
  ".gemini",
  ".opencode",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".cache",
]);

const FRONTEND_TARGET_CHOICES = Object.freeze([
  {
    id: "next-app",
    label: "Next app on Turbopack",
    tradeoff: "Use one Next.js app; Vite is ignored as a frontend target unless it is explicitly tooling-only.",
    bundler: "turbopack",
    recommended: true,
  },
  {
    id: "vite-spa",
    label: "Vite SPA",
    tradeoff: "Use one standalone React/Vite SPA and defer Next.js agents.",
    bundler: "vite",
  },
  {
    id: "monorepo-two-frontends",
    label: "Two frontends",
    tradeoff: "Use separate explicit app directories for Next.js and Vite.",
    bundler: "mixed",
  },
  {
    id: "tooling-only",
    label: "Vite tooling only",
    tradeoff: "Keep the app target unchanged; classify Vite as a build/test/tooling dependency.",
    bundler: "existing",
  },
]);

export function collectFrontendPackageEvidence({ rootDir = process.cwd(), maxDepth = 4 } = {}) {
  const records = [];
  for (const packagePath of findPackageJsonFiles(rootDir, { maxDepth })) {
    const pkg = readJson(packagePath);
    if (!pkg) continue;
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const tags = frontendTagsFromDependencies(deps);
    if (tags.length === 0) continue;
    records.push({
      path: toRel(rootDir, packagePath),
      packageName: pkg.name || basename(packagePath),
      tags,
      dependencies: Object.keys(deps).filter((name) => frontendTagsFromDependencies({ [name]: deps[name] }).length > 0).sort(),
    });
  }
  return records;
}

export function resolveFrontendTarget({
  tags = [],
  facts = [],
  requestText = "",
  appChoice = "",
  previousChoice = null,
  source = "resolver",
} = {}) {
  const tagSet = new Set([...tags].map(String).filter(Boolean));
  const explicitChoice = normalizeFrontendTargetChoice(appChoice);
  const requestChoice = normalizeFrontendTargetChoice(inferFrontendTargetChoiceFromText(requestText));
  const previous = normalizeFrontendTargetChoice(previousChoice);
  let id = explicitChoice || requestChoice || previous || "";
  let choiceSource = explicitChoice
    ? "explicit"
    : requestChoice
      ? "request-text"
      : previous
        ? "previous-state"
        : "manifest-policy";
  const hasNext = tagSet.has("nextjs");
  const hasVite = tagSet.has("vite");
  const hasSeparateFrontendContext = tagSet.has("tauri") || tagSet.has("chrome-extension");
  const policyNotes = [];
  const driftWarnings = [];
  const ignoredStackTags = [];
  const toolingOnlyTags = [];

  if (!id && hasNext && hasVite && !hasSeparateFrontendContext) {
    id = "next-app";
    choiceSource = "policy-default";
    policyNotes.push("Next.js + Vite evidence defaults to a Next app because Next 16 uses Turbopack for dev/build; Vite is not the app bundler.");
    driftWarnings.push({
      code: "nextjs-vite-defaulted-next-app",
      message: "Next.js and Vite were both detected; defaulted to Next app on Turbopack.",
      options: FRONTEND_TARGET_CHOICES.map(copyChoice),
    });
  } else if (!id && hasNext) {
    id = "next-app";
  } else if (!id && hasVite) {
    id = "vite-spa";
  }

  let effectiveId = id;
  if (id === "tooling-only") {
    effectiveId = hasNext || previous === "next-app" ? "next-app" : hasVite ? "vite-spa" : previous || "";
    if (hasVite) toolingOnlyTags.push("vite");
    choiceSource = explicitChoice ? "explicit-tooling-only" : choiceSource;
  }

  const activeTags = new Set(tagSet);
  if (effectiveId === "next-app" && activeTags.delete("vite")) ignoredStackTags.push("vite");
  if (effectiveId === "vite-spa" && activeTags.delete("nextjs")) ignoredStackTags.push("nextjs");
  if (effectiveId === "monorepo-two-frontends") {
    activeTags.add("nextjs");
    activeTags.add("vite");
  }

  if (previous === "next-app" && hasVite && effectiveId === "next-app") {
    driftWarnings.push({
      code: "vite-detected-in-next-app",
      message: "Vite evidence appeared while Genesis state says next-app; classify it as accidental, tooling-only, or a separate frontend before changing stack agents.",
      options: FRONTEND_TARGET_CHOICES.map(copyChoice),
    });
  }
  if (previous === "vite-spa" && hasNext && effectiveId === "vite-spa") {
    driftWarnings.push({
      code: "next-detected-in-vite-spa",
      message: "Next.js evidence appeared while Genesis state says vite-spa; treat it as migration/new app evidence, not an automatic stack switch.",
      options: FRONTEND_TARGET_CHOICES.map(copyChoice),
    });
  }

  const bundler = bundlerForTarget(effectiveId);
  const resolution = {
    id: effectiveId || null,
    source: choiceSource,
    rawChoice: id || null,
    bundler,
    ignoredStackTags,
    toolingOnlyTags,
    activeStackTags: [...activeTags].sort(),
    choices: FRONTEND_TARGET_CHOICES.map(copyChoice),
    policy: effectiveId === "next-app"
      ? "Next 16 uses Turbopack by default for next dev and next build; Vite is only valid as separate SPA/tooling evidence."
      : effectiveId === "vite-spa"
        ? "Vite is the active frontend bundler for a standalone SPA; Next.js is deferred unless an explicit migration/new app is requested."
        : effectiveId === "monorepo-two-frontends"
          ? "Next.js and Vite are separate frontend targets and must use explicit app directories."
          : "No frontend target resolved.",
    policyNotes,
    driftWarnings,
    evidence: {
      tags: [...tagSet].sort(),
      facts: (facts || []).map((item) => ({
        source: item.source || item.path || "unknown",
        name: item.name || item.packageName || "",
        tag: item.tag || "",
        tags: item.tags || undefined,
      })),
    },
    resolver: source,
  };
  return resolution;
}

export function applyFrontendTargetResolution(fingerprint = {}, resolution = null) {
  if (!resolution?.id) return fingerprint;
  const decision = {
    id: resolution.id,
    source: resolution.source || "resolved",
    bundler: resolution.bundler || bundlerForTarget(resolution.id),
    ignoredStackTags: [...(resolution.ignoredStackTags || [])],
    toolingOnlyTags: [...(resolution.toolingOnlyTags || [])],
    policy: resolution.policy,
  };
  return {
    ...fingerprint,
    tags: [...(resolution.activeStackTags || fingerprint.tags || [])].sort(),
    appChoice: decision,
    frontendTarget: resolution,
    decisions: {
      ...(fingerprint.decisions || {}),
      frontendAppChoice: decision,
      frontendTarget: resolution,
    },
  };
}

export function readGenesisFrontendDecision(rootDir = process.cwd()) {
  const path = join(rootDir, ".supervibe", "memory", "genesis", "state.json");
  if (!existsSync(path)) return null;
  try {
    const state = JSON.parse(readFileSync(path, "utf8"));
    return state.frontendTarget?.id
      || state.appChoice?.id
      || state.generateAppsStep?.appChoice?.id
      || state.fingerprint?.appChoice?.id
      || null;
  } catch {
    return null;
  }
}

export function normalizeFrontendTargetChoice(value = "") {
  const id = value && typeof value === "object" ? value.id : value;
  const normalized = String(id || "").trim().toLowerCase();
  if (["next-app", "next", "nextjs", "next.js"].includes(normalized)) return "next-app";
  if (["vite-spa", "vite", "spa"].includes(normalized)) return "vite-spa";
  if (["monorepo-two-frontends", "two-frontends", "2-frontends", "monorepo", "both"].includes(normalized)) return "monorepo-two-frontends";
  if (["tooling-only", "vite-tooling", "tooling"].includes(normalized)) return "tooling-only";
  return "";
}

function inferFrontendTargetChoiceFromText(text = "") {
  const value = String(text || "").toLowerCase();
  if (/\bvite\s+(?:as\s+)?tooling\b|\btooling[-\s]+only\b/.test(value)) return { id: "tooling-only", source: "request-text" };
  if (/\bnext(?:\.js|js)?\s+app\b|\bchoose\s+next\b|\bselected\s+next\b/.test(value)) return { id: "next-app", source: "request-text" };
  if (/\bvite\s+spa\b|\bchoose\s+vite\b|\bselected\s+vite\b/.test(value)) return { id: "vite-spa", source: "request-text" };
  if (/\b(two|2)\s+frontends\b|\bmonorepo\b.*\b(next|vite)\b|\b(next|vite)\b.*\bmonorepo\b/.test(value)) {
    return { id: "monorepo-two-frontends", source: "request-text" };
  }
  return "";
}

function bundlerForTarget(id = "") {
  const normalized = normalizeFrontendTargetChoice(id);
  if (normalized === "next-app") return "turbopack";
  if (normalized === "vite-spa") return "vite";
  if (normalized === "monorepo-two-frontends") return "mixed";
  if (normalized === "tooling-only") return "existing";
  return null;
}

function findPackageJsonFiles(rootDir, { maxDepth = 4 } = {}) {
  const found = [];
  const visit = (dir, depth) => {
    if (depth > maxDepth) return;
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (FRONTEND_SCAN_SKIP_DIRS.has(entry.name) || (entry.name.startsWith(".") && entry.name !== ".github")) continue;
        visit(path, depth + 1);
        continue;
      }
      if (entry.isFile() && entry.name === "package.json") found.push(path);
    }
  };
  visit(rootDir, 0);
  return found.sort((a, b) => toRel(rootDir, a).localeCompare(toRel(rootDir, b)));
}

function frontendTagsFromDependencies(deps = {}) {
  const names = Object.keys(deps || {}).map((name) => name.toLowerCase());
  const tags = new Set();
  if (names.includes("next")) tags.add("nextjs");
  if (names.includes("react") || names.includes("react-dom")) tags.add("react");
  if (names.includes("vite") || names.some((name) => name.includes("vite-plugin") || name === "@vitejs/plugin-react" || name === "@tailwindcss/vite")) tags.add("vite");
  if (names.includes("typescript") || names.includes("tsx") || names.includes("ts-node")) tags.add("typescript");
  if (names.includes("tailwindcss") || names.includes("@tailwindcss/vite")) tags.add("tailwind");
  return [...tags].sort();
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { return null; }
}

function copyChoice(choice) {
  return { ...choice };
}

function toRel(rootDir, path) {
  return relative(rootDir, path).split(sep).join("/") || path;
}
