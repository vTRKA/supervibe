import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(LIB_DIR, "..", "..");
const DEFAULT_MANIFEST_PATH = join(DEFAULT_ROOT, "tests", "fixtures", "provider-configs", "provider-capabilities.json");

const REDACTED = "[REDACTED]";
const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:api[_-]?key|token|secret|password|passwd|private[_-]?key)\s*[:=]\s*["']?[^"'\s,;}]+/gi,
  /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
];

export function loadProviderCapabilities(options = {}) {
  const manifestPath = resolve(options.rootDir || DEFAULT_ROOT, options.manifestPath || DEFAULT_MANIFEST_PATH);
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

export function createProviderConfigDoctorReport(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const homeDir = resolve(options.homeDir || process.env.USERPROFILE || process.env.HOME || rootDir);
  const manifest = options.manifest || loadProviderCapabilities({ rootDir: options.pluginRoot || DEFAULT_ROOT, manifestPath: options.manifestPath });
  const providers = (manifest.providers || [])
    .filter((provider) => !options.provider || provider.id === options.provider)
    .map((provider) => inspectProvider(provider, { rootDir, homeDir }));
  const missingRecommendationCount = providers.reduce((sum, provider) => sum + provider.recommendations.length, 0);
  return {
    schemaVersion: 1,
    status: missingRecommendationCount > 0 ? "recommendations" : "ok",
    checkedAt: manifest.checkedAt,
    writeMode: "preview-only",
    mutationAllowed: false,
    rootDir,
    homeDir: redactHomePath(homeDir),
    providers,
    missingRecommendationCount,
    nextAction: "review preview recommendations; explicit apply flow is intentionally not implemented here",
  };
}

export function formatProviderConfigDoctorReport(report = {}) {
  const lines = [
    "SUPERVIBE_PROVIDER_CONFIG_DOCTOR",
    `STATUS: ${report.status || "unknown"}`,
    `CHECKED_AT: ${report.checkedAt || "unknown"}`,
    `WRITE_MODE: ${report.writeMode || "preview-only"}`,
    `MUTATION_ALLOWED: ${report.mutationAllowed === true}`,
    `PROVIDERS: ${(report.providers || []).length}`,
    `MISSING_RECOMMENDATIONS: ${report.missingRecommendationCount || 0}`,
  ];
  for (const provider of report.providers || []) {
    lines.push([
      "PROVIDER:",
      provider.id,
      `projectConfig=${provider.configPresence.projectConfig.present ? "present" : "missing"}`,
      `userConfig=${provider.configPresence.userConfig.present ? "present" : "missing"}`,
      `projectPaths=${provider.configPresence.projectPaths.presentCount}/${provider.configPresence.projectPaths.total}`,
      `secrets=${provider.secretHandling}`,
    ].join(" "));
    for (const recommendation of provider.recommendations) {
      lines.push(`RECOMMENDATION: ${provider.id} ${recommendation.id} target=${recommendation.target} tier=${recommendation.tier || "safe-default"} source=${recommendation.sourceUrl || "manifest"} previewOnly=${recommendation.previewOnly} reason=${recommendation.reason}`);
      lines.push(`PATCH_PREVIEW: ${provider.id} ${recommendation.preview}`);
    }
  }
  lines.push(`NEXT_ACTION: ${report.nextAction || "review recommendations"}`);
  return redactSensitiveText(lines.join("\n"));
}

function redactSensitiveText(value = "") {
  let redacted = String(value || "");
  for (const pattern of SECRET_PATTERNS) redacted = redacted.replace(pattern, REDACTED);
  return redacted;
}

function inspectProvider(provider, { rootDir, homeDir }) {
  const configPaths = provider.paths?.config || [];
  const projectPaths = provider.paths?.project || [];
  const userConfigCandidates = configPaths.filter((path) => path.startsWith("~/"));
  const projectConfigCandidates = configPaths.filter((path) => !path.startsWith("~/") && !isEnvironmentPath(path));
  const projectPathStatuses = projectPaths.map((path) => presence(path, { rootDir, homeDir }));
  const projectConfigStatuses = projectConfigCandidates.map((path) => presence(path, { rootDir, homeDir }));
  const userConfigStatuses = userConfigCandidates.map((path) => presence(path, { rootDir, homeDir }));
  const recommendations = buildProviderRecommendations(provider, {
    projectConfigStatuses,
    userConfigStatuses,
  });

  return {
    id: provider.id,
    name: provider.name,
    checkedAt: provider.sources?.[0]?.checkedAt || null,
    configPresence: {
      projectConfig: summarizePresence(projectConfigStatuses),
      userConfig: summarizePresence(userConfigStatuses),
      projectPaths: summarizePresence(projectPathStatuses),
    },
    providerLimits: provider.providerLimits || {},
    recommendations,
    secretHandling: "presence-only-redacted",
    sources: provider.sources || [],
  };
}

function buildProviderRecommendations(provider, { projectConfigStatuses = [], userConfigStatuses = [] } = {}) {
  const recommendations = [];
  const projectConfig = projectConfigStatuses[0] || null;
  const userConfig = userConfigStatuses[0] || null;
  if (!projectConfig?.present) {
    recommendations.push({
      id: "create-project-config-preview",
      target: projectConfig?.displayPath || provider.paths?.config?.find((path) => !path.startsWith("~/")) || "project-config",
      tier: "safe-default",
      sourceUrl: provider.sources?.[0]?.url || "manifest",
      previewOnly: true,
      reason: "project provider config is missing or not visible",
      preview: previewForProvider(provider),
    });
  }
  if (!userConfig?.present && provider.paths?.config?.some((path) => path.startsWith("~/"))) {
    recommendations.push({
      id: "home-config-preview-only",
      target: userConfig?.displayPath || provider.paths.config.find((path) => path.startsWith("~/")),
      tier: "manual-only",
      sourceUrl: provider.sources?.[0]?.url || "manifest",
      previewOnly: true,
      reason: "home config presence is missing; Supervibe will not write it automatically",
      preview: "show instructions only; require explicit user-owned home-config edit",
    });
  }
  if (provider.providerLimits?.maxThreadsKey || provider.providerLimits?.jobRuntimeKey) {
    recommendations.push({
      id: "safe-power-settings-preview",
      target: projectConfig?.displayPath || provider.paths?.config?.[0] || "project-config",
      tier: "max-power",
      sourceUrl: provider.sources?.[0]?.url || "manifest",
      previewOnly: true,
      reason: "provider limits can improve parallelism when bounded by Supervibe write-set/session locks",
      preview: formatLimitPreview(provider),
    });
  }
  for (const preset of provider.powerPresets || []) {
    recommendations.push({
      id: `power-${slugify(preset.setting || preset.outcome || preset.tier)}`,
      target: projectConfig?.displayPath || provider.paths?.config?.[0] || "project-config",
      tier: preset.tier || "safe-default",
      sourceUrl: preset.sourceUrl || provider.sources?.[0]?.url || "manifest",
      checkedAt: preset.checkedAt || provider.sources?.[0]?.checkedAt || null,
      previewOnly: preset.previewOnly !== false,
      reason: `${preset.outcome || "provider power"}: ${preset.description || preset.setting || "review setting"}`,
      preview: preset.preview || `${preset.setting}: review provider docs`,
    });
  }
  return recommendations;
}

function previewForProvider(provider) {
  if (provider.id === "codex") return "[features].multi_agent=true; [agents].max_threads=6; [agents].max_depth=1";
  if (provider.id === "claude-code") return "create .claude/settings.json with permissions deny rules, MCP allowlist, and hook placeholders";
  if (provider.id === "gemini-cli") return "create .gemini/settings.json with checkpointing, plan approval mode, MCP tool filters, and privacy settings";
  if (provider.id === "cursor") return "create scoped .cursor/rules and .cursor/mcp.json previews; do not auto-create remote background-agent config";
  if (provider.id === "opencode") return "create opencode.json with schema, permission ask defaults, watcher ignores, and per-agent permission narrowing";
  return "create provider project config preview";
}

function formatLimitPreview(provider) {
  const limits = provider.providerLimits || {};
  return [
    limits.maxThreadsKey ? `${limits.maxThreadsKey}=${limits.defaultMaxThreads ?? "review"}` : null,
    limits.maxDepthKey ? `${limits.maxDepthKey}=${limits.defaultMaxDepth ?? "review"}` : null,
    limits.jobRuntimeKey ? `${limits.jobRuntimeKey}=${limits.defaultJobRuntimeSeconds ?? "review"}` : null,
  ].filter(Boolean).join("; ") || (limits.notes || "review provider-specific execution limits");
}

function presence(path, { rootDir, homeDir }) {
  const resolved = resolveProviderPath(path, { rootDir, homeDir });
  return {
    displayPath: path,
    present: existsSync(resolved),
    readable: existsSync(resolved),
    resolvedPath: redactHomePath(resolved),
  };
}

function summarizePresence(entries = []) {
  const present = entries.filter((entry) => entry.present);
  return {
    present: present.length > 0,
    presentCount: present.length,
    total: entries.length,
    paths: entries.map(({ displayPath, present: pathPresent }) => ({ displayPath, present: pathPresent })),
  };
}

function resolveProviderPath(path, { rootDir, homeDir }) {
  if (path.startsWith("~/")) return resolve(homeDir, path.slice(2));
  if (isEnvironmentPath(path)) return resolve(rootDir, ".supervibe", "provider-env-placeholders", sanitizePath(path));
  return resolve(rootDir, path);
}

function isEnvironmentPath(path = "") {
  return /^[A-Z0-9_]+$/.test(path);
}

function sanitizePath(path = "") {
  return String(path || "").replace(/[^A-Za-z0-9._-]+/g, "-");
}

function slugify(value = "") {
  return String(value || "setting").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "setting";
}

function redactHomePath(path = "") {
  const home = process.env.USERPROFILE || process.env.HOME;
  if (!home) return path;
  return String(path).replaceAll(home, "~");
}
