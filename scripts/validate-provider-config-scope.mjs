#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEFAULT_MANIFEST_PATH = join(ROOT, "tests", "fixtures", "provider-configs", "provider-capabilities.json");

export function validateProviderConfigScope({ rootDir = ROOT, manifest = null, files = null } = {}) {
  const root = resolve(rootDir || ROOT);
  const issues = [];
  const read = (relPath) => {
    if (files && Object.prototype.hasOwnProperty.call(files, relPath)) return files[relPath];
    return readFileSync(join(root, relPath), "utf8");
  };
  const providerManifest = manifest || JSON.parse(readFileSync(join(root, "tests", "fixtures", "provider-configs", "provider-capabilities.json"), "utf8"));

  validateCodexRuntimeConfig(providerManifest, issues);
  validateProductionSources(read, issues);
  validateDocs(read, issues);

  return {
    gate: "provider-config-scope",
    pass: issues.length === 0,
    issueCount: issues.length,
    issues,
  };
}

function validateCodexRuntimeConfig(manifest, issues) {
  const codex = (manifest.providers || []).find((provider) => provider.id === "codex");
  if (!codex) {
    issues.push(issue("codex-provider-missing", "provider-capabilities", "Codex provider entry is required."));
    return;
  }
  const runtime = codex.runtimeConfig;
  if (!runtime) {
    issues.push(issue("codex-runtime-config-missing", "provider-capabilities", "Codex must declare an explicit runtimeConfig."));
    return;
  }
  if (runtime.scope !== "user-provider-home" || runtime.writable !== true) {
    issues.push(issue("codex-runtime-config-scope", "provider-capabilities.codex.runtimeConfig", "Codex writable config scope must be user-provider-home."));
  }
  if (!Array.isArray(runtime.providerHomeEnv) || !runtime.providerHomeEnv.includes("CODEX_HOME")) {
    issues.push(issue("codex-runtime-home-env", "provider-capabilities.codex.runtimeConfig.providerHomeEnv", "Codex runtime config must prefer CODEX_HOME before user home fallback."));
  }
  if (!Array.isArray(runtime.defaultProviderHomeSegments) || runtime.defaultProviderHomeSegments.join("/") !== ".codex") {
    issues.push(issue("codex-runtime-home-segments", "provider-capabilities.codex.runtimeConfig.defaultProviderHomeSegments", "Codex default provider home must be ~/.codex."));
  }
  if (runtime.configFile !== "config.toml") {
    issues.push(issue("codex-runtime-config-file", "provider-capabilities.codex.runtimeConfig.configFile", "Codex writable config file must be config.toml relative to provider home, not a project path."));
  }
  if (runtime.mergeStrategy !== "add-missing-only") {
    issues.push(issue("codex-runtime-merge-strategy", "provider-capabilities.codex.runtimeConfig.mergeStrategy", "Codex config writes must be additive only."));
  }
}

function validateProductionSources(read, issues) {
  const adapt = read("scripts/lib/supervibe-adapt.mjs");
  const genesis = read("scripts/supervibe-genesis.mjs");
  const applier = read("scripts/lib/supervibe-provider-config-applier.mjs");
  const installSh = read("install.sh");
  const installPs1 = read("install.ps1");
  const updateSh = read("update.sh");
  const updatePs1 = read("update.ps1");

  for (const [name, src] of [["scripts/lib/supervibe-adapt.mjs", adapt], ["scripts/supervibe-genesis.mjs", genesis]]) {
    if (!src.includes("applyUserProviderConfigDefaults")) {
      issues.push(issue("provider-applier-import", name, "genesis/adapt must call the user-provider-home applier."));
    }
    if (/applyProjectProviderConfigDefaults/.test(src)) {
      issues.push(issue("project-provider-applier-import", name, "genesis/adapt must not import the project-root provider config applier."));
    }
  }
  if (!applier.includes("resolveUserProviderConfigTarget") || !applier.includes("detectProjectProviderRuntimeConfigs")) {
    issues.push(issue("provider-applier-guard", "scripts/lib/supervibe-provider-config-applier.mjs", "Provider applier must resolve user-provider-home targets and detect ignored project configs."));
  }
  if (installSh.includes('TARGET="$ANTHROPIC_CONFIG_DIR/plugins/marketplaces/$MARKETPLACE_NAME"')) {
    issues.push(issue("installer-hardcoded-claude-target", "install.sh", "Bash installer must not hard-code Claude marketplace as the checkout root."));
  }
  if (!installSh.includes("select_plugin_target") || !installSh.includes("$CODEX_DIR/plugins/marketplaces/$MARKETPLACE_NAME")) {
    issues.push(issue("installer-codex-target", "install.sh", "Bash installer must support the Codex provider-scoped marketplace root."));
  }
  if (installPs1.includes('$Target = Join-Path $AnthropicConfigDir "plugins\\marketplaces\\$MarketplaceName"')) {
    issues.push(issue("installer-hardcoded-claude-target", "install.ps1", "PowerShell installer must not hard-code Claude marketplace as the checkout root."));
  }
  if (!installPs1.includes("Resolve-PluginTarget") || !installPs1.includes('Join-Path $CodexDir "plugins\\marketplaces\\$MarketplaceName"')) {
    issues.push(issue("installer-codex-target", "install.ps1", "PowerShell installer must support the Codex provider-scoped marketplace root."));
  }
  if (!updateSh.includes("resolve_plugin_root") || !updateSh.includes("$HOME/.codex/plugins/marketplaces/supervibe-marketplace")) {
    issues.push(issue("updater-codex-root", "update.sh", "Bash updater must discover Codex provider-scoped installs."));
  }
  if (!updatePs1.includes("Resolve-PluginRoot") || !updatePs1.includes(".codex\\plugins\\marketplaces\\supervibe-marketplace")) {
    issues.push(issue("updater-codex-root", "update.ps1", "PowerShell updater must discover Codex provider-scoped installs."));
  }
}

function validateDocs(read, issues) {
  const codexDoc = read("docs/provider-configs/codex.md");
  const readme = read("README.md");
  const updateCommand = read("commands/supervibe-update.md");

  const normalizedCodexDoc = codexDoc.replace(/\s+/g, " ");
  if (normalizedCodexDoc.includes("Home config writes are preview-only for Supervibe provider-config tooling")) {
    issues.push(issue("codex-doc-stale-preview-only", "docs/provider-configs/codex.md", "Codex docs must distinguish doctor preview from genesis/adapt add-missing apply."));
  }
  if (!(normalizedCodexDoc.includes("genesis/adapt") && normalizedCodexDoc.includes("~/.codex/config.toml") && normalizedCodexDoc.includes("add-missing-only"))) {
    issues.push(issue("codex-doc-apply-scope", "docs/provider-configs/codex.md", "Codex docs must state genesis/adapt only add missing settings to user-provider config."));
  }
  if (!readme.includes("~/.codex/plugins/marketplaces/supervibe-marketplace")) {
    issues.push(issue("readme-codex-install-root", "README.md", "README must document the Codex provider-scoped install root."));
  }
  if (!/provider-scoped plugin source/i.test(updateCommand) || !updateCommand.includes("~/.codex/plugins/marketplaces/supervibe-marketplace")) {
    issues.push(issue("update-command-provider-root", "commands/supervibe-update.md", "Update command docs must use provider-scoped plugin roots."));
  }
}

function issue(code, path, message) {
  return { code, path, message };
}

function format(result) {
  const lines = [
    "SUPERVIBE_PROVIDER_CONFIG_SCOPE",
    `PASS: ${result.pass}` ,
    `ISSUES: ${result.issueCount}` ,
  ];
  for (const entry of result.issues) {
    lines.push(`ISSUE: ${entry.code} ${entry.path} ${entry.message}`);
  }
  return lines.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = validateProviderConfigScope({ rootDir: process.cwd() });
  console.log(format(result));
  process.exit(result.pass ? 0 : 1);
}
