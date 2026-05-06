import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_SCIP_CANDIDATES = Object.freeze([
  ".supervibe/memory/scip.json",
  ".supervibe/memory/index.scip.json",
  ".supervibe/memory/index.scip",
  "index.scip",
  "scip.json",
]);

export async function inspectScipImportReadiness({
  rootDir = process.cwd(),
  scipPath = null,
  candidates = DEFAULT_SCIP_CANDIDATES,
} = {}) {
  const found = findScipCandidate(rootDir, scipPath, candidates);
  if (!found) {
    return {
      schemaVersion: 1,
      pass: true,
      status: "not-found",
      available: false,
      binaryParser: "deferred",
      importMode: "tree-sitter-default",
      summary: { documents: 0, symbols: 0 },
      nextAction: "continue with tree-sitter CodeGraph",
    };
  }
  if (/\.json$/i.test(found.relativePath)) {
    const summary = summarizeScipJson(JSON.parse(await readFile(found.path, "utf8")));
    return {
      schemaVersion: 1,
      pass: true,
      status: "json-summary",
      available: true,
      path: found.relativePath,
      binaryParser: "deferred",
      importMode: "json-summary",
      summary,
      nextAction: "import SCIP JSON summary into CodeGraph when a precise edge merger is enabled",
    };
  }
  return {
    schemaVersion: 1,
    pass: true,
    status: "binary-found",
    available: true,
    path: found.relativePath,
    binaryParser: "deferred",
    importMode: "manifest-only",
    summary: { documents: 0, symbols: 0 },
    nextAction: "convert SCIP protobuf to JSON before importing or add an explicit protobuf parser dependency",
  };
}

export function formatScipImportReadiness(report = {}) {
  return [
    "SUPERVIBE_SCIP_IMPORT",
    `PASS: ${Boolean(report.pass)}`,
    `STATUS: ${report.status || "unknown"}`,
    `AVAILABLE: ${Boolean(report.available)}`,
    `PATH: ${report.path || "none"}`,
    `BINARY_PARSER: ${report.binaryParser || "unknown"}`,
    `IMPORT_MODE: ${report.importMode || "unknown"}`,
    `DOCUMENTS: ${report.summary?.documents || 0}`,
    `SYMBOLS: ${report.summary?.symbols || 0}`,
    `NEXT_ACTION: ${report.nextAction || "none"}`,
  ].join("\n");
}

function findScipCandidate(rootDir, scipPath, candidates) {
  const list = scipPath ? [scipPath] : candidates;
  for (const candidate of list) {
    const fullPath = join(rootDir, ...String(candidate).split(/[\\/]/));
    if (existsSync(fullPath)) {
      return {
        path: fullPath,
        relativePath: String(candidate).replace(/\\/g, "/"),
      };
    }
  }
  return null;
}

function summarizeScipJson(parsed = {}) {
  const documents = Array.isArray(parsed.documents) ? parsed.documents : [];
  const symbols = documents.reduce((count, doc) => count + normalizeSymbols(doc).length, 0);
  return {
    tool: parsed.metadata?.toolInfo?.name || parsed.metadata?.tool_info?.name || "unknown",
    documents: documents.length,
    symbols,
    sampleDocuments: documents.map((doc) => doc.relative_path || doc.relativePath || doc.path).filter(Boolean).slice(0, 5),
  };
}

function normalizeSymbols(doc = {}) {
  if (Array.isArray(doc.symbols)) return doc.symbols;
  if (Array.isArray(doc.occurrences)) return doc.occurrences.map((item) => item.symbol).filter(Boolean);
  return [];
}
