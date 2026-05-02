import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { artifactRoot } from "./supervibe-artifact-roots.mjs";

const DESIGN_ROOTS = ["prototypes", "mockups", "presentations"];
const RESERVED_PROTOTYPE_DIRS = new Set(["_brandbook", "_design-system"]);

const FRESH_PATTERNS = [
  /\bfrom scratch\b/i,
  /\bfresh\b/i,
  /\bgreenfield\b/i,
  /\bnew design\b/i,
  /\bnew prototype\b/i,
  /\bnew version\b/i,
  /\balternative\b/i,
  /\bstart over\b/i,
  /\bс нуля\b/i,
  /\bзаново\b/i,
  /\bнов(ый|ую|ое|ые)\b/i,
  /\bчист(ый|ую|ое|ые)\b/i,
];

const REUSE_PATTERNS = [
  /\bexisting\b/i,
  /\bcurrent\b/i,
  /\bprevious\b/i,
  /\bcontinue\b/i,
  /\biterate\b/i,
  /\brevise\b/i,
  /\brefine\b/i,
  /\.supervibe[\\/]artifacts[\\/]prototypes[\\/]/i,
  /\.supervibe[\\/]artifacts[\\/]mockups[\\/]/i,
  /\.supervibe[\\/]artifacts[\\/]presentations[\\/]/i,
  /\bдоработ/i,
  /\bулучш/i,
  /\bпродолж/i,
  /\bсуществ/i,
  /\bстар(ый|ую|ое|ые)\b/i,
  /\bпрошл/i,
  /\bэтот файл\b/i,
];

const OLD_ARTIFACT_REFERENCE_PATTERNS = [
  /[A-Za-z]:[\\/][^\n"'`]*\bold[^\n"'`]*\bprototypes?\b/gi,
  /[A-Za-z]:[\\/][^\n"'`]*\blegacy[^\n"'`]*\bprototypes?\b/gi,
  /\bdocs[\\/][^\n"'`]*\bold[^\n"'`]*\bprototypes?\b/gi,
  /\bold prototypes?\b/gi,
  /\blegacy prototypes?\b/gi,
  /\bprevious prototypes?\b/gi,
];

async function safeStat(path) {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

function hasAnyPattern(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function findOldArtifactReferences(text) {
  const refs = [];
  for (const pattern of OLD_ARTIFACT_REFERENCE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of String(text ?? "").matchAll(pattern)) {
      refs.push(match[0].trim());
    }
  }
  return [...new Set(refs)].slice(0, 5);
}

async function collectArtifact(projectRoot, rootName, entryName) {
  if (rootName === "prototypes" && RESERVED_PROTOTYPE_DIRS.has(entryName)) return null;

  const absPath = join(artifactRoot(projectRoot, rootName), entryName);
  const info = await safeStat(absPath);
  if (!info?.isDirectory()) return null;

  const configPath = join(absPath, "config.json");
  const approvalPath = join(absPath, ".approval.json");
  const specPath = join(absPath, "spec.md");
  const indexPath = join(absPath, "index.html");
  const deckPath = join(absPath, "deck.json");
  const config = await readJson(configPath);
  const approval = await readJson(approvalPath);

  const signalPaths = [configPath, approvalPath, specPath, indexPath, deckPath];
  const signalStats = await Promise.all(signalPaths.map(safeStat));
  const presentSignals = signalStats
    .map((item, index) => item ? signalPaths[index] : null)
    .filter(Boolean);

  if (presentSignals.length === 0) return null;

  const newest = signalStats.filter(Boolean).reduce((latest, item) => {
    return item.mtimeMs > latest.mtimeMs ? item : latest;
  }, info);

  const relPath = relative(projectRoot, absPath).replace(/\\/g, "/");
  return {
    slug: entryName,
    kind: rootName.slice(0, -1),
    path: relPath,
    status: approval?.status ?? config?.approval ?? "draft",
    target: config?.target ?? null,
    viewports: config?.viewports ?? [],
    updatedAt: new Date(newest.mtimeMs).toISOString(),
    signals: presentSignals.map((path) => basename(path)),
  };
}

export async function findExistingDesignArtifacts({ projectRoot = process.cwd(), limit = 8 } = {}) {
  const artifacts = [];

  for (const rootName of DESIGN_ROOTS) {
    const absRoot = artifactRoot(projectRoot, rootName);
    if (!existsSync(absRoot)) continue;

    let entries = [];
    try {
      entries = await readdir(absRoot, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const artifact = await collectArtifact(projectRoot, rootName, entry.name);
      if (artifact) artifacts.push(artifact);
    }
  }

  return artifacts
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);
}

export async function evaluateDesignArtifactIntake({ brief = "", projectRoot = process.cwd(), limit = 8 } = {}) {
  const artifacts = await findExistingDesignArtifacts({ projectRoot, limit });
  const text = String(brief ?? "");
  const explicitFresh = hasAnyPattern(text, FRESH_PATTERNS);
  const explicitReuse = hasAnyPattern(text, REUSE_PATTERNS);
  const hasExisting = artifacts.length > 0;
  const oldArtifactReferences = findOldArtifactReferences(text);

  if (oldArtifactReferences.length > 0) {
    return {
      mode: "ask",
      needsQuestion: true,
      needsOldArtifactScopeQuestion: true,
      reason: "old-artifact-reference-scope-required",
      artifacts,
      oldArtifactReferences,
    };
  }

  if (!hasExisting) {
    return { mode: "new", needsQuestion: false, reason: "no-existing-design-artifacts", artifacts, oldArtifactReferences };
  }

  if (explicitFresh && !explicitReuse) {
    return { mode: "new", needsQuestion: false, reason: "explicit-new-from-scratch", artifacts, oldArtifactReferences };
  }

  if (explicitReuse && !explicitFresh) {
    return { mode: "reuse", needsQuestion: false, reason: "explicit-existing-artifact", artifacts, oldArtifactReferences };
  }

  return { mode: "ask", needsQuestion: true, reason: "existing-artifacts-ambiguous-brief", artifacts, oldArtifactReferences };
}

export function formatDesignArtifactChoiceQuestion(intake) {
  if (intake.needsOldArtifactScopeQuestion) {
    const refs = (intake.oldArtifactReferences ?? []).map((ref, index) => `${index + 1}. ${ref}`).join("\n");
    return `**Step 0/N: Old artifact reference scope.**
The brief points at older design/prototype material. I need the borrow/avoid boundary before reading or writing design artifacts.

${refs || "No reference path listed."}

What should I borrow?

- Functional inventory only (recommended) - preserve flows, states, and capabilities; avoid layout, style, and shell structure.
- Functional inventory plus IA - preserve flows and information architecture; redesign visual structure.
- Visual reference allowed - borrow selected style/layout traits and document what changes.
- Ignore the old artifact - create a new design without reading it.
- Stop here - make no hidden progress.`;
  }

  const artifacts = intake.artifacts ?? [];
  const listed = artifacts.slice(0, 5).map((artifact, index) => {
    const target = artifact.target ? `, target=${artifact.target}` : "";
    const status = artifact.status ? `, status=${artifact.status}` : "";
    return `${index + 1}. ${artifact.path}${target}${status}`;
  }).join("\n");

  return `**Step 0/N: Design artifact mode.**
I found existing design artifacts, but the brief does not say whether to reuse them or start fresh.

${listed || "No candidate artifacts listed."}

What should I do?

- Continue an existing artifact - pick the path or say "latest".
- Create a new design from scratch - new slug, no edits to old artifacts.
- Create an alternative next to the old one - keep the old artifact parked for comparison.`;
}

const isMain = (() => {
  try {
    return fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();

if (isMain) {
  const briefIndex = process.argv.indexOf("--brief");
  const rootIndex = process.argv.indexOf("--root");
  const json = process.argv.includes("--json");
  const brief = briefIndex >= 0 ? process.argv[briefIndex + 1] : "";
  const projectRoot = rootIndex >= 0 ? process.argv[rootIndex + 1] : process.cwd();
  const intake = await evaluateDesignArtifactIntake({ brief, projectRoot });
  if (json) {
    console.log(JSON.stringify(intake, null, 2));
  } else if (intake.needsQuestion) {
    console.log(formatDesignArtifactChoiceQuestion(intake));
  } else {
    console.log(`${intake.mode}: ${intake.reason}`);
  }
}
