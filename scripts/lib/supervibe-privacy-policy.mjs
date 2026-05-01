import { basename } from "node:path";

import { detectLanguage } from "./code-chunker.mjs";

const ARCHIVE_EXTENSIONS = /\.(zip|rar|7z|tar|tgz|gz|bz2|xz)$/i;
const BINARY_EXTENSIONS = /\.(png|jpe?g|gif|webp|ico|pdf|exe|dll|so|dylib|wasm|onnx|bin|db|sqlite|lock)$/i;
const GENERATED_DIRS = new Set(["dist", "dist-check", "build", "out", ".next", "coverage", ".turbo", "target"]);
const SECRET_FILE_NAMES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  "id_rsa",
  "id_dsa",
  "id_ed25519",
]);
const LOCAL_CONFIG_PATTERNS = [
  /(^|\/)config\/local\.[a-z0-9]+$/i,
  /(^|\/)\.vscode\/settings\.json$/i,
  /(^|\/)\.idea\//i,
  /(^|\/).*secrets?\.(json|yaml|yml|toml|env)$/i,
];

export function classifyPrivacyPath(path = "") {
  const relPath = normalizeRelPath(path);
  const fileName = basename(relPath);

  if (isGeneratedPath(relPath)) return result("generated", relPath, false, false, "generated output");
  if (SECRET_FILE_NAMES.has(fileName) || /^\.env\./.test(fileName)) {
    return result("secret-like", relPath, false, false, "secret-like file name");
  }
  if (LOCAL_CONFIG_PATTERNS.some((pattern) => pattern.test(relPath))) {
    return result("local-config", relPath, false, false, "local private config");
  }
  if (ARCHIVE_EXTENSIONS.test(fileName)) return result("archive", relPath, false, false, "archive file");
  if (BINARY_EXTENSIONS.test(fileName)) return result("binary", relPath, false, false, "binary file");

  const language = detectLanguage(fileName);
  if (language) return result("source-code", relPath, true, true, `source language:${language}`, language);
  if (/\.(md|mdx|txt|rst)$/i.test(fileName)) return result("source-doc", relPath, true, false, "source documentation");
  return result("unsupported", relPath, false, false, "unsupported file type");
}

export function summarizePrivacyPolicy(paths = []) {
  const entries = paths.map((path) => classifyPrivacyPath(path));
  return {
    total: entries.length,
    indexed: entries.filter((entry) => entry.indexAllowed).length,
    skipped: entries.filter((entry) => !entry.indexAllowed).length,
    classes: entries.reduce((acc, entry) => {
      acc[entry.classification] = (acc[entry.classification] || 0) + 1;
      return acc;
    }, {}),
    entries: entries.map((entry) => ({
      path: entry.path,
      classification: entry.classification,
      indexAllowed: entry.indexAllowed,
      graphAllowed: entry.graphAllowed,
      reason: entry.reason,
    })),
  };
}

export function formatPrivacyPolicyDiagnostics(summary) {
  const lines = [
    "SUPERVIBE_PRIVACY_POLICY",
    `TOTAL: ${summary.total}`,
    `INDEXED: ${summary.indexed}`,
    `SKIPPED: ${summary.skipped}`,
  ];
  for (const [name, count] of Object.entries(summary.classes).sort()) {
    lines.push(`- ${name}: ${count}`);
  }
  return lines.join("\n");
}

export function redactContextForOutput(text = "") {
  return String(text)
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[REDACTED_API_KEY]")
    .replace(/([A-Z0-9_]*KEY|TOKEN|SECRET|PASSWORD)=([^\s]+)/gi, "$1=[REDACTED]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]");
}

function result(classification, path, indexAllowed, graphAllowed, reason, language = null) {
  return { classification, path, indexAllowed, graphAllowed, reason, language };
}

function normalizeRelPath(path = "") {
  return String(path).replace(/\\/g, "/").replace(/^\.\//, "");
}

function isGeneratedPath(path = "") {
  return normalizeRelPath(path).split("/").filter(Boolean).some((segment) => GENERATED_DIRS.has(segment));
}
