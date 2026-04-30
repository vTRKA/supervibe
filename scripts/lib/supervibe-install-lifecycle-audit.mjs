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
      nextAction: "Run npm run registry:build and npm run check before reporting install success.",
    });
  }
  if (!data.registryPresent) {
    issues.push({
      code: "registry-missing-after-install",
      message: "generated registry.yaml is missing after install/update",
      nextAction: "Run npm run registry:build before npm run check and before final install success.",
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
      configOk = codexConfigEnablesPlugin(readFileSync(configPath, "utf8"), pluginKey);
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
    skillsOk = false;
  }
  const ok = pluginOk && configOk && skillsOk;

  return {
    required,
    ok,
    pluginOk,
    configOk,
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
    message: ok ? "Codex official plugin cache/config and native skills registration are present" : "Codex official plugin cache/config or native skills registration is incomplete after install",
    nextAction: "Re-run install.sh/install.ps1; Codex needs ~/.codex/plugins/cache plus config.toml, while Zed/Codex ACP needs native skills in ~/.agents/skills because plugin slash commands are not advertised by codex-acp.",
  };
}

async function inspectGeminiRegistration({ rootDir, homeDir, required }) {
  const geminiMd = await readOptional(join(homeDir, ".gemini", "GEMINI.md"));
  const includeLine = `@${rootDir.replace(/\\/g, "/")}/GEMINI.md`;
  const ok = geminiMd.includes("supervibe-plugin-include: do-not-edit")
    && normalizePath(geminiMd).includes(normalizePath(includeLine));

  return {
    required,
    ok,
    message: ok ? "Gemini include is present" : "Gemini include marker is missing after install",
    nextAction: "Re-run install.sh/install.ps1 so ~/.gemini/GEMINI.md gets the managed include marker.",
  };
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
  return tomlBoolean(features, "plugins") === true && tomlBoolean(plugin, "enabled") === true;
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
