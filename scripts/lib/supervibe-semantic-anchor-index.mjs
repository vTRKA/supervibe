import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

const SECRET_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|(?:api[_-]?key|token|secret|password|passwd)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{8,}|-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----)/gi;

export function parseSemanticAnchors(content = "", { filePath = "unknown", source = "comment" } = {}) {
  const anchors = [];
  const lines = String(content || "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/@supervibe-anchor\b/.test(line)) continue;
    const attrs = parseAttributes(line);
    const responsibility = attrs.responsibility || attrs.purpose || attrs.title || "";
    const symbolName = attrs.symbol || attrs.symbolName || inferNextSymbol(lines.slice(index + 1)) || null;
    const anchorId = attrs.id || attrs.anchorId || stableAnchorId({ filePath, symbolName, responsibility, line: index + 1 });
    anchors.push(normalizeAnchor({
      anchorId,
      filePath,
      symbolName,
      visibility: attrs.visibility || attrs.access || "private",
      responsibility,
      invariants: splitList(attrs.invariant || attrs.invariants),
      verificationRefs: splitList(attrs.verify || attrs.verification || attrs.verificationRefs),
      startLine: index + 1,
      endLine: Number(attrs.endLine || attrs.end || index + 1),
      source,
      rawText: line,
    }));
  }
  return anchors;
}

export async function buildSemanticAnchorIndex({
  rootDir = process.cwd(),
  files = [],
  sidecarPaths = [],
  generatedAt = "deterministic-local",
} = {}) {
  const anchors = [];
  for (const file of files) {
    anchors.push(...parseSemanticAnchors(file.content || "", {
      filePath: normalizePath(file.path || file.filePath),
      source: "comment",
    }));
  }
  for (const sidecarPath of sidecarPaths) {
    const fullPath = join(rootDir, sidecarPath);
    const parsed = JSON.parse(await readFile(fullPath, "utf8"));
    for (const anchor of parsed.anchors || []) {
      anchors.push(normalizeAnchor({
        ...anchor,
        filePath: normalizePath(anchor.filePath || anchor.path),
        anchorId: anchor.anchorId || anchor.id || stableAnchorId(anchor),
        source: "sidecar",
      }));
    }
  }
  const deduped = dedupeAnchors(anchors);
  return {
    schemaVersion: 1,
    generatedAt,
    anchors: deduped,
    summary: {
      anchors: deduped.length,
      files: new Set(deduped.map((anchor) => anchor.filePath)).size,
      withVerification: deduped.filter((anchor) => anchor.verificationRefs.length > 0).length,
    },
  };
}

export async function writeSemanticAnchorIndex(outPath, index) {
  await mkdir(dirname(outPath), { recursive: true });
  const content = `${JSON.stringify(index, null, 2)}\n`;
  await writeFile(outPath, content, "utf8");
  return { outPath, bytes: Buffer.byteLength(content) };
}

export function semanticAnchorToGraphNode(anchor = {}) {
  return {
    id: `anchor:${anchor.anchorId}`,
    type: "semantic-anchor",
    filePath: anchor.filePath,
    symbolName: anchor.symbolName || null,
    title: anchor.responsibility || anchor.anchorId,
    visibility: anchor.visibility || "private",
    verificationRefs: anchor.verificationRefs || [],
  };
}

export function formatSemanticAnchorReport(index = {}) {
  const anchors = index.anchors || [];
  const summary = index.summary || {};
  return [
    "SUPERVIBE_SEMANTIC_ANCHORS",
    `ANCHORS: ${summary.anchors ?? anchors.length}`,
    `FILES: ${summary.files ?? new Set(anchors.map((anchor) => anchor.filePath)).size}`,
    `WITH_VERIFICATION: ${summary.withVerification ?? anchors.filter((anchor) => anchor.verificationRefs?.length).length}`,
    `IDS: ${anchors.map((anchor) => anchor.anchorId).join(",") || "none"}`,
  ].join("\n");
}

function normalizeAnchor(anchor = {}) {
  return {
    anchorId: redact(anchor.anchorId || anchor.id || stableAnchorId(anchor)),
    filePath: normalizePath(anchor.filePath || anchor.path || "unknown"),
    symbolName: anchor.symbolName ? redact(anchor.symbolName) : null,
    visibility: ["public", "private", "internal"].includes(anchor.visibility) ? anchor.visibility : "private",
    responsibility: redact(anchor.responsibility || anchor.purpose || ""),
    invariants: splitList(anchor.invariants || anchor.invariant).map(redact),
    verificationRefs: splitList(anchor.verificationRefs || anchor.verify || anchor.verification).map(redact),
    startLine: Number(anchor.startLine || anchor.line || 1),
    endLine: Number(anchor.endLine || anchor.startLine || anchor.line || 1),
    source: anchor.source || "generated",
  };
}

function dedupeAnchors(anchors = []) {
  const seen = new Set();
  const result = [];
  for (const anchor of anchors) {
    const key = `${anchor.anchorId}:${anchor.filePath}:${anchor.startLine}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(anchor);
  }
  return result;
}

function parseAttributes(line = "") {
  const attrs = {};
  const regex = /([A-Za-z][A-Za-z0-9_-]*)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
  let match;
  while ((match = regex.exec(line))) {
    attrs[match[1]] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

function inferNextSymbol(lines = []) {
  for (const line of lines.slice(0, 8)) {
    const match = /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(line)
      || /\b(?:class|interface|type|const|let|var)\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (match) return match[1];
  }
  return null;
}

function stableAnchorId({ filePath = "unknown", symbolName = "", responsibility = "", line = "" } = {}) {
  const seed = `${normalizePath(filePath)}:${symbolName || normalizeText(responsibility)}:${line || ""}`;
  return `anchor-${createHash("sha1").update(seed).digest("hex").slice(0, 10)}`;
}

function splitList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return String(value).split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

function normalizePath(path = "") {
  return String(path || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function normalizeText(value = "") {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function redact(value = "") {
  return String(value || "").replace(SECRET_PATTERN, "[REDACTED_SECRET]");
}
