import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";

const STALE_PATTERNS = [
  { id: "url-tbd", regex: /URL TBD/i },
  { id: "old-test-count", regex: /\b51\/51\b|\bAll 320 tests\b/i },
  { id: "old-version", regex: /\b1\.9\.0\b|\b2\.0\.1\b/i },
  { id: "supervise-typo", regex: /\bSupervise\b/ },
  { id: "todo", regex: /\bTODO\b/i },
  { id: "tbd", regex: /\bTBD\b/i },
];

const INTENTIONAL_PATHS = [
  /^docs\/templates\//,
  /^docs\/confidence-gates-spec\.md$/,
];

const INTERNAL_DEV_PATHS = [
  /^docs\/internal-commands\//,
  /^docs\/audits\//,
  /^docs\/plugin-strengthening-todo\.md$/,
  /^docs\/.*upstream-coverage\.md$/,
];

export async function auditDocsRelevance({ rootDir = process.cwd(), docsDir = "docs" } = {}) {
  const base = join(rootDir, docsDir);
  const files = await walkFiles(base);
  const results = [];
  for (const filePath of files) {
    const relPath = normalizePath(relative(rootDir, filePath));
    const content = await readFile(filePath, "utf8");
    const markers = STALE_PATTERNS
      .filter((pattern) => pattern.regex.test(content))
      .map((pattern) => pattern.id);
    const intentional = INTENTIONAL_PATHS.some((regex) => regex.test(relPath));
    const internalDev = INTERNAL_DEV_PATHS.some((regex) => regex.test(relPath));
    const deleteCandidate = internalDev || (markers.length > 0 && !intentional);
    results.push({
      path: relPath,
      category: categorizeDoc(relPath),
      markers,
      intentional,
      internalDev,
      deleteCandidate,
      recommendation: internalDev
        ? "move-or-delete-internal"
        : deleteCandidate
        ? "review-or-delete"
        : markers.length
          ? "intentional-marker"
          : "keep",
    });
  }
  return {
    schemaVersion: 1,
    docsDir,
    scanned: results.length,
    deleteCandidates: results.filter((entry) => entry.deleteCandidate),
    intentionalMarkers: results.filter((entry) => entry.markers.length > 0 && entry.intentional),
    internalDev: results.filter((entry) => entry.internalDev),
    keep: results.filter((entry) => entry.recommendation === "keep"),
    results,
    pass: results.every((entry) => !entry.deleteCandidate),
  };
}

export function formatDocsAuditReport(report = {}) {
  return [
    "SUPERVIBE_DOCS_AUDIT",
    `PASS: ${Boolean(report.pass)}`,
    `SCANNED: ${report.scanned || 0}`,
    `DELETE_CANDIDATES: ${(report.deleteCandidates || []).length}`,
    `INTERNAL_DEV_FILES: ${(report.internalDev || []).length}`,
    `INTENTIONAL_MARKERS: ${(report.intentionalMarkers || []).length}`,
    ...((report.deleteCandidates || []).map((entry) => `- ${entry.path}: ${entry.internalDev ? "internal-dev-file" : entry.markers.join(",")}`)),
    `NEXT_ACTION: ${(report.deleteCandidates || []).length ? "review listed docs before deletion" : "no docs deletion candidates found"}`,
  ].join("\n");
}

async function walkFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walkFiles(path));
    else if (/\.(md|json|yaml|yml)$/i.test(entry.name)) out.push(path);
  }
  return out;
}

function categorizeDoc(path) {
  if (path.includes("/internal-commands/")) return "internal-command";
  if (path.includes("/templates/")) return "template";
  if (path.includes("/audits/")) return "audit-fixture";
  if (/getting-started|install|release|license/i.test(path)) return "release";
  if (/design|figma|semantic|policy|orchestration|loop/i.test(path)) return "capability";
  return "reference";
}

function normalizePath(path = "") {
  return String(path).replace(/\\/g, "/");
}
