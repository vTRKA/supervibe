import { existsSync, readFileSync } from "node:fs";

import { resolveUserProviderConfigTarget } from "./supervibe-provider-config-applier.mjs";

export function readProviderRuntimeConfigLimits({
  provider,
  providerId,
  projectRoot = process.cwd(),
  userHome,
  providerHome,
  env = process.env,
} = {}) {
  const selectedProviderId = provider?.id || providerId || "unknown";
  if (selectedProviderId !== "codex") {
    return emptyRuntimeLimits(selectedProviderId, "unsupported-provider");
  }

  const target = resolveUserProviderConfigTarget({
    provider,
    providerId: selectedProviderId,
    projectRoot,
    userHome,
    providerHome,
    env,
  });
  if (!target.absolutePath || !target.writable) {
    return emptyRuntimeLimits(selectedProviderId, target.issue?.code || "provider-config-unavailable", target);
  }
  if (!existsSync(target.absolutePath)) {
    return emptyRuntimeLimits(selectedProviderId, "provider-config-missing", target);
  }

  const text = readFileSync(target.absolutePath, "utf8");
  return {
    providerId: selectedProviderId,
    source: "provider-runtime-config",
    configPath: target.targetPath || target.absolutePath,
    maxThreads: positiveInt(tomlValueAtPath(text, "agents.max_threads"), null),
    maxDepth: positiveInt(tomlValueAtPath(text, "agents.max_depth"), null),
    jobMaxRuntimeSeconds: positiveInt(tomlValueAtPath(text, "agents.job_max_runtime_seconds"), null),
    issue: null,
  };
}

function emptyRuntimeLimits(providerId, reason, target = null) {
  return {
    providerId,
    source: "provider-runtime-config",
    configPath: target?.targetPath || null,
    maxThreads: null,
    maxDepth: null,
    jobMaxRuntimeSeconds: null,
    issue: reason,
  };
}

function tomlValueAtPath(text = "", path = "") {
  let table = "";
  const candidates = new Map();
  for (const line of normalizeLineEndings(text).split("\n")) {
    const header = parseTomlTableHeader(line);
    if (header) {
      table = header.table;
      continue;
    }
    const pair = parseTomlKeyValue(line);
    if (!pair) continue;
    const fullPath = table ? `${table}.${pair.key}` : pair.key;
    candidates.set(fullPath, pair.value);
  }
  return candidates.get(path);
}

function normalizeLineEndings(value = "") {
  return String(value || "").replace(/\r\n?/g, "\n");
}

function stripTomlComment(line = "") {
  let quote = null;
  let escaped = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "#") return line.slice(0, i);
  }
  return line;
}

function parseTomlTableHeader(line = "") {
  const stripped = stripTomlComment(line).trim();
  const arrayMatch = stripped.match(/^\[\[([A-Za-z0-9_.-]+)\]\]$/);
  if (arrayMatch) return { table: arrayMatch[1], array: true };
  const tableMatch = stripped.match(/^\[([A-Za-z0-9_.-]+)\]$/);
  if (tableMatch) return { table: tableMatch[1], array: false };
  return null;
}

function parseTomlKeyValue(line = "") {
  const stripped = stripTomlComment(line).trim();
  const match = stripped.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
  if (!match) return null;
  return { key: match[1], value: parseScalarValue(match[2].trim()) };
}

function parseScalarValue(value = "") {
  const trimmed = value.trim();
  if (/^true$/i.test(trimmed)) return true;
  if (/^false$/i.test(trimmed)) return false;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  const quoted = trimmed.match(/^["']([\s\S]*)["']$/);
  return quoted ? quoted[1] : trimmed;
}

function positiveInt(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}