import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const INDEX_CONFIG_REL_PATH = ".supervibe/memory/index-config.json";
export const DEFAULT_INDEX_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function defaultIndexConfig() {
  return {
    schemaVersion: 1,
    refreshIntervalMs: DEFAULT_INDEX_REFRESH_INTERVAL_MS,
    exclude: [
      "dist/**",
      "build/**",
      "coverage/**",
      "node_modules/**",
    ],
    include: [],
    notes: [
      "User excludes hide files from Code RAG and Code Graph indexing.",
      "Privacy blocks for secrets, archives, binaries and local config always win over include rules.",
      "The watcher still reacts to file events immediately; refreshIntervalMs is the periodic safety scan interval.",
    ],
  };
}

function indexConfigPath(rootDir = process.cwd()) {
  return join(rootDir, INDEX_CONFIG_REL_PATH);
}

export function loadIndexConfig({ rootDir = process.cwd(), configPath = indexConfigPath(rootDir) } = {}) {
  const fallback = defaultIndexConfig();
  if (!existsSync(configPath)) return { ...fallback, source: "default", path: configPath };
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    return normalizeIndexConfig(parsed, { fallback, source: "project", path: configPath });
  } catch (error) {
    return {
      ...fallback,
      source: "invalid-project-config",
      path: configPath,
      error: error.message,
    };
  }
}

export async function ensureIndexConfig({ rootDir = process.cwd(), configPath = indexConfigPath(rootDir) } = {}) {
  if (existsSync(configPath)) return loadIndexConfig({ rootDir, configPath });
  await mkdir(dirname(configPath), { recursive: true });
  const config = defaultIndexConfig();
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return { ...config, source: "created", path: configPath };
}

function matchIndexPattern(relPath = "", patterns = []) {
  const normalized = normalizeRelPath(relPath);
  return patterns.find((pattern) => globToRegExp(pattern).test(normalized)) || null;
}

export function shouldExcludeFromIndex(relPath = "", config = defaultIndexConfig()) {
  return matchIndexPattern(relPath, config.exclude || []);
}

export function formatIndexConfigStatus(config = defaultIndexConfig()) {
  const minutes = Math.round(Number(config.refreshIntervalMs || DEFAULT_INDEX_REFRESH_INTERVAL_MS) / 60000);
  return [
    "SUPERVIBE_INDEX_CONFIG",
    `SOURCE: ${config.source || "default"}`,
    `PATH: ${config.path || INDEX_CONFIG_REL_PATH}`,
    `REFRESH_INTERVAL: ${minutes}m`,
    `EXCLUDE_PATTERNS: ${(config.exclude || []).join(", ") || "none"}`,
    `INCLUDE_PATTERNS: ${(config.include || []).join(", ") || "none"}`,
  ].join("\n");
}

function normalizeIndexConfig(parsed, { fallback, source, path }) {
  const refreshIntervalMs = Number(parsed.refreshIntervalMs);
  return {
    ...fallback,
    ...parsed,
    schemaVersion: 1,
    refreshIntervalMs: Number.isFinite(refreshIntervalMs) && refreshIntervalMs >= 60_000
      ? Math.trunc(refreshIntervalMs)
      : fallback.refreshIntervalMs,
    exclude: asStringArray(parsed.exclude ?? fallback.exclude),
    include: asStringArray(parsed.include ?? fallback.include),
    source,
    path,
  };
}

function globToRegExp(pattern = "") {
  const normalized = normalizeRelPath(pattern).replace(/\/$/, "/**");
  const token = "\u0000GLOBSTAR\u0000";
  const escaped = normalized
    .replace(/\*\*/g, token)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    .replaceAll(token, ".*");
  return new RegExp(`^${escaped}$`);
}

function normalizeRelPath(value = "") {
  return String(value).replace(/\\/g, "/").replace(/^\.\//, "");
}

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}
