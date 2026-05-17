import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { auditPluginPackage } from "./supervibe-plugin-package-audit.mjs";

export const INSTALL_LIFECYCLE_REPORT_PATH = ".supervibe/audits/install-lifecycle/latest.json";

export async function runInstallLifecycleAudit({
  rootDir = process.cwd(),
  homeDir = homedir(),
  expectedHosts = parseExpectedHosts(process.env.SUPERVIBE_INSTALL_HOSTS),
  writeReport = true,
} = {}) {
  const root = resolve(rootDir);
  const [packageAudit, packageJson, gitStatusLines] = await Promise.all([
    auditPluginPackage({ rootDir: root }),
    readJsonOptional(join(root, "package.json")),
    collectGitStatusLines(root),
  ]);

  const data = {
    rootDir: root,
    homeDir,
    version: packageJson?.version || null,
    packageAudit,
    registryPresent: existsSync(join(root, "registry.yaml")),
    gitStatusLines,
    hostRegistrations: await inspectHostRegistrations({ rootDir: root, homeDir, expectedHosts }),
    expectedHosts,
  };
  const audit = auditInstallLifecycleData(data);

  if (writeReport) {
    await writeInstallLifecycleReport(root, audit);
  }

  return audit;
}

export function auditInstallLifecycleData(data = {}) {
  const issues = [];
  const warnings = [];
  const staleFiles = classifyStaleFiles(data.gitStatusLines || []);
  const requiredHosts = new Set((data.expectedHosts || []).filter(Boolean));

  if (!data.packageAudit?.pass) {
    issues.push({
      code: "package-audit-failed",
      message: `plugin package audit failed with score ${data.packageAudit?.score ?? 0}`,
      nextAction: "Run npm run registry:build and npm run supervibe:install-doctor before reporting install success.",
    });
  }
  if (!data.registryPresent) {
    issues.push({
      code: "registry-missing-after-install",
      message: "generated registry.yaml is missing after install/update",
      nextAction: "Run npm run registry:build before final install success.",
    });
  }
  if (staleFiles.length > 0) {
    issues.push({
      code: "stale-files-left-in-checkout",
      message: `${staleFiles.length} untracked stale file(s) remain in the managed plugin checkout`,
      nextAction: "Run git clean -ffdx in the managed plugin checkout before reinstalling dependencies.",
      files: staleFiles.slice(0, 20),
    });
  }

  for (const host of requiredHosts) {
    const registration = data.hostRegistrations?.[host];
    if (!registration) {
      warnings.push({
        code: "unknown-install-host",
        message: `installer reported unsupported host ${host}; host-doctor will cover it separately`,
      });
      continue;
    }
    if (registration.required && !registration.ok) {
      issues.push({
        code: `${host}-registration-missing`,
        message: registration.message,
        nextAction: registration.nextAction,
      });
    }
  }

  return {
    gate: "install-lifecycle",
    pass: issues.length === 0,
    score: issues.length === 0 ? 10 : Math.max(0, Number((10 - issues.length * 0.75).toFixed(1))),
    version: data.version || null,
    rootDir: data.rootDir || null,
    generatedAt: new Date().toISOString(),
    issues,
    warnings,
    staleFiles,
    packageAudit: {
      pass: Boolean(data.packageAudit?.pass),
      score: data.packageAudit?.score ?? 0,
      issues: data.packageAudit?.issues || [],
      warnings: data.packageAudit?.warnings || [],
    },
    hostRegistrations: data.hostRegistrations || {},
    expectedHosts: [...requiredHosts],
  };
}

export function classifyStaleFiles(gitStatusLines = []) {
  return gitStatusLines
    .map((line) => String(line || "").trimEnd())
    .filter((line) => line.startsWith("?? "))
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}

async function writeInstallLifecycleReport(rootDir, audit) {
  const reportPath = join(rootDir, INSTALL_LIFECYCLE_REPORT_PATH);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  return reportPath;
}

async function inspectHostRegistrations({ rootDir, homeDir, expectedHosts }) {
  const expected = new Set(expectedHosts || []);
  return {
    claude: await inspectClaudeRegistration({ rootDir, homeDir, required: expected.has("claude") }),
    codex: inspectCodexRegistration({ rootDir, homeDir, required: expected.has("codex") }),
    gemini: await inspectGeminiRegistration({ rootDir, homeDir, required: expected.has("gemini") }),
    opencode: await inspectOpenCodeRegistration({ rootDir, homeDir, required: expected.has("opencode") }),
  };
}

async function inspectClaudeRegistration({ rootDir, homeDir, required }) {
  const key = "supervibe@supervibe-marketplace";
  const pluginsJson = await readJsonOptional(join(homeDir, ".claude", "plugins", "installed_plugins.json"));
  const marketplacesJson = await readJsonOptional(join(homeDir, ".claude", "plugins", "known_marketplaces.json"));
  const settingsJson = await readJsonOptional(join(homeDir, ".claude", "settings.json"));
  const installed = pluginsJson?.plugins?.[key]?.some((entry) => normalizePath(entry.installPath) === normalizePath(rootDir));
  const marketplace = normalizePath(marketplacesJson?.["supervibe-marketplace"]?.installLocation) === normalizePath(rootDir);
  const enabled = settingsJson?.enabledPlugins?.[key] === true;
  const extraMarketplace = Boolean(settingsJson?.extraKnownMarketplaces?.["supervibe-marketplace"]);
  const ok = Boolean(installed && marketplace && enabled && extraMarketplace);

  return {
    required,
    ok,
    installed: Boolean(installed),
    marketplace: Boolean(marketplace),
    enabled: Boolean(enabled),
    extraMarketplace,
    message: ok
      ? "Claude Code registration is present and enabled"
      : "Claude Code registration is incomplete after install",
    nextAction: "Re-run install.sh/install.ps1 so installed_plugins, known_marketplaces, and settings.enabledPlugins are refreshed.",
  };
}

function inspectCodexRegistration({ rootDir, homeDir, required }) {
  const pluginKey = "supervibe@supervibe-marketplace";
  const link = join(homeDir, ".codex", "plugins", "cache", "supervibe-marketplace", "supervibe", "local");
  const legacyLink = join(homeDir, ".codex", "plugins", "supervibe");
  const skillsLink = join(homeDir, ".agents", "skills", "supervibe");
  const configPath = join(homeDir, ".codex", "config.toml");
  let pluginOk = false;
  let legacyPluginOk = false;
  let configOk = false;
  let pluginHooksOk = false;
  let skillsOk = false;
  let mode = "missing";
  let target = null;
  let legacyMode = "missing";
  let legacyTarget = null;
  let skillsMode = "missing";
  let skillsTarget = null;
  try {
    if (existsSync(link)) {
      const stat = lstatSync(link);
      mode = stat.isSymbolicLink() ? "symlink" : "copy";
      if (stat.isSymbolicLink()) {
        target = resolve(dirname(link), readlinkSync(link));
        pluginOk = sameRealPath(target, rootDir);
      } else {
        pluginOk = existsSync(join(link, ".codex-plugin", "plugin.json"));
      }
    }
    if (existsSync(legacyLink)) {
      const stat = lstatSync(legacyLink);
      legacyMode = stat.isSymbolicLink() ? "symlink" : "copy";
      if (stat.isSymbolicLink()) {
        legacyTarget = resolve(dirname(legacyLink), readlinkSync(legacyLink));
        legacyPluginOk = sameRealPath(legacyTarget, rootDir);
      } else {
        legacyPluginOk = existsSync(join(legacyLink, ".codex-plugin", "plugin.json"));
      }
    }
    if (existsSync(configPath)) {
      const config = readFileSync(configPath, "utf8");
      configOk = codexConfigEnablesPlugin(config, pluginKey);
      pluginHooksOk = codexConfigEnablesPluginHooks(config);
    }
    if (existsSync(skillsLink)) {
      const stat = lstatSync(skillsLink);
      skillsMode = stat.isSymbolicLink() ? "symlink" : "copy";
      if (stat.isSymbolicLink()) {
        skillsTarget = resolve(dirname(skillsLink), readlinkSync(skillsLink));
        skillsOk = sameRealPath(skillsTarget, join(rootDir, "skills"));
      } else {
        skillsOk = existsSync(join(skillsLink, "genesis", "SKILL.md"));
      }
    }
  } catch {
    pluginOk = false;
    legacyPluginOk = false;
    configOk = false;
    pluginHooksOk = false;
    skillsOk = false;
  }
  const ok = pluginOk && configOk && pluginHooksOk && skillsOk;

  return {
    required,
    ok,
    pluginOk,
    configOk,
    pluginHooksOk,
    legacyPluginOk,
    skillsOk,
    mode,
    path: link,
    target,
    configPath,
    legacyMode,
    legacyPath: legacyLink,
    legacyTarget,
    skillsMode,
    skillsPath: skillsLink,
    skillsTarget,
    rootDir,
    message: ok ? "Codex official plugin cache/config, bundled hooks, and native skills registration are present" : "Codex official plugin cache/config/hooks or native skills registration is incomplete after install",
    nextAction: "Re-run install.sh/install.ps1; Codex needs ~/.codex/plugins/cache plus config.toml with features.hooks/plugin_hooks, while Zed/Codex ACP needs native skills in ~/.agents/skills because plugin slash commands are not advertised by codex-acp.",
  };
}

async function inspectGeminiRegistration({ rootDir, homeDir, required }) {
  const geminiMdPath = join(homeDir, ".gemini", "GEMINI.md");
  const geminiSettingsPath = join(homeDir, ".gemini", "settings.json");
  const geminiMd = await readOptional(geminiMdPath);
  const geminiSettings = await readOptional(geminiSettingsPath);
  const includeLine = `@${normalizePath(rootDir)}/GEMINI.md`;
  const includeOk = geminiMd.includes("supervibe-plugin-include: do-not-edit")
    && normalizePath(geminiMd).includes(normalizePath(includeLine));
  const hooksOk = geminiSettingsIncludesSessionHooks(geminiSettings);
  const ok = includeOk && hooksOk;

  return {
    required,
    ok,
    includeOk,
    hooksOk,
    path: geminiMdPath,
    settingsPath: geminiSettingsPath,
    message: ok ? "Gemini include and session-start hooks are present" : "Gemini include marker or session-start hooks are missing after install",
    nextAction: "Re-run install.sh/install.ps1 so ~/.gemini/GEMINI.md includes Supervibe and ~/.gemini/settings.json runs the Supervibe session-start hooks.",
  };
}

function geminiSettingsIncludesSessionHooks(settingsText = "") {
  if (!settingsText.trim()) return false;
  try {
    const settings = JSON.parse(settingsText);
    if (settings?.hooksConfig?.enabled === false) return false;
    const sessionStart = Array.isArray(settings?.hooks?.SessionStart) ? settings.hooks.SessionStart : [];
    const preCompress = Array.isArray(settings?.hooks?.PreCompress) ? settings.hooks.PreCompress : [];
    const hasReason = (reason) => sessionStart.some((group) =>
      group?.matcher === reason && hookGroupUsesGeminiBridge(group, reason),
    );
    return ["startup", "resume", "clear"].every(hasReason) &&
      preCompress.some((group) => hookGroupUsesGeminiBridge(group, "compact"));
  } catch {
    return false;
  }
}

function hookGroupUsesGeminiBridge(group, reason) {
  return Array.isArray(group?.hooks) && group.hooks.some((hook) => {
    const command = String(hook?.command || "");
    return command.includes("gemini-session-start.mjs") && command.includes(reason);
  });
}

async function inspectOpenCodeRegistration({ rootDir, homeDir, required }) {
  const configPath = process.env.OPENCODE_CONFIG || join(homeDir, ".config", "opencode", "opencode.json");
  const config = await readJsonOptional(configPath);
  const plugins = Array.isArray(config?.plugin) ? config.plugin.map(String) : [];
  const pluginOk = plugins.some((entry) => entry.startsWith("supervibe@") && entry.includes("vTRKA/supervibe"));
  const entrypointOk = opencodePackageEntrypointOk(rootDir);
  return {
    required,
    ok: pluginOk && entrypointOk,
    pluginOk,
    entrypointOk,
    configPath,
    message: pluginOk && entrypointOk ? "OpenCode plugin registration and package entrypoint are present" : "OpenCode plugin registration or package entrypoint is missing after install",
    nextAction: "Re-run install.sh/install.ps1 so OpenCode config includes supervibe@git+https://github.com/vTRKA/supervibe.git#main, and keep package.json main/exports pointed at .opencode/plugins/supervibe.js.",
  };
}

function opencodePackageEntrypointOk(rootDir) {
  const pkg = readJsonSyncOptional(join(rootDir, "package.json"));
  const mainOk = pkg?.main === ".opencode/plugins/supervibe.js";
  const exportsValue = pkg?.exports?.["."];
  return mainOk && exportsValue === "./.opencode/plugins/supervibe.js";
}

function readJsonSyncOptional(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

async function collectGitStatusLines(rootDir) {
  const result = spawnSync("git", ["-C", rootDir, "status", "--porcelain"], {
    encoding: "utf8",
  });
  if (result.status !== 0) return [];
  return String(result.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

function parseExpectedHosts(value = "") {
  return String(value || "")
    .split(/[,\s]+/)
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

function normalizePath(value = "") {
  return String(value || "").replace(/\\/g, "/");
}

function sameRealPath(a, b) {
  try {
    return normalizePath(realpathSync(a)) === normalizePath(realpathSync(b));
  } catch {
    return normalizePath(resolve(a)) === normalizePath(resolve(b));
  }
}

function codexConfigEnablesPlugin(config = "", pluginKey = "") {
  const features = tomlSection(config, "features");
  const plugin = tomlSection(config, `plugins."${pluginKey}"`);
  const legacyPluginEnabled = tomlBoolean(features, "plugins") === true && tomlBoolean(plugin, "enabled") === true;
  const appDefault = tomlSection(config, "apps._default");
  const schemaBackedAppSuggestion = tomlBoolean(features, "apps") === true
    && tomlBoolean(appDefault, "enabled") !== false
    && tomlArrayTableIncludes(config, "tool_suggest.discoverables", {
      type: "plugin",
      id: pluginKey,
    });
  return legacyPluginEnabled || schemaBackedAppSuggestion;
}

function codexConfigEnablesPluginHooks(config = "") {
  const features = tomlSection(config, "features");
  return tomlBoolean(features, "hooks") === true && tomlBoolean(features, "plugin_hooks") === true;
}

function tomlSection(source = "", section = "") {
  if (!source || !section) return "";
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headerRe = new RegExp(`^\\[${escaped}\\][ \\t]*$`, "m");
  const match = headerRe.exec(source);
  if (!match) return "";
  const bodyStart = match.index + match[0].length;
  const rest = source.slice(bodyStart);
  const nextRel = rest.search(/^\s*\[/m);
  const bodyEnd = nextRel === -1 ? source.length : bodyStart + nextRel;
  return source.slice(bodyStart, bodyEnd);
}

function tomlBoolean(section = "", key = "") {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^\\s*${escaped}\\s*=\\s*(true|false)\\s*(?:#.*)?$`, "im").exec(section);
  return match ? match[1].toLowerCase() === "true" : null;
}

function tomlArrayTableIncludes(source = "", section = "", expected = {}) {
  return tomlArrayTableSections(source, section).some((body) => {
    return Object.entries(expected).every(([key, value]) => tomlString(body, key) === value);
  });
}

function tomlArrayTableSections(source = "", section = "") {
  if (!source || !section) return [];
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headerRe = new RegExp(`^\\[\\[${escaped}\\]\\][ \\t]*$`, "gm");
  const sections = [];
  let match = null;
  while ((match = headerRe.exec(source))) {
    const bodyStart = match.index + match[0].length;
    const rest = source.slice(bodyStart);
    const nextRel = rest.search(/^\s*\[/m);
    const bodyEnd = nextRel === -1 ? source.length : bodyStart + nextRel;
    sections.push(source.slice(bodyStart, bodyEnd));
  }
  return sections;
}

function tomlString(section = "", key = "") {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^\\s*${escaped}\\s*=\\s*["']([^"']+)["']\\s*(?:#.*)?$`, "im").exec(section);
  return match ? match[1] : null;
}

async function readJsonOptional(path) {
  const content = await readOptional(path);
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}
