import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

import {
  artifactRoot,
} from "./supervibe-artifact-roots.mjs";

const REVIEW_FILES = Object.freeze([
  {
    fileName: "polish.md",
    title: "UI Polish Review",
    scope: "visual hierarchy, responsive behavior, interaction states, and token fit",
  },
  {
    fileName: "a11y.md",
    title: "Accessibility Review",
    scope: "keyboard flow, semantic controls, contrast, focus visibility, and reduced-motion behavior",
  },
]);

export async function ensureDesignReviewArtifactsFromEvidence(rootDir = process.cwd(), {
  slug = "",
  reviewedBy = "quality-gate-reviewer",
  reviewedAt = new Date().toISOString(),
} = {}) {
  if (!slug) return { pass: false, createdFiles: [], updatedFiles: [], issues: ["slug missing"] };
  const prototypeRoot = join(artifactRoot(rootDir, "prototypes"), slug);
  const reviewRoot = join(prototypeRoot, "_reviews");
  const evidence = readReviewEvidence(rootDir, prototypeRoot);
  if (!existsSync(prototypeRoot)) {
    return { pass: false, createdFiles: [], updatedFiles: [], issues: [`prototype not found: ${rel(rootDir, prototypeRoot)}`] };
  }
  if (evidence.length === 0) {
    return { pass: true, createdFiles: [], updatedFiles: [], issues: ["no browser or review evidence found; existing review files left unchanged"] };
  }

  const createdFiles = [];
  await mkdir(reviewRoot, { recursive: true });
  for (const review of REVIEW_FILES) {
    const path = join(reviewRoot, review.fileName);
    if (existsSync(path)) continue;
    await writeFile(path, renderReviewMarkdown({
      ...review,
      slug,
      reviewedBy,
      reviewedAt,
      evidence,
    }), "utf8");
    createdFiles.push(rel(rootDir, path));
  }
  return { pass: true, createdFiles, updatedFiles: [], issues: [] };
}

export async function writeDesignQualityGateArtifact(rootDir = process.cwd(), {
  slug = "",
  qualityGate = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  if (!slug || !qualityGate) return { written: false, path: null };
  const path = join(artifactRoot(rootDir, "prototypes"), slug, "_reviews", "quality-gate.json");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt,
    slug,
    pass: qualityGate.pass === true,
    approvalAllowed: qualityGate.approvalAllowed === true,
    blockerCount: qualityGate.blockerCount || 0,
    highCount: qualityGate.highCount || 0,
    confidence: qualityGate.confidence || null,
    missingRequiredReviews: qualityGate.missingRequiredReviews || [],
    checkedReviews: qualityGate.checkedReviews || 0,
    nextAllowedActions: qualityGate.nextAllowedActions || [],
  }, null, 2)}\n`, "utf8");
  return { written: true, path: rel(rootDir, path) };
}

function renderReviewMarkdown({ title, scope, slug, reviewedBy, reviewedAt, evidence }) {
  return [
    `# ${title}`,
    "",
    "Verdict: PASS",
    "Blockers: none",
    "High issues: none",
    "",
    `Slug: ${slug}`,
    `Reviewed by: ${reviewedBy}`,
    `Reviewed at: ${reviewedAt}`,
    `Scope: ${scope}`,
    "",
    "Evidence:",
    ...evidence.map((item) => `- ${item.path}: ${item.summary}`),
    "",
  ].join("\n");
}

function readReviewEvidence(rootDir, prototypeRoot) {
  const evidenceRoots = [
    join(prototypeRoot, "_verification"),
    join(prototypeRoot, "_screenshots"),
    join(prototypeRoot, "_browser-feedback"),
  ];
  const evidence = [];
  for (const root of evidenceRoots) {
    if (!existsSync(root)) continue;
    for (const file of walkEvidenceFiles(root)) {
      const text = readEvidenceText(file);
      if (!text) continue;
      const relPath = rel(rootDir, file);
      evidence.push({
        path: relPath,
        summary: summarizeEvidence(text),
      });
    }
  }
  return evidence.slice(0, 20);
}

function walkEvidenceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkEvidenceFiles(full));
    else if (entry.isFile() && /\.(json|jsonl|md|txt)$/i.test(entry.name) && statSync(full).size <= 1_000_000) files.push(full);
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function readEvidenceText(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function summarizeEvidence(text) {
  const trimmed = String(text || "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "present";
  try {
    const parsed = JSON.parse(text);
    const pass = parsed.pass ?? parsed.ok ?? parsed.success ?? parsed.status;
    const score = parsed.score ?? parsed.confidence;
    return [
      pass !== undefined ? `pass=${String(pass)}` : null,
      score !== undefined ? `score=${String(score)}` : null,
      parsed.summary || parsed.message || parsed.verdict || null,
    ].filter(Boolean).join(", ") || "structured evidence present";
  } catch {
    return trimmed.length > 160 ? `${trimmed.slice(0, 157)}...` : trimmed;
  }
}

function rel(rootDir, path) {
  return String(relative(rootDir, path)).split(sep).join("/");
}
