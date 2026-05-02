import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import matter from "gray-matter";

const WINDOWS_1251_DECODER = new TextDecoder("windows-1251");
const UTF8_FATAL_DECODER = new TextDecoder("utf-8", { fatal: true });
const UTF8_DECODER = new TextDecoder("utf-8");
const UTF8_ENCODER = new TextEncoder();

const CP1251_BYTE_BY_CHAR = (() => {
  const map = new Map();
  for (let byte = 0; byte <= 255; byte += 1) {
    const char = WINDOWS_1251_DECODER.decode(Uint8Array.of(byte));
    if (!map.has(char)) map.set(char, byte);
  }
  return map;
})();

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".template",
  ".tpl",
  ".txt",
  ".yaml",
  ".yml",
]);

const LANGUAGE_POLICY_SURFACES_RE = /^(?:agents|skills|commands|rules|docs)\//;
const QUESTION_MARK_POLICY_SURFACES_RE =
  /^(?:agents|skills|commands|rules|docs|templates|scripts|\.supervibe\/artifacts|\.supervibe\/memory|README\.md|CHANGELOG\.md|registry\.yaml)(?:\/|$)/;
const SKIP_DIRS = new Set([
  ".git",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

const COMMON_MOJIBAKE_FRAGMENT_RE =
  /(?:Р[^\x00-\x7F]|С[^\x00-\x7F]|в[^\x00-\x7F]|рџ|В[^\x00-\x7F]|Г[^\x00-\x7F]|О[^\x00-\x7F]|Ð.|Ñ.|â.|Ã.)/u;
const NON_ASCII_RUN_RE = /[^\x00-\x7F]+/gu;
const FRONTMATTER_SURFACES_RE = /^(?:agents|skills|commands|rules)\//;
const TRIGGER_LABEL_RE = /(?:Trigger phrases?:|Triggers:|Триггеры?:)/iu;
const CYRILLIC_RE = /[\u0400-\u04FF]/u;
const CYRILLIC_MATCH_RE = /[\u0400-\u04FF].{0,100}/u;
const QUOTED_STRING_RE = /(['"`])(?:\\.|(?!\1)[\s\S])*\1/g;
const SUSPICIOUS_QUESTION_MARK_RUN_RE = /\?{3,}/;

function windows1251BytesFromString(value) {
  const bytes = [];
  for (const char of String(value)) {
    const byte = CP1251_BYTE_BY_CHAR.get(char);
    if (byte === undefined) return null;
    bytes.push(byte);
  }
  return Uint8Array.from(bytes);
}

export function decodeWindows1251MojibakeRun(value) {
  const text = String(value);
  if (!COMMON_MOJIBAKE_FRAGMENT_RE.test(text)) return null;
  const bytes = windows1251BytesFromString(text);
  if (!bytes) return null;
  try {
    const repaired = UTF8_FATAL_DECODER.decode(bytes);
    if (repaired === text || repaired.includes("\uFFFD")) return null;
    return repaired;
  } catch {
    return null;
  }
}

export function repairMojibakeText(text) {
  const repairs = [];
  const repaired = String(text).replace(NON_ASCII_RUN_RE, (run, offset) => {
    const replacement = decodeWindows1251MojibakeRun(run);
    if (!replacement) return run;
    repairs.push({ offset, before: run, after: replacement });
    return replacement;
  });
  return { text: repaired, repairs };
}

function findRepairableMojibake(text) {
  return repairMojibakeText(text).repairs;
}

function containsReplacementCharacter(text) {
  return String(text).includes("\uFFFD");
}

function hasRedundantBilingualDescription(relPath, text) {
  if (!FRONTMATTER_SURFACES_RE.test(normalizeRelPath(relPath))) return false;
  if (!relPath.endsWith(".md")) return false;
  try {
    const parsed = matter(text);
    const description = String(parsed.data?.description ?? "");
    const [baseDescription = ""] = description.split(TRIGGER_LABEL_RE, 1);
    return /\bRU\s*:|Триггеры\s*:/iu.test(description) || CYRILLIC_RE.test(baseDescription);
  } catch {
    return false;
  }
}

function findCyrillicOutsideIntentTriggers(relPath, text) {
  const normalizedPath = normalizeRelPath(relPath);
  if (!LANGUAGE_POLICY_SURFACES_RE.test(normalizedPath)) return [];
  if (!normalizedPath.endsWith(".md")) return [];

  const issues = [];
  let body = String(text);

  try {
    const parsed = matter(text);
    body = parsed.content;
    const description = String(parsed.data?.description ?? "");
    const descriptionIssue = firstCyrillicOutsideTriggerQuotes(description);
    if (descriptionIssue) {
      issues.push({
        file: normalizedPath,
        code: "cyrillic-outside-trigger",
        message: `${normalizedPath}: frontmatter description contains Cyrillic outside quoted Triggers: "${descriptionIssue.sample}"`,
      });
    }
  } catch {
    // Fall through to body scan; malformed frontmatter is covered by the frontmatter validator.
  }

  const lines = body.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const issue = firstCyrillicOutsideTriggerQuotes(lines[index]);
    if (!issue) continue;
    issues.push({
      file: normalizedPath,
      code: "cyrillic-outside-trigger",
      message: `${normalizedPath}:${index + 1}: Cyrillic is allowed only as quoted intent trigger phrases: "${issue.sample}"`,
    });
    break;
  }

  return issues;
}

function findSuspiciousQuestionMarkRuns(relPath, text) {
  const normalizedPath = normalizeRelPath(relPath);
  if (!QUESTION_MARK_POLICY_SURFACES_RE.test(normalizedPath)) return [];

  const lines = String(text).split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!SUSPICIOUS_QUESTION_MARK_RUN_RE.test(line)) continue;
    return [{
      file: normalizedPath,
      code: "question-mark-text-loss",
      message: `${normalizedPath}:${index + 1}: contains a suspicious run of question marks, usually caused by non-UTF-8 text loss: "${line.trim().slice(0, 140)}"`,
    }];
  }

  return [];
}

export function collectTextFiles(rootDir) {
  const files = [];
  walk(rootDir, files, rootDir);
  return files.sort();
}

export function validateTextEncoding(rootDir = process.cwd()) {
  const issues = [];
  for (const file of collectTextFiles(rootDir)) {
    const relPath = normalizeRelPath(relative(rootDir, file));
    const text = readFileSync(file, "utf8");
    if (containsReplacementCharacter(text)) {
      issues.push({
        file: relPath,
        code: "replacement-character",
        message: `${relPath}: contains U+FFFD replacement character`,
      });
    }
    const repairs = findRepairableMojibake(text);
    if (repairs.length > 0) {
      const first = repairs[0];
      issues.push({
        file: relPath,
        code: "repairable-mojibake",
        message: `${relPath}: repairable mojibake "${first.before}" -> "${first.after}"`,
      });
    }
    if (hasRedundantBilingualDescription(relPath, text)) {
      issues.push({
        file: relPath,
        code: "redundant-bilingual-description",
        message: `${relPath}: frontmatter description must use one base language; keep multilingual phrases only as quoted triggers`,
      });
    }
    issues.push(...findSuspiciousQuestionMarkRuns(relPath, text));
    issues.push(...findCyrillicOutsideIntentTriggers(relPath, text));
  }
  return {
    pass: issues.length === 0,
    checked: collectTextFiles(rootDir).length,
    issues,
  };
}

function firstCyrillicOutsideTriggerQuotes(value) {
  const text = String(value ?? "");
  const triggerIndex = text.search(TRIGGER_LABEL_RE);
  const normalized = triggerIndex === -1
    ? text
    : text.slice(0, triggerIndex) + text.slice(triggerIndex).replace(QUOTED_STRING_RE, "");
  const match = normalized.match(CYRILLIC_MATCH_RE);
  return match ? { sample: match[0] } : null;
}

export function formatTextEncodingReport(result) {
  const lines = [
    "SUPERVIBE_TEXT_ENCODING_QUALITY",
    `PASS: ${result.pass}`,
    `CHECKED: ${result.checked}`,
    `ISSUES: ${result.issues.length}`,
  ];
  for (const issue of result.issues) {
    lines.push(`ISSUE: ${issue.code} ${issue.file} - ${issue.message}`);
  }
  return lines.join("\n");
}

function walk(dir, files, rootDir) {
  if (!existsSync(dir)) return;
  const rel = normalizeRelPath(relative(rootDir, dir));
  const base = rel.split("/").at(-1);
  if (base && SKIP_DIRS.has(base)) return;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files, rootDir);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!isTextFile(full)) continue;
    if (isProbablyBinaryOrHuge(full)) continue;
    files.push(full);
  }
}

function isTextFile(path) {
  const lower = path.toLowerCase();
  for (const extension of TEXT_EXTENSIONS) {
    if (lower.endsWith(extension)) return true;
  }
  return false;
}

function isProbablyBinaryOrHuge(path) {
  const stat = statSync(path);
  if (stat.size > 3_000_000) return true;
  const sample = readFileSync(path, { encoding: null, flag: "r" }).subarray(0, 4096);
  return sample.includes(0);
}

function normalizeRelPath(path) {
  return String(path).split(sep).join("/");
}
