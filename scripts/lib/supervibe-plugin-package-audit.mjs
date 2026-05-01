import { readFile, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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

const MANIFEST_PATH_FIELDS = {
  claude: ["commands", "skills"],
  codex: ["skills"],
  cursor: ["commands", "skills"],
};

const UNSUPPORTED_CODEX_FIELDS = ["commands", "agents", "hooks"];

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
  validateNoTrackedLocalDevFiles(data.trackedFiles || [], issues);
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
    trackedFiles: await collectTrackedFiles(root),
    scripts: {
      installSh: await readOptional(join(root, "install.sh")),
      installPs1: await readOptional(join(root, "install.ps1")),
      updateSh: await readOptional(join(root, "update.sh")),
      updatePs1: await readOptional(join(root, "update.ps1")),
      upgradeMjs: await readOptional(join(root, "scripts", "supervibe-upgrade.mjs")),
    },
  };
}

function validateNoTrackedLocalDevFiles(trackedFiles, issues) {
  const files = (trackedFiles || []).map((file) => normalizeManifestPath(file));
  const checks = [
    {
      code: "tracked-local-claude-state",
      match: (file) => /^\.claude\//.test(file),
      nextAction: "Remove .claude/* from git and keep it ignored; plugin runtime files live in top-level agents/skills/commands/hooks.",
    },
    {
      code: "tracked-local-supervibe-state",
      match: (file) => /^\.supervibe\//.test(file),
      nextAction: "Remove .supervibe/* from git; it contains generated local audit/UI/IDE state.",
    },
    {
      code: "tracked-generated-registry",
      match: (file) => file === "registry.yaml",
      nextAction: "Keep registry.yaml generated locally by npm run registry:build, not tracked in git.",
    },
    {
      code: "tracked-upgrade-check-cache",
      match: (file) => file === ".claude-plugin/.upgrade-check.json",
      nextAction: "Remove .claude-plugin/.upgrade-check.json from git; it is a mutable local upstream-check cache.",
    },
    {
      code: "tracked-worktree-state",
      match: (file) => /^(\.worktrees|worktrees)\//.test(file),
      nextAction: "Remove local worktree directories from git and keep them ignored.",
    },
    {
      code: "tracked-runtime-artifact",
      match: (file) => /(^|\/)(node_modules|dist|coverage)\//.test(file) || /\.(db|db-journal|db-wal|db-shm|log)$/i.test(file) || /(^|\/)\.env(\.|$)/.test(file),
      nextAction: "Remove runtime artifacts, logs, databases, env files, and build outputs from git.",
    },
  ];

  for (const check of checks) {
    const matches = files.filter(check.match);
    if (matches.length === 0) continue;
    addIssue(
      issues,
      check.code,
      `${matches.length} local/generated file(s) are tracked: ${matches.slice(0, 5).join(", ")}${matches.length > 5 ? ", ..." : ""}`,
      check.nextAction
    );
  }
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
  for (const field of MANIFEST_PATH_FIELDS[name] || ["commands", "skills"]) {
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
  if (name === "codex") {
    for (const field of UNSUPPORTED_CODEX_FIELDS) {
      if (manifest[field]) {
        addIssue(
          issues,
          "codex-unsupported-manifest-field",
          `codex manifest includes unsupported ${field} field`,
          "Remove Codex commands/agents/hooks manifest fields; Codex currently contributes Supervibe through plugin skills/config, while codex-acp advertises only its own slash commands."
        );
      }
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
  for (const [label, source] of Object.entries({
    "install.sh": scripts.installSh,
    "install.ps1": scripts.installPs1,
    "update.sh": scripts.updateSh,
    "update.ps1": scripts.updatePs1,
    "scripts/supervibe-upgrade.mjs": scripts.upgradeMjs,
  })) {
    if (runsDevCheck(source)) {
      addIssue(issues, "user-update-runs-dev-check", `${label} must not run npm run check in the user install/update path`, "Keep tests manual/CI-only; user updates should run registry build and install-doctor only.");
    }
  }
  if (!/registry:build/.test(scripts.installSh || "") || !/registry:build/.test(scripts.installPs1 || "")) {
    addIssue(issues, "install-registry-build-missing", "install scripts must generate registry.yaml before final install audit", "Run npm run registry:build before npm run supervibe:install-doctor.");
  }
  if (!/registry:build/.test(scripts.upgradeMjs || "")) {
    addIssue(issues, "upgrade-registry-build-missing", "upgrade script must generate registry.yaml before final install audit", "Run npm run registry:build before npm run supervibe:install-doctor.");
  }
  if (!/supervibe:install-doctor/.test(scripts.installSh || "") || !/supervibe:install-doctor/.test(scripts.installPs1 || "")) {
    addIssue(issues, "install-doctor-missing", "install scripts must run the install lifecycle doctor", "Run npm run supervibe:install-doctor after host registration.");
  }
  if (!/supervibe:install-doctor/.test(scripts.upgradeMjs || "")) {
    addIssue(issues, "upgrade-doctor-missing", "upgrade script must run the install lifecycle doctor", "Run npm run supervibe:install-doctor after registry build.");
  }
  if (!/git clean -ffdx/.test(scripts.installSh || "") || !/clean', '-ffdx/.test(scripts.installPs1 || "")) {
    addIssue(issues, "install-clean-reinstall-missing", "install scripts must clean stale managed checkout files before reinstall", "Clean untracked and ignored files from the managed checkout before npm install.");
  }
  if (!/assert_checkout_mirror_clean/.test(scripts.installSh || "") || !/Assert-CheckoutMirrorClean/.test(scripts.installPs1 || "")) {
    addIssue(issues, "install-mirror-clean-missing", "install scripts must assert the managed checkout mirror before registration", "Assert git status is clean after checkout cleanup, update, or clone.");
  }
  if (!/git clean -ffdx/.test(scripts.upgradeMjs || "") || !/assertMirrorCheckoutClean/.test(scripts.upgradeMjs || "")) {
    addIssue(issues, "upgrade-mirror-clean-missing", "upgrade script must clean and assert the managed checkout mirror before reinstall", "Run git clean -ffdx, then assert git status is clean after cleanup and pull.");
  }
  if (!/SUPERVIBE_INSTALL_NODE/.test(scripts.installSh || "") || !/SUPERVIBE_INSTALL_NODE/.test(scripts.installPs1 || "")) {
    addIssue(issues, "install-node-bootstrap-consent-missing", "install scripts must ask for explicit consent before bootstrapping Node", "Keep Node upgrades explicit while requiring the full SQLite runtime.");
  }
  if (/supervibe:install-check/.test(scripts.installSh || "") || /supervibe:install-check/.test(scripts.installPs1 || "")) {
    addIssue(issues, "legacy-install-check-still-enabled", "install scripts must not report success through reduced compatibility checks", "Use registry build plus install-doctor for user installs.");
  }
  if (!/status --porcelain/.test(scripts.updateSh || "") || !/status --porcelain/.test(scripts.updatePs1 || "")) {
    addIssue(issues, "update-smoke-missing-dirty-check", "update scripts must refuse dirty checkouts", "Check git status --porcelain before updating.");
  }
  if (!/tracked_dirty/.test(scripts.updateSh || "") || !/\$trackedDirty/.test(scripts.updatePs1 || "")) {
    addIssue(issues, "update-tracked-dirty-filter-missing", "update scripts must distinguish tracked edits from stale untracked files", "Refuse tracked local edits but allow the managed upgrader to clean untracked stale files.");
  }
  if (!/untracked/.test(scripts.updateSh || "") || !/untrackedDirty/.test(scripts.updatePs1 || "")) {
    addIssue(issues, "update-stale-file-warning-missing", "update scripts must warn that stale untracked files will be cleaned", "Warn before delegating stale cleanup to npm run supervibe:upgrade.");
  }
  if (!/npm run supervibe:upgrade/.test(scripts.updateSh || "") || !/npm run supervibe:upgrade/.test(scripts.updatePs1 || "")) {
    addIssue(issues, "update-smoke-missing-delegation", "update scripts must delegate to npm run supervibe:upgrade", "Delegate update flow to the canonical upgrade script.");
  }
}

function runsDevCheck(source = "") {
  return /npm\s+run\s+check/.test(source) || /['"]run['"]\s*,\s*['"]check['"]/.test(source);
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
    for (const field of MANIFEST_PATH_FIELDS[name] || ["commands", "skills"]) {
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

async function collectTrackedFiles(root) {
  try {
    const [tracked, deleted] = await Promise.all([
      execFileAsync("git", ["ls-files"], {
        cwd: root,
        maxBuffer: 10 * 1024 * 1024,
      }),
      execFileAsync("git", ["ls-files", "--deleted"], {
        cwd: root,
        maxBuffer: 10 * 1024 * 1024,
      }),
    ]);
    const deletedFiles = new Set(deleted.stdout.split(/\r?\n/).filter(Boolean));
    return tracked.stdout.split(/\r?\n/).filter(Boolean).filter((file) => !deletedFiles.has(file));
  } catch {
    try {
      const { stdout } = await execFileAsync("git", ["ls-files"], {
        cwd: root,
        maxBuffer: 10 * 1024 * 1024,
      });
      return stdout.split(/\r?\n/).filter(Boolean);
    } catch {
      return [];
    }
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
