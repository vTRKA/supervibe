import { access, lstat, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";

export const HOST_IDS = Object.freeze(["claude", "codex", "cursor", "gemini", "opencode", "copilot"]);
const ADAPTER_HOSTS = new Set(["claude", "codex", "gemini", "opencode"]);

const HOST_DEFINITIONS = {
  claude: {
    label: "Claude Code",
    command: "claude",
    manifestPath: ".claude-plugin/plugin.json",
    requiredManifestPaths: ["commands", "skills", "agents", "hooks"],
  },
  codex: {
    label: "Codex CLI",
    command: "codex",
    manifestPath: ".codex-plugin/plugin.json",
    requiredManifestPaths: ["commands", "skills", "agents", "hooks"],
    registrationPath: [".codex", "plugins", "supervibe"],
  },
  cursor: {
    label: "Cursor",
    command: "cursor",
    manifestPath: ".cursor-plugin/plugin.json",
    requiredManifestPaths: ["commands", "skills", "agents", "hooks"],
  },
  gemini: {
    label: "Gemini CLI",
    command: "gemini",
    manifestPath: "gemini-extension.json",
    contextFile: "GEMINI.md",
    registrationPath: [".gemini", "GEMINI.md"],
  },
  opencode: {
    label: "OpenCode",
    command: "opencode",
    pluginSource: ".opencode/plugins/supervibe.js",
  },
  copilot: {
    label: "GitHub Copilot CLI",
    command: "copilot",
  },
};

export async function diagnoseHosts({
  rootDir = process.cwd(),
  homeDir = homedir(),
  host = "all",
  strict = false,
  env = process.env,
  commandExists = defaultCommandExists,
} = {}) {
  const root = resolve(rootDir);
  const packageJson = await readJsonOptional(join(root, "package.json"));
  const requestedHosts = normalizeRequestedHosts(host);
  const reports = [];

  for (const hostId of requestedHosts) {
    reports.push(await diagnoseHost(hostId, {
      root,
      homeDir,
      packageVersion: packageJson?.version || null,
      strict,
      env,
      commandExists,
    }));
  }

  const failCount = reports.reduce((sum, report) => sum + report.checks.filter((check) => check.status === "fail").length, 0);
  const warnCount = reports.reduce((sum, report) => sum + report.checks.filter((check) => check.status === "warn").length, 0);
  const score = reports.length
    ? Number((reports.reduce((sum, report) => sum + report.score, 0) / reports.length).toFixed(1))
    : 0;

  return {
    pass: failCount === 0,
    score,
    rootDir: root,
    packageVersion: packageJson?.version || null,
    strict,
    requestedHost: host,
    hosts: reports,
    summary: {
      hosts: reports.length,
      pass: reports.filter((report) => report.pass).length,
      fail: reports.filter((report) => !report.pass).length,
      checksFailed: failCount,
      checksWarned: warnCount,
    },
  };
}

export function formatHostDoctorReport(result, { color = false } = {}) {
  const lines = [
    "SUPERVIBE_HOST_DOCTOR",
    `Root:    ${result.rootDir}`,
    `Version: ${result.packageVersion || "unknown"}`,
    `Mode:    ${result.strict ? "strict" : "standard"}`,
    `Overall: ${result.pass ? "PASS" : "FAIL"} (${result.score}/10)`,
    "",
  ];

  for (const host of result.hosts) {
    lines.push(`${host.host.toUpperCase()} - ${host.label}: ${host.pass ? "PASS" : "FAIL"} (${host.score}/10)`);
    for (const check of host.checks) {
      lines.push(`  ${statusGlyph(check.status, color)} ${check.id}: ${check.message}`);
      if (check.nextAction) lines.push(`     next: ${check.nextAction}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function normalizeRequestedHosts(host) {
  const raw = Array.isArray(host) ? host : String(host || "all").split(",");
  const requested = raw.map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (requested.length === 0 || requested.includes("all")) return [...HOST_IDS];
  const unknown = requested.filter((item) => !HOST_IDS.includes(item));
  if (unknown.length) throw new Error(`Unknown host(s): ${unknown.join(", ")}. Use one of: ${HOST_IDS.join(", ")}, all.`);
  return [...new Set(requested)];
}

async function diagnoseHost(hostId, context) {
  const definition = HOST_DEFINITIONS[hostId];
  const checks = [];

  if (!context.packageVersion) {
    checks.push(fail("package-version", "package.json version is missing", "Restore package.json version."));
  }

  if (definition.manifestPath) {
    await checkJsonManifest(hostId, definition, context, checks);
  }
  if (definition.pluginSource) {
    await checkOpencodeSource(context, checks);
  }
  if (definition.contextFile) {
    await checkGeminiContext(context, checks);
  }

  await checkCliAvailability(hostId, definition, context, checks);
  await checkLocalRegistration(hostId, definition, context, checks);
  await checkHostDocs(hostId, context, checks);
  checkFreshContextAdapter(hostId, checks);

  const failCount = checks.filter((check) => check.status === "fail").length;
  const warnCount = checks.filter((check) => check.status === "warn").length;
  const score = Math.max(0, Number((10 - failCount * 2 - warnCount * 0.5).toFixed(1)));

  return {
    host: hostId,
    label: definition.label,
    pass: failCount === 0,
    score,
    checks,
  };
}

async function checkJsonManifest(hostId, definition, context, checks) {
  const manifestPath = join(context.root, definition.manifestPath);
  const manifest = await readJsonOptional(manifestPath);
  if (!manifest) {
    checks.push(fail("manifest", `${definition.manifestPath} is missing or invalid JSON`, `Restore ${definition.manifestPath}.`));
    return;
  }

  checks.push(pass("manifest", `${definition.manifestPath} is valid JSON`));
  if (manifest.name !== "supervibe") {
    checks.push(fail("manifest-name", `manifest name is ${manifest.name || "missing"}`, "Set manifest name to supervibe."));
  } else {
    checks.push(pass("manifest-name", "manifest name is supervibe"));
  }

  if (context.packageVersion && manifest.version !== context.packageVersion) {
    checks.push(fail("manifest-version", `manifest version ${manifest.version || "missing"} does not match package ${context.packageVersion}`, `Set ${definition.manifestPath} version to ${context.packageVersion}.`));
  } else {
    checks.push(pass("manifest-version", `manifest version matches package ${context.packageVersion || manifest.version || "unknown"}`));
  }

  if (hostId === "gemini") {
    if (!manifest.contextFileName) {
      checks.push(fail("gemini-context-file", "gemini-extension.json is missing contextFileName", "Set contextFileName to GEMINI.md."));
    } else {
      checks.push(pass("gemini-context-file", `Gemini context file is ${manifest.contextFileName}`));
    }
    return;
  }

  for (const field of definition.requiredManifestPaths || []) {
    const ref = manifest[field];
    const refs = normalizeManifestRefs(ref);
    if (refs.length === 0) {
      checks.push(fail(`manifest-${field}`, `manifest is missing ${field}`, `Add ${field}: "./${field}" to ${definition.manifestPath}.`));
      continue;
    }
    const escaping = refs.find((entry) => pathEscapesPackage(entry));
    if (escaping) {
      checks.push(fail(`manifest-${field}`, `${field} path escapes package: ${escaping}`, `Keep ${field} inside the plugin package.`));
      continue;
    }
    const missing = [];
    for (const entry of refs) {
      const exists = await pathExists(join(context.root, normalizeManifestPath(entry)));
      if (!exists) missing.push(entry);
    }
    if (missing.length > 0) {
      checks.push(fail(`manifest-${field}`, `${field} path does not exist: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ` (+${missing.length - 3} more)` : ""}`, `Restore missing ${field} path(s).`));
    } else {
      const suffix = refs.length === 1 ? refs[0] : `${refs.length} paths`;
      checks.push(pass(`manifest-${field}`, `${field} path exists: ${suffix}`));
    }
  }
}

async function checkOpencodeSource(context, checks) {
  const sourcePath = join(context.root, ".opencode", "plugins", "supervibe.js");
  const source = await readOptional(sourcePath);
  if (!source) {
    checks.push(fail("opencode-plugin", ".opencode/plugins/supervibe.js is missing", "Restore the OpenCode plugin source."));
    return;
  }
  checks.push(pass("opencode-plugin", "OpenCode plugin source exists"));
  const version = /version:\s*["']([^"']+)["']/.exec(source)?.[1] || null;
  if (context.packageVersion && version !== context.packageVersion) {
    checks.push(fail("opencode-version", `OpenCode version ${version || "missing"} does not match package ${context.packageVersion}`, `Set .opencode/plugins/supervibe.js version to ${context.packageVersion}.`));
  } else {
    checks.push(pass("opencode-version", `OpenCode version matches package ${context.packageVersion || version || "unknown"}`));
  }
  if (!/skills:\s*\{[\s\S]*paths:/m.test(source)) {
    checks.push(fail("opencode-skills-hook", "OpenCode plugin does not register skills paths", "Keep the config hook that returns skills.paths."));
  } else {
    checks.push(pass("opencode-skills-hook", "OpenCode config hook registers skills paths"));
  }
  if (!/chat\.messages\.transform/.test(source)) {
    checks.push(warn("opencode-bootstrap", "OpenCode bootstrap context injection was not found", "Keep experimental.chat.messages.transform bootstrap until OpenCode has richer plugin metadata."));
  } else {
    checks.push(pass("opencode-bootstrap", "OpenCode bootstrap context injection exists"));
  }
}

async function checkGeminiContext(context, checks) {
  const geminiMd = await readOptional(join(context.root, "GEMINI.md"));
  if (!geminiMd) {
    checks.push(fail("gemini-context", "GEMINI.md is missing", "Restore GEMINI.md for Gemini CLI context loading."));
    return;
  }
  checks.push(pass("gemini-context", "GEMINI.md exists"));
  if (!/Tool name mapping/i.test(geminiMd)) {
    checks.push(warn("gemini-tool-map", "GEMINI.md does not document tool-name mapping", "Keep Claude-to-Gemini tool mapping in GEMINI.md."));
  } else {
    checks.push(pass("gemini-tool-map", "GEMINI.md documents tool-name mapping"));
  }
}

async function checkCliAvailability(hostId, definition, context, checks) {
  if (hostId === "cursor") {
    const available = await context.commandExists(definition.command, context.env);
    checks.push(available
      ? pass("cli-command", "cursor command is available on PATH")
      : info("cli-command", "cursor command was not found; marketplace/manual install can still work"));
    return;
  }

  const available = await context.commandExists(definition.command, context.env);
  const missing = `Install ${definition.label} or set SUPERVIBE_${hostId.toUpperCase()}_COMMAND before strict doctor.`;
  if (available) {
    checks.push(pass("cli-command", `${definition.command} command is available on PATH`));
  } else if (context.strict) {
    checks.push(fail("cli-command", `${definition.command} command was not found on PATH`, missing));
  } else {
    checks.push(warn("cli-command", `${definition.command} command was not found on PATH`, missing));
  }
}

async function checkLocalRegistration(hostId, definition, context, checks) {
  if (hostId === "cursor") {
    checks.push(info("local-registration", "Cursor registration is marketplace/manual; no portable local registry file is expected"));
    return;
  }
  if (hostId === "copilot") {
    checks.push(info("local-registration", "Copilot CLI is docs-driven through marketplace commands; no local plugin manifest is packaged yet"));
    return;
  }
  if (hostId === "claude") {
    const installedPluginsPath = join(context.homeDir, ".claude", "plugins", "installed_plugins.json");
    const installed = await readOptional(installedPluginsPath);
    if (installed.includes("supervibe")) {
      checks.push(pass("local-registration", "Claude installed_plugins.json references supervibe"));
    } else {
      const action = "Run the installer or verify ~/.claude/plugins/installed_plugins.json.";
      checks.push(context.strict
        ? fail("local-registration", "Claude installed_plugins.json does not reference supervibe", action)
        : warn("local-registration", "Claude installed_plugins.json does not reference supervibe", action));
    }
    return;
  }
  if (!definition.registrationPath) return;

  const registrationPath = join(context.homeDir, ...definition.registrationPath);
  const registered = await pathExists(registrationPath);
  if (!registered) {
    const action = hostId === "codex"
      ? "Run install.sh/install.ps1 or link the repo to ~/.codex/plugins/supervibe."
      : "Run install.sh/install.ps1 so ~/.gemini/GEMINI.md includes the Supervibe block.";
    checks.push(context.strict
      ? fail("local-registration", `${registrationPath} was not found`, action)
      : warn("local-registration", `${registrationPath} was not found`, action));
    return;
  }

  if (hostId === "gemini") {
    const content = await readOptional(registrationPath);
    if (!content.includes("supervibe-plugin-include: do-not-edit")) {
      checks.push(context.strict
        ? fail("local-registration", "Gemini registration marker is missing", "Re-run the installer to refresh ~/.gemini/GEMINI.md.")
        : warn("local-registration", "Gemini registration marker is missing", "Re-run the installer to refresh ~/.gemini/GEMINI.md."));
    } else {
      checks.push(pass("local-registration", "Gemini registration marker exists"));
    }
    return;
  }

  const stat = await lstat(registrationPath).catch(() => null);
  checks.push(pass("local-registration", stat?.isSymbolicLink() ? `${registrationPath} is a symlink` : `${registrationPath} exists`));
}

async function checkHostDocs(hostId, context, checks) {
  const readme = await readOptional(join(context.root, "README.md"));
  const opencodeInstall = await readOptional(join(context.root, ".opencode", "INSTALL.md"));
  const lowerReadme = readme.toLowerCase();

  const expectations = {
    claude: ["claude code"],
    codex: ["codex cli"],
    cursor: ["cursor"],
    gemini: ["gemini cli"],
    opencode: ["opencode"],
    copilot: ["copilot"],
  };
  const hasReadme = expectations[hostId].some((term) => lowerReadme.includes(term));
  if (!hasReadme) {
    checks.push(warn("host-docs", `README does not mention ${HOST_DEFINITIONS[hostId].label}`, "Document install/troubleshooting for this host."));
  } else {
    checks.push(pass("host-docs", `README mentions ${HOST_DEFINITIONS[hostId].label}`));
  }

  if (hostId === "opencode") {
    if (!opencodeInstall.includes("opencode.json")) {
      checks.push(warn("opencode-install-doc", ".opencode/INSTALL.md does not show opencode.json setup", "Document OpenCode plugin setup."));
    } else {
      checks.push(pass("opencode-install-doc", ".opencode/INSTALL.md documents opencode.json setup"));
    }
  }
}

function checkFreshContextAdapter(hostId, checks) {
  if (ADAPTER_HOSTS.has(hostId)) {
    checks.push(pass("fresh-context-adapter", `${hostId} is supported by /supervibe-loop --fresh-context --tool ${hostId}`));
  } else {
    checks.push(info("fresh-context-adapter", `${hostId} has package/install support but no fresh-context execution adapter yet`));
  }
}

async function defaultCommandExists(command, env = process.env) {
  const configured = env[`SUPERVIBE_${String(command).toUpperCase().replaceAll("-", "_")}_COMMAND`];
  const candidate = configured || command;
  if (!candidate) return false;
  if (candidate.includes("/") || candidate.includes("\\")) return pathExecutable(candidate);
  const dirs = String(env.PATH || "").split(delimiter).filter(Boolean);
  const extensions = process.platform === "win32"
    ? String(env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
    : [""];
  for (const dir of dirs) {
    for (const ext of extensions) {
      if (await pathExecutable(join(dir, `${candidate}${ext}`))) return true;
    }
  }
  return false;
}

function pass(id, message) {
  return { id, status: "pass", message };
}

function warn(id, message, nextAction = "") {
  return { id, status: "warn", message, nextAction };
}

function fail(id, message, nextAction = "") {
  return { id, status: "fail", message, nextAction };
}

function info(id, message) {
  return { id, status: "info", message };
}

function statusGlyph(status, color) {
  const glyphs = { pass: "OK", warn: "WARN", fail: "FAIL", info: "INFO" };
  const glyph = glyphs[status] || status.toUpperCase();
  if (!color) return glyph;
  const codes = { pass: 32, warn: 33, fail: 31, info: 36 };
  return `\x1b[${codes[status] || 0}m${glyph}\x1b[0m`;
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
  } catch (err) {
    if (err.code === "ENOENT" || err.code === "EISDIR") return "";
    throw err;
  }
}

async function pathExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function pathExecutable(path) {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function pathEscapesPackage(pathRef) {
  const normalized = normalizeManifestPath(pathRef);
  return normalized.startsWith("../") || /^[A-Za-z]:/.test(normalized) || normalized.startsWith("/");
}

function normalizeManifestRefs(ref) {
  if (Array.isArray(ref)) {
    return ref.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof ref === "string") {
    const value = ref.trim();
    return value ? [value] : [];
  }
  return [];
}

function normalizeManifestPath(pathRef) {
  return String(pathRef || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+$/, "");
}
