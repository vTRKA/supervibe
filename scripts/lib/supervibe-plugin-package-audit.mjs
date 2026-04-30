import { readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

const MANIFEST_PATHS = {
  claude: ".claude-plugin/plugin.json",
  codex: ".codex-plugin/plugin.json",
  cursor: ".cursor-plugin/plugin.json",
};

const CORE_COMMAND_DOCS = [
  "supervibe.md",
  "supervibe-brainstorm.md",
  "supervibe-plan.md",
  "supervibe-loop.md",
  "supervibe-execute-plan.md",
];

export async function auditPluginPackage({ rootDir = process.cwd() } = {}) {
  const root = resolve(rootDir);
  const data = await loadPluginPackageData(root);
  return auditPluginPackageData(data);
}

export function auditPluginPackageData(data = {}) {
  const issues = [];
  const warnings = [];
  const packageVersion = data.packageJson?.version;
  const versions = collectVersions(data);

  if (!packageVersion || !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(packageVersion)) {
    addIssue(issues, "invalid-package-version", "package.json version must be semver", "Fix package.json version before release.");
  }

  for (const [name, version] of Object.entries(versions)) {
    if (!version) {
      addIssue(issues, "missing-version", `${name} is missing version`, `Add version ${packageVersion} to ${name}.`);
    } else if (packageVersion && version !== packageVersion) {
      addIssue(issues, "version-mismatch", `${name} version ${version} does not match package ${packageVersion}`, `Set ${name} version to ${packageVersion}.`);
    }
  }

  for (const [name, manifest] of Object.entries(data.manifests || {})) {
    validateManifest(name, manifest, data, issues);
  }

  validateMarketplace(data.marketplace, packageVersion, issues);
  validateCommandDocs(data, issues);
  validatePublicDocs(data, packageVersion, issues);
  validateInstallUpdateSmoke(data.scripts || {}, issues);
  validateRegistry(data.registryYaml, issues, warnings);

  return {
    pass: issues.length === 0,
    score: issues.length === 0 ? 10 : Math.max(0, Number((10 - issues.length * 0.5).toFixed(1))),
    issues,
    warnings,
    versions,
    nextActions: issues.map((issue) => issue.nextAction),
  };
}

export function createPluginPackageReleaseGate(audit) {
  return {
    gate: "plugin-package-audit",
    pass: Boolean(audit?.pass),
    score: audit?.score ?? 0,
    missing: audit?.issues?.map((issue) => `${issue.code}: ${issue.message}`) || ["plugin package audit was not run"],
  };
}

async function loadPluginPackageData(root) {
  const manifests = {};
  for (const [name, path] of Object.entries(MANIFEST_PATHS)) {
    manifests[name] = await readJsonOptional(join(root, path));
  }
  const commandFiles = await listFilesOptional(join(root, "commands"));
  return {
    rootDir: root,
    packageJson: await readJsonOptional(join(root, "package.json")),
    manifests,
    marketplace: await readJsonOptional(join(root, ".claude-plugin", "marketplace.json")),
    geminiExtension: await readJsonOptional(join(root, "gemini-extension.json")),
    opencodeSource: await readOptional(join(root, ".opencode", "plugins", "supervibe.js")),
    readme: await readOptional(join(root, "README.md")),
    changelog: await readOptional(join(root, "CHANGELOG.md")),
    registryYaml: await readOptional(join(root, "registry.yaml")),
    commandFiles,
    pathExists: await collectPathStatus(root, manifests),
    scripts: {
      installSh: await readOptional(join(root, "install.sh")),
      installPs1: await readOptional(join(root, "install.ps1")),
      updateSh: await readOptional(join(root, "update.sh")),
      updatePs1: await readOptional(join(root, "update.ps1")),
    },
  };
}

function collectVersions(data) {
  return {
    package: data.packageJson?.version,
    claude: data.manifests?.claude?.version,
    codex: data.manifests?.codex?.version,
    cursor: data.manifests?.cursor?.version,
    gemini: data.geminiExtension?.version,
    opencode: parseOpencodeVersion(data.opencodeSource),
    marketplace: data.marketplace?.metadata?.version,
    marketplacePlugin: data.marketplace?.plugins?.find((plugin) => plugin.name === "supervibe")?.version,
  };
}

function validateManifest(name, manifest, data, issues) {
  if (!manifest) {
    addIssue(issues, "missing-manifest", `${name} plugin manifest is missing`, `Restore ${MANIFEST_PATHS[name]}.`);
    return;
  }
  if (manifest.name !== "supervibe") {
    addIssue(issues, "manifest-name-mismatch", `${name} manifest name is ${manifest.name || "missing"}`, `Set ${name} manifest name to supervibe.`);
  }
  const description = `${manifest.description || ""} ${manifest.interface?.longDescription || ""}`.toLowerCase();
  if (!description.includes("loop") || !description.includes("worktree")) {
    addIssue(issues, "manifest-description-stale", `${name} manifest description does not mention loop/worktree capability`, `Update ${name} manifest description.`);
  }
  for (const field of ["commands", "skills"]) {
    const pathRef = manifest[field];
    if (!pathRef) {
      addIssue(issues, "manifest-path-missing", `${name} manifest is missing ${field}`, `Add ${field} path to ${name} manifest.`);
      continue;
    }
    const key = `${name}:${field}:${normalizeManifestPath(pathRef)}`;
    if (data.pathExists?.[key] === false) {
      addIssue(issues, "manifest-path-missing", `${name} ${field} path does not exist: ${pathRef}`, `Fix ${name} ${field} path or restore the directory.`);
    }
    if (pathEscapesPackage(pathRef)) {
      addIssue(issues, "manifest-path-escapes-package", `${name} ${field} path escapes package: ${pathRef}`, `Keep ${field} inside the plugin package.`);
    }
  }
}

function validateMarketplace(marketplace, packageVersion, issues) {
  if (!marketplace) {
    addIssue(issues, "missing-marketplace", ".claude-plugin/marketplace.json is missing", "Restore marketplace metadata.");
    return;
  }
  if (marketplace.name !== "supervibe-marketplace") {
    addIssue(issues, "marketplace-name-mismatch", `marketplace name is ${marketplace.name || "missing"}`, "Set marketplace name to supervibe-marketplace.");
  }
  for (const plugin of marketplace.plugins || []) {
    if (plugin.source && pathEscapesPackage(plugin.source)) {
      addIssue(issues, "marketplace-source-escapes-package", `marketplace source escapes package: ${plugin.source}`, "Keep marketplace source inside the package boundary.");
    }
    if (packageVersion && plugin.version !== packageVersion) {
      addIssue(issues, "marketplace-plugin-version-mismatch", `marketplace plugin ${plugin.name} version is ${plugin.version}`, `Set marketplace plugin version to ${packageVersion}.`);
    }
  }
}

function validateCommandDocs(data, issues) {
  for (const command of CORE_COMMAND_DOCS) {
    if (!data.commandFiles?.includes(command)) {
      addIssue(issues, "missing-command-doc", `commands/${command} is missing`, `Restore commands/${command}.`);
    }
  }
  for (const [name, manifest] of Object.entries(data.manifests || {})) {
    if (!manifest?.commands) continue;
    const normalized = normalizeManifestPath(manifest.commands);
    if (normalized !== "commands") {
      addIssue(issues, "command-path-drift", `${name} command path is ${manifest.commands}`, `Set ${name} commands path to ./commands.`);
    }
  }
}

function validatePublicDocs(data, packageVersion, issues) {
  if (packageVersion && !data.readme?.includes(`v${packageVersion}`)) {
    addIssue(issues, "readme-version-drift", `README does not mention v${packageVersion}`, `Update README version badge to v${packageVersion}.`);
  }
  if (!/Autonomous loop 10\/10 upgrade/i.test(data.changelog || "")) {
    addIssue(issues, "changelog-missing-loop-upgrade", "CHANGELOG does not mention autonomous loop 10/10 upgrade", "Add the verified upgrade entry to CHANGELOG.");
  }
}

function validateInstallUpdateSmoke(scripts, issues) {
  if (!/npm run check/.test(scripts.installSh || "") || !/npm run check/.test(scripts.installPs1 || "")) {
    addIssue(issues, "install-smoke-missing-check", "install scripts must run npm run check", "Keep install scripts on the static local check path.");
  }
  if (!/SUPERVIBE_INSTALL_NODE/.test(scripts.installSh || "") || !/SUPERVIBE_INSTALL_NODE/.test(scripts.installPs1 || "")) {
    addIssue(issues, "install-node-bootstrap-consent-missing", "install scripts must ask for explicit consent before bootstrapping Node", "Keep Node upgrades explicit while requiring the full SQLite runtime.");
  }
  if (/supervibe:install-check/.test(scripts.installSh || "") || /supervibe:install-check/.test(scripts.installPs1 || "")) {
    addIssue(issues, "legacy-install-check-still-enabled", "install scripts must not report success through reduced compatibility checks", "Run full npm run check after Node.js 22.5+ is available.");
  }
  if (!/status --porcelain/.test(scripts.updateSh || "") || !/status --porcelain/.test(scripts.updatePs1 || "")) {
    addIssue(issues, "update-smoke-missing-dirty-check", "update scripts must refuse dirty checkouts", "Check git status --porcelain before updating.");
  }
  if (!/npm run supervibe:upgrade/.test(scripts.updateSh || "") || !/npm run supervibe:upgrade/.test(scripts.updatePs1 || "")) {
    addIssue(issues, "update-smoke-missing-delegation", "update scripts must delegate to npm run supervibe:upgrade", "Delegate update flow to the canonical upgrade script.");
  }
}

function validateRegistry(registryYaml, issues, warnings) {
  if (!registryYaml) {
    addIssue(issues, "missing-registry", "registry.yaml is missing", "Run npm run registry:build.");
    return;
  }
  if (!/^agents:/m.test(registryYaml) || !/^skills:/m.test(registryYaml)) {
    addIssue(issues, "registry-incomplete", "registry.yaml must include agents and skills", "Run npm run registry:build.");
  }
  if (!/^generated-at:/m.test(registryYaml)) {
    warnings.push({ code: "registry-generated-at-missing", message: "registry.yaml has no generated-at field" });
  }
}

async function collectPathStatus(root, manifests) {
  const status = {};
  for (const [name, manifest] of Object.entries(manifests || {})) {
    for (const field of ["commands", "skills"]) {
      if (!manifest?.[field]) continue;
      const normalized = normalizeManifestPath(manifest[field]);
      status[`${name}:${field}:${normalized}`] = await exists(join(root, normalized));
    }
  }
  return status;
}

function parseOpencodeVersion(source = "") {
  return /version:\s*["']([^"']+)["']/.exec(source)?.[1] || null;
}

function pathEscapesPackage(pathRef) {
  const normalized = normalizeManifestPath(pathRef);
  return isAbsolute(normalized) || normalized.startsWith("../") || /^[A-Za-z]:/.test(normalized);
}

function normalizeManifestPath(pathRef) {
  return String(pathRef || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+$/, "");
}

function addIssue(issues, code, message, nextAction) {
  issues.push({ code, message, nextAction });
}

async function readJsonOptional(path) {
  const content = await readOptional(path);
  if (!content) return null;
  return JSON.parse(content);
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return "";
    throw err;
  }
}

async function listFilesOptional(path) {
  try {
    return await readdir(path);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function exists(path) {
  try {
    await readFile(path);
    return true;
  } catch (err) {
    if (err.code === "EISDIR" || err.code === "EPERM") return true;
    if (err.code === "ENOENT") return false;
    return true;
  }
}
