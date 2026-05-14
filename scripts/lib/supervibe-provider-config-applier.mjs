import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

const REDACTED = "[REDACTED]";

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /["']?\b(?:api[_-]?key|token|secret|password|passwd|private[_-]?key)\b["']?\s*[:=]\s*["']?[^"'\s,;}]+/gi,
  /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
];

const CODEX_SCHEMA_SURFACES = new Set([
  "approval_policy",
  "sandbox_mode",
  "default_permissions",
  "web_search",
  "features.apps",
  "features.multi_agent",
  "features.memories",
  "features.shell_snapshot",
  "features.codex_hooks",
  "features.goals",
  "agents.max_threads",
  "agents.max_depth",
  "agents.job_max_runtime_seconds",
  "apps._default.enabled",
  "tool_suggest.discoverables",
]);

const UNSAFE_CODEX_SURFACES = new Set([
  "plugins",
]);

export function createProviderConfigApplyReport({
  provider,
  providerId,
  text = "",
  format,
  targetPath = "provider-config",
  manifest,
  checkedAt,
} = {}) {
  const selectedProvider = provider || findProvider(manifest, providerId);
  const selectedProviderId = selectedProvider?.id || providerId || "unknown";
  const configFormat = normalizeFormat(format || inferFormatFromPath(targetPath));
  const defaults = buildProviderDefaultEntries(selectedProvider || { id: selectedProviderId });
  const validation = validateProviderConfigEntries({
    providerId: selectedProviderId,
    entries: defaults,
    manifest,
  });
  const applyResult = validation.valid
    ? applyMissingProviderConfig({ text, format: configFormat, entries: defaults, targetPath })
    : {
        changed: false,
        blocked: true,
        output: text,
        operations: [],
        issues: validation.issues,
        duplicateKeys: [],
        diff: createDryRunDiff(text, text, targetPath),
      };

  return {
    schemaVersion: 1,
    providerId: selectedProviderId,
    checkedAt: checkedAt || selectedProvider?.sources?.[0]?.checkedAt || manifest?.checkedAt || null,
    targetPath,
    format: configFormat,
    mode: "dry-run-add-missing-only",
    overwriteExistingValues: false,
    preserveUserComments: true,
    redaction: "enabled",
    validation,
    changed: applyResult.changed,
    blocked: applyResult.blocked,
    operations: applyResult.operations,
    issues: applyResult.issues,
    duplicateKeys: applyResult.duplicateKeys || [],
    diff: applyResult.diff,
    outputPreview: redactSensitiveText(applyResult.output || ""),
  };
}

export function formatProviderConfigApplyReport(report = {}) {
  const lines = [
    "SUPERVIBE_PROVIDER_CONFIG_APPLY",
    `PROVIDER: ${report.providerId || "unknown"}`,
    `TARGET: ${report.targetPath || "provider-config"}`,
    `FORMAT: ${report.format || "unknown"}`,
    `MODE: ${report.mode || "dry-run-add-missing-only"}`,
    `CHANGED: ${report.changed === true}`,
    `BLOCKED: ${report.blocked === true}`,
    `OVERWRITE_EXISTING_VALUES: ${report.overwriteExistingValues === true}`,
    `PRESERVE_USER_COMMENTS: ${report.preserveUserComments !== false}`,
    `VALIDATION: ${report.validation?.valid === true ? "pass" : "fail"}`,
  ];
  for (const issue of report.validation?.issues || []) {
    lines.push(`VALIDATION_ISSUE: ${issue.code || "issue"} ${issue.path || "unknown"} ${issue.message || ""}`.trim());
  }
  for (const duplicate of report.duplicateKeys || []) {
    lines.push(`DUPLICATE_KEY: ${duplicate.path} line=${duplicate.line}`);
  }
  for (const operation of report.operations || []) {
    lines.push(`OPERATION: ${operation.action || "add-missing"} ${operation.path || operation.table || "unknown"} status=${operation.status || "planned"}`);
  }
  if (report.diff?.preview) {
    lines.push("DIFF_PREVIEW:");
    lines.push(report.diff.preview);
  }
  for (const issue of report.issues || []) {
    lines.push(`ISSUE: ${issue.code || "issue"} ${issue.path || "unknown"} ${issue.message || ""}`.trim());
  }
  return redactSensitiveText(lines.join("\n"));
}

export function buildProviderDefaultEntries(provider = {}) {
  if (provider.id !== "codex") return [];
  const limits = provider.providerLimits || {};
  return [
    keyEntry(["approval_policy"], "never", "approval_policy"),
    keyEntry(["sandbox_mode"], "workspace-write", "sandbox_mode"),
    keyEntry(["default_permissions"], ":workspace", "default_permissions"),
    keyEntry(["web_search"], "live", "web_search"),
    keyEntry(["features", "apps"], true, "features.apps"),
    keyEntry(["features", "multi_agent"], true, "features.multi_agent"),
    keyEntry(["features", "memories"], true, "features.memories"),
    keyEntry(["features", "shell_snapshot"], true, "features.shell_snapshot"),
    keyEntry(["features", "codex_hooks"], true, "features.codex_hooks"),
    keyEntry(["features", "goals"], true, "features.goals"),
    keyEntry(["agents", "max_threads"], limits.defaultMaxThreads ?? 8, "agents.max_threads"),
    keyEntry(["agents", "max_depth"], limits.defaultMaxDepth ?? 1, "agents.max_depth"),
    keyEntry(["agents", "job_max_runtime_seconds"], limits.defaultJobRuntimeSeconds ?? 1800, "agents.job_max_runtime_seconds"),
    keyEntry(["apps", "_default", "enabled"], true, "apps._default.enabled"),
    {
      kind: "arrayTable",
      path: ["tool_suggest", "discoverables"],
      surface: "tool_suggest.discoverables",
      values: { type: "plugin", id: "supervibe@supervibe-marketplace" },
      match: { type: "plugin", id: "supervibe@supervibe-marketplace" },
    },
  ];
}

export function validateProviderConfigEntries({ providerId = "unknown", entries = [], manifest } = {}) {
  const provider = findProvider(manifest, providerId);
  const manifestSurfaces = new Set([
    ...(provider?.capabilities?.schema?.surfaces || []),
    ...(provider?.capabilities?.agents?.surfaces || []),
    ...(provider?.capabilities?.memory?.surfaces || []),
    ...(provider?.capabilities?.hooks?.surfaces || []),
    ...(provider?.capabilities?.permissions?.surfaces || []),
    ...(provider?.capabilities?.backgroundExecution?.surfaces || []),
    ...(providerId === "codex" ? CODEX_SCHEMA_SURFACES : []),
  ]);
  const issues = [];

  for (const entry of entries) {
    const surface = entry.surface || entry.path?.join(".");
    if (providerId === "codex" && UNSAFE_CODEX_SURFACES.has(surface)) {
      issues.push(issue("unsafe-surface", surface, "Surface is not schema-backed for automatic apply."));
      continue;
    }
    if (providerId === "codex" && !CODEX_SCHEMA_SURFACES.has(surface)) {
      issues.push(issue("unknown-codex-surface", surface, "Codex automatic apply only allows audited schema-backed surfaces."));
      continue;
    }
    if (manifestSurfaces.size > 0 && !manifestSurfaces.has(surface)) {
      const parentSurface = surface.split(".").slice(0, -1).join(".");
      if (!manifestSurfaces.has(parentSurface)) {
        issues.push(issue("manifest-surface-missing", surface, "Surface is not listed in the provider capability manifest."));
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

export function applyMissingProviderConfig({ text = "", format = "toml", entries = [], targetPath = "provider-config" } = {}) {
  const normalizedFormat = normalizeFormat(format);
  if (normalizedFormat === "toml") return applyTomlMissingOnly({ text, entries, targetPath });
  if (normalizedFormat === "json" || normalizedFormat === "jsonc") {
    return applyJsonMissingOnly({ text, entries, targetPath, jsonc: normalizedFormat === "jsonc" });
  }
  return {
    changed: false,
    blocked: true,
    output: text,
    operations: [],
    duplicateKeys: [],
    issues: [issue("unsupported-format", normalizedFormat, "Only TOML, JSON, and JSONC provider configs are supported.")],
    diff: createDryRunDiff(text, text, targetPath),
  };
}

export function detectDuplicateProviderConfigKeys(text = "", format = "toml") {
  const normalizedFormat = normalizeFormat(format);
  if (normalizedFormat === "toml") return detectTomlDuplicateKeys(text);
  if (normalizedFormat === "json" || normalizedFormat === "jsonc") return detectJsonDuplicateKeys(text);
  return [];
}

function createDryRunDiff(before = "", after = "", targetPath = "provider-config") {
  if (before === after) {
    return { changed: false, targetPath, preview: `--- ${targetPath}\n+++ ${targetPath}\n(no changes)` };
  }
  const beforeLines = normalizeLineEndings(before).split("\n");
  const afterLines = normalizeLineEndings(after).split("\n");
  const beforeSet = new Set(beforeLines);
  const additions = afterLines.filter((line) => line && !beforeSet.has(line));
  const preview = [
    `--- ${targetPath}`,
    `+++ ${targetPath}`,
    ...additions.slice(0, 80).map((line) => `+${line}`),
    additions.length > 80 ? `+... ${additions.length - 80} more addition(s)` : null,
  ].filter(Boolean).join("\n");
  return { changed: true, targetPath, additions, preview: redactSensitiveText(preview) };
}

function redactSensitiveText(value = "") {
  let redacted = String(value || "");
  for (const pattern of SECRET_PATTERNS) redacted = redacted.replace(pattern, REDACTED);
  return redacted;
}

export function resolveUserProviderConfigTarget({
  provider,
  providerId,
  projectRoot = process.cwd(),
  userHome,
  providerHome,
  env = process.env,
} = {}) {
  const selectedProviderId = provider?.id || providerId || "unknown";
  const runtimeConfig = normalizeRuntimeConfig(provider || { id: selectedProviderId });
  const configFile = runtimeConfig.configFile;
  const format = runtimeConfig.format || inferFormatFromPath(configFile);
  const resolvedProjectRoot = resolve(projectRoot || process.cwd());

  if (!runtimeConfig.writable) {
    return {
      scope: "manual-only",
      providerId: selectedProviderId,
      providerHome: null,
      configFile,
      absolutePath: null,
      targetPath: null,
      format,
      writable: false,
      providerHomeSource: "manual-only",
      projectRootBlocked: false,
      issue: issue("provider-config-manual-only", selectedProviderId, "Provider runtime config is manual-only."),
    };
  }

  const providerHomeSelection = selectProviderHome({
    runtimeConfig,
    providerHome,
    userHome,
    env,
  });
  const resolvedProviderHome = providerHomeSelection.value ? resolve(providerHomeSelection.value) : null;
  if (!resolvedProviderHome) {
    return blockedTarget({
      providerId: selectedProviderId,
      configFile,
      format,
      code: "provider-home-missing",
      message: "No user provider home could be resolved.",
    });
  }
  if (isAbsolute(configFile) || configFile.split(/[\\/]+/).includes("..")) {
    return blockedTarget({
      providerId: selectedProviderId,
      providerHome: resolvedProviderHome,
      configFile,
      format,
      code: "provider-config-file-unsafe",
      message: "Provider runtime config file must be relative to provider home.",
    });
  }

  const absolutePath = resolve(resolvedProviderHome, configFile);
  const underProviderHome = isPathInsideRoot(resolvedProviderHome, absolutePath);
  const underProjectRoot = isPathInsideRoot(resolvedProjectRoot, absolutePath);
  if (!underProviderHome || underProjectRoot) {
    return {
      scope: "user-provider-home",
      providerId: selectedProviderId,
      providerHome: normalizePathForReport(resolvedProviderHome),
      configFile,
      absolutePath: normalizePathForReport(absolutePath),
      targetPath: normalizePathForReport(absolutePath),
      format,
      writable: false,
      providerHomeSource: providerHomeSelection.source,
      projectRootBlocked: underProjectRoot,
      issue: issue(
        underProjectRoot ? "provider-config-target-inside-project-root" : "provider-config-target-outside-provider-home",
        normalizePathForReport(absolutePath),
        "Provider runtime config target must stay under provider home and outside the project root.",
      ),
    };
  }

  return {
    scope: "user-provider-home",
    providerId: selectedProviderId,
    providerHome: resolvedProviderHome,
    configFile,
    absolutePath,
    targetPath: normalizePathForReport(absolutePath),
    format,
    writable: true,
    providerHomeSource: providerHomeSelection.source,
    projectRootBlocked: false,
  };
}

export function detectProjectProviderRuntimeConfigs({ projectRoot = process.cwd() } = {}) {
  const root = resolve(projectRoot || process.cwd());
  return [
    { projectRel: ".codex/config.toml", providerId: "codex" },
    { projectRel: ".claude/settings.json", providerId: "claude-code" },
    { projectRel: ".claude/settings.local.json", providerId: "claude-code" },
    { projectRel: "config.toml", providerId: "unknown" },
  ]
    .map((entry) => ({ ...entry, absolutePath: resolve(root, ...entry.projectRel.split("/")) }))
    .filter((entry) => existsSync(entry.absolutePath))
    .map((entry) => ({ ...entry, absolutePath: normalizePathForReport(entry.absolutePath) }));
}

export async function applyUserProviderConfigDefaults({
  provider,
  providerId,
  projectRoot = process.cwd(),
  userHome,
  providerHome,
  env = process.env,
  manifest,
  write = false,
  checkedAt,
  now = new Date(),
} = {}) {
  const selectedProvider = provider || findProvider(manifest, providerId);
  const selectedProviderId = selectedProvider?.id || providerId || "unknown";
  const target = resolveUserProviderConfigTarget({
    provider: selectedProvider,
    providerId: selectedProviderId,
    projectRoot,
    userHome,
    providerHome,
    env,
  });
  const ignoredProjectConfigs = detectProjectProviderRuntimeConfigs({ projectRoot });
  const absolutePath = target.absolutePath && target.writable ? target.absolutePath : null;
  const existing = absolutePath ? existsSync(absolutePath) : false;
  const text = existing ? await readFile(absolutePath, "utf8") : "";
  const report = createProviderConfigApplyReport({
    provider: selectedProvider,
    providerId: selectedProviderId,
    text,
    format: target.format,
    targetPath: target.targetPath || "provider-config",
    manifest,
    checkedAt,
  });
  if (target.issue) {
    report.blocked = target.scope !== "manual-only";
    report.issues = [...(report.issues || []), target.issue];
  }
  report.scope = target.scope;
  report.status = target.scope === "manual-only" ? "manual-only" : report.blocked ? "blocked" : report.changed ? "changed" : "unchanged";
  report.ignoredProjectConfigs = ignoredProjectConfigs;

  const result = {
    schemaVersion: 1,
    providerId: selectedProviderId,
    scope: target.scope,
    targetPath: target.targetPath || null,
    providerHome: target.providerHome ? normalizePathForReport(target.providerHome) : null,
    providerHomeSource: target.providerHomeSource || null,
    format: report.format,
    writeRequested: write === true,
    writeMode: write ? "apply-add-missing-only" : "dry-run-add-missing-only",
    projectConfigPresent: ignoredProjectConfigs.length > 0,
    projectConfigPathSafe: false,
    ignoredProjectConfigs,
    homeConfigWriteAllowed: target.scope === "user-provider-home" && target.writable === true,
    homeConfigAction: target.scope === "manual-only" ? "manual-only" : "apply-add-missing-only",
    homeConfigPaths: target.targetPath ? [target.targetPath] : [],
    userConfigPresent: existing,
    changed: report.changed === true,
    blocked: report.blocked === true,
    skipped: false,
    skipReason: null,
    written: false,
    created: false,
    updated: false,
    backupPath: null,
    report,
    operationCounts: countProviderConfigOperations(report.operations || []),
  };

  if (!selectedProvider) {
    return {
      ...result,
      blocked: true,
      skipped: true,
      skipReason: "provider-not-found",
    };
  }
  if (target.scope === "manual-only") {
    return {
      ...result,
      skipped: true,
      skipReason: "provider-config-manual-only",
      changed: false,
    };
  }
  if (!target.writable || !absolutePath) {
    return {
      ...result,
      blocked: true,
      skipped: true,
      skipReason: target.issue?.code || "provider-config-target-invalid",
    };
  }
  if (!write || report.blocked || !report.changed) return result;

  const defaults = buildProviderDefaultEntries(selectedProvider);
  const rawApply = applyMissingProviderConfig({
    text,
    format: report.format,
    entries: defaults,
    targetPath: target.targetPath,
  });
  if (rawApply.blocked) {
    return {
      ...result,
      blocked: true,
      report: {
        ...report,
        blocked: true,
        issues: rawApply.issues || report.issues || [],
        duplicateKeys: rawApply.duplicateKeys || report.duplicateKeys || [],
      },
    };
  }

  await mkdir(dirname(absolutePath), { recursive: true });
  let backupPath = null;
  if (existing) {
    const stamp = toBackupStamp(now);
    backupPath = `${absolutePath}.supervibe-backup-${stamp}`;
    await copyFile(absolutePath, backupPath);
  }
  await writeFile(absolutePath, rawApply.output, "utf8");
  return {
    ...result,
    written: true,
    created: !existing,
    updated: existing,
    changed: true,
    backupPath: backupPath ? normalizePathForReport(backupPath) : null,
  };
}

function applyTomlMissingOnly({ text = "", entries = [], targetPath }) {
  const source = ensureTrailingNewline(normalizeLineEndings(text || ""));
  const duplicateKeys = detectTomlDuplicateKeys(source);
  if (duplicateKeys.length > 0) {
    return blockedResult(source, targetPath, duplicateKeys, "duplicate-provider-config-key");
  }

  const existingPaths = listTomlKeyPaths(source);
  const lines = source.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const rootLines = [];
  const existingTableAdds = new Map();
  const missingTableAdds = new Map();
  const arrayTableAdds = [];
  const operations = [];

  for (const entry of entries) {
    if (entry.kind === "arrayTable") {
      if (tomlArrayTableContains(source, entry.path.join("."), entry.match || entry.values || {})) {
        operations.push(operation("preserve-existing", entry.surface, "existing"));
        continue;
      }
      arrayTableAdds.push([`[[${entry.path.join(".")}]]`, ...Object.entries(entry.values || {}).map(([key, value]) => `${key} = ${formatTomlValue(value)}`)]);
      operations.push(operation("add-missing-array-table", entry.surface, "planned"));
      continue;
    }

    const fullPath = entry.path.join(".");
    if (existingPaths.has(fullPath)) {
      operations.push(operation("preserve-existing", fullPath, "existing"));
      continue;
    }

    const tablePath = entry.path.slice(0, -1).join(".");
    const key = entry.path.at(-1);
    const line = `${key} = ${formatTomlValue(entry.value)}`;
    if (!tablePath) {
      rootLines.push(line);
    } else {
      const range = findTomlTableRange(lines, tablePath);
      if (range) {
        if (!existingTableAdds.has(tablePath)) existingTableAdds.set(tablePath, []);
        existingTableAdds.get(tablePath).push(line);
      } else {
        if (!missingTableAdds.has(tablePath)) missingTableAdds.set(tablePath, []);
        missingTableAdds.get(tablePath).push(line);
      }
    }
    operations.push(operation("add-missing", fullPath, "planned"));
  }

  const outputLines = [...lines];
  const insertions = [];
  if (rootLines.length > 0) {
    const firstTable = outputLines.findIndex((candidate) => parseTomlTableHeader(candidate));
    insertions.push({ index: firstTable === -1 ? outputLines.length : firstTable, lines: rootLines });
  }
  for (const [tablePath, tableLines] of existingTableAdds.entries()) {
    const range = findTomlTableRange(outputLines, tablePath);
    if (range) insertions.push({ index: range.endIndex, lines: tableLines });
  }
  for (const insertion of insertions.sort((a, b) => b.index - a.index)) {
    outputLines.splice(insertion.index, 0, ...insertion.lines);
  }
  for (const [tablePath, tableLines] of missingTableAdds.entries()) {
    appendTomlBlock(outputLines, [`[${tablePath}]`, ...tableLines]);
  }
  for (const tableLines of arrayTableAdds) {
    appendTomlBlock(outputLines, tableLines);
  }
  const output = `${outputLines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
  return {
    changed: output !== source,
    blocked: false,
    output,
    operations,
    duplicateKeys,
    issues: [],
    diff: createDryRunDiff(source, output, targetPath),
  };
}

function applyJsonMissingOnly({ text = "", entries = [], targetPath, jsonc = false }) {
  const source = ensureJsonObjectText(normalizeLineEndings(text || ""));
  const duplicateKeys = detectJsonDuplicateKeys(source);
  if (duplicateKeys.length > 0) {
    return blockedResult(source, targetPath, duplicateKeys, "duplicate-provider-config-key");
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonc ? stripJsonComments(source) : source);
  } catch (error) {
    return {
      changed: false,
      blocked: true,
      output: source,
      operations: [],
      duplicateKeys,
      issues: [issue("parse-failed", targetPath, error.message)],
      diff: createDryRunDiff(source, source, targetPath),
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      changed: false,
      blocked: true,
      output: source,
      operations: [],
      duplicateKeys,
      issues: [issue("root-not-object", targetPath, "Provider JSON config root must be an object.")],
      diff: createDryRunDiff(source, source, targetPath),
    };
  }

  let output = source;
  const operations = [];
  for (const entry of entries) {
    if (entry.kind === "arrayTable") {
      if (hasDeepOwn(parsed, entry.path) && !Array.isArray(getDeep(parsed, entry.path))) {
        operations.push(operation("preserve-existing", entry.surface, "existing-non-array"));
        continue;
      }
      if (jsonArrayContains(parsed, entry.path, entry.match || entry.values || {})) {
        operations.push(operation("preserve-existing", entry.surface, "existing"));
        continue;
      }
      output = insertJsonArrayObject(output, entry.path, entry.values || {});
      setJsonArrayObject(parsed, entry.path, entry.values || {});
      operations.push(operation("add-missing-array-item", entry.surface, "planned"));
      continue;
    }
    if (hasDeepOwn(parsed, entry.path)) {
      operations.push(operation("preserve-existing", entry.path.join("."), "existing"));
      continue;
    }
    output = insertJsonPropertyPath(output, entry.path, entry.value);
    setDeepMissing(parsed, entry.path, entry.value);
    operations.push(operation("add-missing", entry.path.join("."), "planned"));
  }

  output = ensureTrailingNewline(output);
  return {
    changed: output !== source,
    blocked: false,
    output,
    operations,
    duplicateKeys,
    issues: [],
    diff: createDryRunDiff(source, output, targetPath),
  };
}

function keyEntry(path, value, surface) {
  return { kind: "key", path, value, surface };
}

function operation(action, path, status) {
  return { action, path, status };
}

function issue(code, path, message) {
  return { code, path, message };
}

function blockedResult(source, targetPath, duplicateKeys, code) {
  return {
    changed: false,
    blocked: true,
    output: source,
    operations: [],
    duplicateKeys,
    issues: [issue(code, duplicateKeys.map((entry) => entry.path).join(","), "Duplicate provider config keys must be resolved before safe additive apply.")],
    diff: createDryRunDiff(source, source, targetPath),
  };
}

function findProvider(manifest, providerId) {
  return (manifest?.providers || []).find((candidate) => candidate.id === providerId) || null;
}

function normalizeRuntimeConfig(provider = {}) {
  const configured = provider.runtimeConfig && typeof provider.runtimeConfig === "object" ? provider.runtimeConfig : null;
  if (configured) {
    return {
      scope: configured.scope || "manual-only",
      providerHomeEnv: Array.isArray(configured.providerHomeEnv) ? configured.providerHomeEnv : [configured.providerHomeEnv].filter(Boolean),
      defaultProviderHomeSegments: configured.defaultProviderHomeSegments || defaultProviderHomeSegments(provider.id),
      configFile: configured.configFile || defaultConfigFile(provider.id),
      format: configured.format || inferFormatFromPath(configured.configFile || defaultConfigFile(provider.id)),
      mergeStrategy: configured.mergeStrategy || "add-missing-only",
      writable: configured.writable === true && configured.scope === "user-provider-home",
    };
  }
  const homeConfig = (provider?.paths?.config || []).find((candidate) => isHomeProviderPath(candidate));
  const withoutHome = homeConfig ? String(homeConfig).replace(/^~\//, "") : null;
  const segments = withoutHome ? withoutHome.split(/[\\/]+/) : defaultProviderHomeSegments(provider.id);
  const configFile = segments.length > 1 ? segments.slice(1).join("/") : defaultConfigFile(provider.id);
  return {
    scope: provider.id === "codex" ? "user-provider-home" : "manual-only",
    providerHomeEnv: defaultProviderHomeEnv(provider.id),
    defaultProviderHomeSegments: segments.length > 1 ? [segments[0]] : defaultProviderHomeSegments(provider.id),
    configFile,
    format: inferFormatFromPath(configFile),
    mergeStrategy: "add-missing-only",
    writable: provider.id === "codex",
  };
}

function defaultProviderHomeEnv(providerId = "") {
  if (providerId === "codex") return ["CODEX_HOME"];
  if (providerId === "claude-code") return ["CLAUDE_HOME"];
  return [];
}

function defaultProviderHomeSegments(providerId = "") {
  if (providerId === "codex") return [".codex"];
  if (providerId === "claude-code") return [".claude"];
  return [`.${providerId || "provider"}`];
}

function defaultConfigFile(providerId = "") {
  if (providerId === "codex") return "config.toml";
  if (providerId === "claude-code") return "settings.json";
  return "config.toml";
}

function selectProviderHome({ runtimeConfig, providerHome, userHome, env = process.env } = {}) {
  if (providerHome) return { value: providerHome, source: "providerHome" };
  for (const key of runtimeConfig.providerHomeEnv || []) {
    if (env?.[key]) return { value: env[key], source: key };
  }
  const selectedUserHome = userHome || env?.USERPROFILE || env?.HOME || homedir();
  if (!selectedUserHome) return { value: null, source: "missing" };
  return {
    value: resolve(selectedUserHome, ...(runtimeConfig.defaultProviderHomeSegments || [])),
    source: userHome ? "userHome" : env?.USERPROFILE ? "USERPROFILE" : env?.HOME ? "HOME" : "os.homedir",
  };
}

function blockedTarget({ providerId, providerHome = null, configFile, format, code, message }) {
  return {
    scope: "user-provider-home",
    providerId,
    providerHome: providerHome ? normalizePathForReport(providerHome) : null,
    configFile,
    absolutePath: null,
    targetPath: null,
    format,
    writable: false,
    providerHomeSource: "blocked",
    projectRootBlocked: false,
    issue: issue(code, configFile || providerId, message),
  };
}

function normalizePathForReport(path = "") {
  return String(path || "").replace(/\\/g, "/");
}
function selectProjectProviderConfigPath(provider = {}) {
  return (provider?.paths?.config || []).find((path) => !isHomeProviderPath(path) && !isEnvironmentPath(path)) || null;
}

function listHomeProviderConfigPaths(provider = {}) {
  return (provider?.paths?.config || []).filter((path) => isHomeProviderPath(path));
}

function isHomeProviderPath(path = "") {
  return String(path || "").startsWith("~/");
}

function isEnvironmentPath(path = "") {
  const value = String(path || "");
  return value.startsWith("$") || value.startsWith("%") || value.includes("${");
}

function countProviderConfigOperations(operations = []) {
  return operations.reduce((counts, entry) => {
    if (entry.status === "existing" || entry.action === "preserve-existing") counts.preserved += 1;
    else if (entry.status === "planned" || String(entry.action || "").startsWith("add-missing")) counts.added += 1;
    else counts.other += 1;
    return counts;
  }, { added: 0, preserved: 0, other: 0 });
}

function toBackupStamp(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  return date.toISOString().replace(/[^0-9]/g, "").slice(0, 14);
}

function toProjectRelative(rootDir, absolutePath) {
  const root = resolve(rootDir);
  const absolute = resolve(absolutePath);
  if (absolute === root) return ".";
  if (absolute.startsWith(`${root}\\`) || absolute.startsWith(`${root}/`)) {
    return absolute.slice(root.length + 1).replace(/\\/g, "/");
  }
  return absolute.replace(/\\/g, "/");
}

function isPathInsideRoot(rootDir, absolutePath) {
  const root = resolve(rootDir);
  const absolute = resolve(absolutePath);
  return absolute === root || absolute.startsWith(`${root}\\`) || absolute.startsWith(`${root}/`);
}

function inferFormatFromPath(path = "") {
  if (/\.jsonc$/i.test(path)) return "jsonc";
  if (/\.json$/i.test(path)) return "json";
  return "toml";
}

function normalizeFormat(format = "toml") {
  const value = String(format || "toml").toLowerCase();
  if (value === "jsonc" || value === "json" || value === "toml") return value;
  return value;
}

function normalizeLineEndings(value = "") {
  return String(value || "").replace(/\r\n?/g, "\n");
}

function ensureTrailingNewline(value = "") {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function formatTomlValue(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return JSON.stringify(String(value));
}

function appendTomlBlock(lines, blockLines) {
  if (lines.length > 0 && lines.at(-1) !== "") lines.push("");
  lines.push(...blockLines);
}

function stripTomlComment(line = "") {
  let quote = null;
  let escaped = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
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

function listTomlKeyPaths(text = "") {
  const paths = new Set();
  let table = "";
  for (const line of normalizeLineEndings(text).split("\n")) {
    const header = parseTomlTableHeader(line);
    if (header) {
      table = header.table;
      continue;
    }
    const pair = parseTomlKeyValue(line);
    if (!pair) continue;
    paths.add(table ? `${table}.${pair.key}` : pair.key);
  }
  return paths;
}

function detectTomlDuplicateKeys(text = "") {
  const duplicates = [];
  const seen = new Map();
  let table = "";
  const arrayCounts = new Map();
  let arrayInstance = "";
  const lines = normalizeLineEndings(text).split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const header = parseTomlTableHeader(lines[index]);
    if (header) {
      table = header.table;
      if (header.array) {
        const nextCount = (arrayCounts.get(table) || 0) + 1;
        arrayCounts.set(table, nextCount);
        arrayInstance = `${table}[${nextCount}]`;
      } else {
        arrayInstance = "";
      }
      continue;
    }
    const pair = parseTomlKeyValue(lines[index]);
    if (!pair) continue;
    const path = table ? `${table}.${pair.key}` : pair.key;
    const key = arrayInstance ? `${arrayInstance}.${pair.key}` : path;
    if (seen.has(key)) {
      duplicates.push({ path, line: index + 1, firstLine: seen.get(key) });
    } else {
      seen.set(key, index + 1);
    }
  }
  return duplicates;
}

function findTomlTableRange(lines = [], tablePath = "") {
  let headerIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const header = parseTomlTableHeader(lines[index]);
    if (header && !header.array && header.table === tablePath) {
      headerIndex = index;
      break;
    }
  }
  if (headerIndex === -1) return null;
  let endIndex = lines.length;
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    if (parseTomlTableHeader(lines[index])) {
      endIndex = index;
      break;
    }
  }
  return { headerIndex, endIndex };
}

function tomlArrayTableContains(text = "", tablePath = "", match = {}) {
  const lines = normalizeLineEndings(text).split("\n");
  let inTarget = false;
  let values = {};
  const flush = () => {
    if (!inTarget) return false;
    return Object.entries(match).every(([key, value]) => values[key] === value);
  };
  for (const line of lines) {
    const header = parseTomlTableHeader(line);
    if (header) {
      if (flush()) return true;
      inTarget = header.array && header.table === tablePath;
      values = {};
      continue;
    }
    if (!inTarget) continue;
    const pair = parseTomlKeyValue(line);
    if (pair) values[pair.key] = pair.value;
  }
  return flush();
}

function stripJsonComments(text = "") {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      output += char;
      continue;
    }
    if (char === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      output += "\n";
      continue;
    }
    if (char === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i += 1;
      output += " ";
      continue;
    }
    output += char;
  }
  return removeTrailingJsonCommas(output);
}

function removeTrailingJsonCommas(text = "") {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      output += char;
      continue;
    }
    if (char === ",") {
      let cursor = index + 1;
      while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
      if (text[cursor] === "}" || text[cursor] === "]") continue;
    }
    output += char;
  }
  return output;
}

function ensureJsonObjectText(text = "") {
  const source = text.trim() ? text : "{\n}\n";
  return ensureTrailingNewline(source);
}

function detectJsonDuplicateKeys(text = "") {
  const duplicates = [];
  const stack = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === "/" && text[index + 1] === "/") {
      index = skipLineComment(text, index);
      continue;
    }
    if (char === "/" && text[index + 1] === "*") {
      index = skipBlockComment(text, index);
      continue;
    }
    if (char === "{") {
      const parent = stack.at(-1);
      const pendingPath = parent?.pendingPath || [];
      if (parent) delete parent.pendingPath;
      stack.push({ keys: new Map(), path: pendingPath });
      index += 1;
      continue;
    }
    if (char === "}") {
      stack.pop();
      index += 1;
      continue;
    }
    if (char === "\"") {
      const parsed = readJsonString(text, index);
      let cursor = skipWhitespaceAndComments(text, parsed.end);
      if (text[cursor] === ":" && stack.length > 0) {
        const current = stack.at(-1);
        const path = [...(current.path || []), parsed.value].join(".");
        if (current.keys.has(parsed.value)) {
          duplicates.push({ path, line: lineNumberAt(text, index), firstLine: current.keys.get(parsed.value) });
        } else {
          current.keys.set(parsed.value, lineNumberAt(text, index));
        }
        cursor = skipWhitespaceAndComments(text, cursor + 1);
        if (text[cursor] === "{") current.pendingPath = [...(current.path || []), parsed.value];
      }
      index = parsed.end;
      continue;
    }
    index += 1;
  }
  return duplicates;
}

function insertJsonPropertyPath(text, path, value) {
  const root = findRootObjectRange(text);
  if (!root) return text;
  if (path.length === 1) return insertPropertyInObject(text, root, path[0], value);
  const parentPath = path.slice(0, -1);
  const parent = findJsonObjectRangeForPath(text, parentPath);
  if (parent) return insertPropertyInObject(text, parent, path.at(-1), value);
  const nearestParent = findNearestExistingObject(text, parentPath);
  const insertionKey = path[nearestParent.depth] || path[0];
  const nestedValue = buildNestedObject(path.slice(nearestParent.depth + 1), value);
  return insertPropertyInObject(text, nearestParent.range, insertionKey, nestedValue);
}

function insertJsonArrayObject(text, path, value) {
  const parsed = safeParseJsonc(text);
  if (hasDeepOwn(parsed, path)) {
    const range = findJsonArrayRangeForPath(text, path);
    if (range) return insertArrayObject(text, range, value);
  }
  return insertJsonPropertyPath(text, path, [value]);
}

function findNearestExistingObject(text, path) {
  for (let depth = path.length; depth >= 0; depth -= 1) {
    const range = depth === 0 ? findRootObjectRange(text) : findJsonObjectRangeForPath(text, path.slice(0, depth));
    if (range) return { depth, range };
  }
  return { depth: 0, range: findRootObjectRange(text) };
}

function buildNestedObject(path, value) {
  if (path.length === 0) return value;
  return { [path[0]]: buildNestedObject(path.slice(1), value) };
}

function insertPropertyInObject(text, range, key, value) {
  const closeIndex = range.end;
  const closeIndent = lineIndentBefore(text, closeIndex);
  const propertyIndent = `${closeIndent}  `;
  const content = text.slice(range.start + 1, range.end);
  const empty = isObjectEmpty(content);
  const needsComma = !empty && !content.trimEnd().endsWith(",");
  const serialized = serializeJsonValue(value, propertyIndent);
  const insertion = `${needsComma ? "," : ""}\n${propertyIndent}${JSON.stringify(key)}: ${serialized}\n${closeIndent}`;
  return `${text.slice(0, closeIndex)}${insertion}${text.slice(closeIndex)}`;
}

function insertArrayObject(text, range, value) {
  const closeIndex = range.end;
  const closeIndent = lineIndentBefore(text, closeIndex);
  const itemIndent = `${closeIndent}  `;
  const content = text.slice(range.start + 1, range.end);
  const empty = isObjectEmpty(content);
  const needsComma = !empty && !content.trimEnd().endsWith(",");
  const serialized = serializeJsonValue(value, itemIndent);
  const insertion = `${needsComma ? "," : ""}\n${itemIndent}${serialized}\n${closeIndent}`;
  return `${text.slice(0, closeIndex)}${insertion}${text.slice(closeIndex)}`;
}

function serializeJsonValue(value, indent = "") {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const childIndent = `${indent}  `;
    return `[\n${childIndent}${value.map((entry) => serializeJsonValue(entry, childIndent)).join(`,\n${childIndent}`)}\n${indent}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    const childIndent = `${indent}  `;
    return `{\n${entries.map(([key, child]) => `${childIndent}${JSON.stringify(key)}: ${serializeJsonValue(child, childIndent)}`).join(",\n")}\n${indent}}`;
  }
  return JSON.stringify(value);
}

function findRootObjectRange(text = "") {
  const start = text.indexOf("{");
  if (start === -1) return null;
  const end = findMatching(text, start, "{", "}");
  return end === -1 ? null : { start, end };
}

function findJsonObjectRangeForPath(text, path = []) {
  let range = findRootObjectRange(text);
  for (const segment of path) {
    const property = findDirectJsonProperty(text, range, segment);
    if (!property || text[property.valueStart] !== "{") return null;
    const end = findMatching(text, property.valueStart, "{", "}");
    if (end === -1) return null;
    range = { start: property.valueStart, end };
  }
  return range;
}

function findJsonArrayRangeForPath(text, path = []) {
  const parent = path.length > 1 ? findJsonObjectRangeForPath(text, path.slice(0, -1)) : findRootObjectRange(text);
  const property = findDirectJsonProperty(text, parent, path.at(-1));
  if (!property || text[property.valueStart] !== "[") return null;
  const end = findMatching(text, property.valueStart, "[", "]");
  return end === -1 ? null : { start: property.valueStart, end };
}

function findDirectJsonProperty(text, range, key) {
  if (!range) return null;
  let index = range.start + 1;
  while (index < range.end) {
    index = skipWhitespaceAndComments(text, index);
    if (text[index] === "\"") {
      const parsed = readJsonString(text, index);
      let cursor = skipWhitespaceAndComments(text, parsed.end);
      if (text[cursor] === ":") {
        const valueStart = skipWhitespaceAndComments(text, cursor + 1);
        if (parsed.value === key) return { key, keyStart: index, valueStart };
        index = skipJsonValue(text, valueStart);
        continue;
      }
      index = parsed.end;
      continue;
    }
    if (text[index] === "{" || text[index] === "[") {
      const end = findMatching(text, index, text[index], text[index] === "{" ? "}" : "]");
      index = end === -1 ? index + 1 : end + 1;
      continue;
    }
    index += 1;
  }
  return null;
}

function skipJsonValue(text, index) {
  index = skipWhitespaceAndComments(text, index);
  const char = text[index];
  if (char === "\"") return readJsonString(text, index).end;
  if (char === "{") {
    const end = findMatching(text, index, "{", "}");
    return end === -1 ? index + 1 : end + 1;
  }
  if (char === "[") {
    const end = findMatching(text, index, "[", "]");
    return end === -1 ? index + 1 : end + 1;
  }
  while (index < text.length && !/[,\]}]/.test(text[index])) index += 1;
  return index;
}

function findMatching(text, start, open, close) {
  let depth = 0;
  let index = start;
  while (index < text.length) {
    const char = text[index];
    if (char === "/" && text[index + 1] === "/") {
      index = skipLineComment(text, index);
      continue;
    }
    if (char === "/" && text[index + 1] === "*") {
      index = skipBlockComment(text, index);
      continue;
    }
    if (char === "\"") {
      index = readJsonString(text, index).end;
      continue;
    }
    if (char === open) depth += 1;
    if (char === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
    index += 1;
  }
  return -1;
}

function readJsonString(text, start) {
  let value = "";
  let escaped = false;
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      value += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") return { value, end: index + 1 };
    value += char;
  }
  return { value, end: text.length };
}

function skipWhitespaceAndComments(text, index) {
  let cursor = index;
  while (cursor < text.length) {
    if (/\s/.test(text[cursor])) {
      cursor += 1;
      continue;
    }
    if (text[cursor] === "/" && text[cursor + 1] === "/") {
      cursor = skipLineComment(text, cursor);
      continue;
    }
    if (text[cursor] === "/" && text[cursor + 1] === "*") {
      cursor = skipBlockComment(text, cursor);
      continue;
    }
    break;
  }
  return cursor;
}

function skipLineComment(text, index) {
  let cursor = index + 2;
  while (cursor < text.length && text[cursor] !== "\n") cursor += 1;
  return cursor;
}

function skipBlockComment(text, index) {
  let cursor = index + 2;
  while (cursor < text.length && !(text[cursor] === "*" && text[cursor + 1] === "/")) cursor += 1;
  return Math.min(cursor + 2, text.length);
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

function lineIndentBefore(text, index) {
  const lineStart = text.lastIndexOf("\n", index - 1) + 1;
  const line = text.slice(lineStart, index);
  return line.match(/^\s*/)?.[0] || "";
}

function isObjectEmpty(value = "") {
  const clean = stripJsonComments(value).trim();
  return clean.length === 0;
}

function safeParseJsonc(text = "") {
  try {
    return JSON.parse(stripJsonComments(text));
  } catch {
    return {};
  }
}

function hasDeepOwn(object, path = []) {
  let cursor = object;
  for (const segment of path) {
    if (!cursor || typeof cursor !== "object" || !Object.prototype.hasOwnProperty.call(cursor, segment)) return false;
    cursor = cursor[segment];
  }
  return true;
}

function getDeep(object, path = []) {
  let cursor = object;
  for (const segment of path) {
    if (!cursor || typeof cursor !== "object" || !Object.prototype.hasOwnProperty.call(cursor, segment)) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

function setDeepMissing(object, path = [], value) {
  let cursor = object;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    if (!cursor[segment] || typeof cursor[segment] !== "object" || Array.isArray(cursor[segment])) cursor[segment] = {};
    cursor = cursor[segment];
  }
  const key = path.at(-1);
  if (!Object.prototype.hasOwnProperty.call(cursor, key)) cursor[key] = value;
}

function jsonArrayContains(object, path = [], match = {}) {
  let cursor = object;
  for (const segment of path) {
    if (!cursor || typeof cursor !== "object") return false;
    cursor = cursor[segment];
  }
  if (!Array.isArray(cursor)) return false;
  return cursor.some((entry) => entry && typeof entry === "object" && Object.entries(match).every(([key, value]) => entry[key] === value));
}

function setJsonArrayObject(object, path = [], value = {}) {
  let cursor = object;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    if (!cursor[segment] || typeof cursor[segment] !== "object" || Array.isArray(cursor[segment])) cursor[segment] = {};
    cursor = cursor[segment];
  }
  const key = path.at(-1);
  if (!Array.isArray(cursor[key])) cursor[key] = [];
  cursor[key].push(value);
}
