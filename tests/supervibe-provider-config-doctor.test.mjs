import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createProviderConfigDoctorReport,
  formatProviderConfigDoctorReport,
} from "../scripts/lib/supervibe-provider-config-doctor.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CODEX_DOC = join(ROOT, "docs", "provider-configs", "codex.md");
const CLAUDE_CODE_DOC = join(ROOT, "docs", "provider-configs", "claude-code.md");
const GEMINI_CLI_DOC = join(ROOT, "docs", "provider-configs", "gemini-cli.md");
const CURSOR_DOC = join(ROOT, "docs", "provider-configs", "cursor.md");
const OPENCODE_DOC = join(ROOT, "docs", "provider-configs", "opencode.md");
const PROVIDER_MATRIX_DOC = join(ROOT, "docs", "provider-configs", "provider-capability-matrix.md");
const PROVIDER_POWER_PRESETS_DOC = join(ROOT, "docs", "provider-configs", "provider-power-presets.md");
const PROVIDER_CAPABILITIES_FIXTURE = join(ROOT, "tests", "fixtures", "provider-configs", "provider-capabilities.json");

function readCodexDoc() {
  return readFileSync(CODEX_DOC, "utf8");
}

function readProviderDoc(file) {
  return readFileSync(file, "utf8");
}

function readProviderMatrix() {
  return readFileSync(PROVIDER_MATRIX_DOC, "utf8");
}

function readProviderCapabilities() {
  return JSON.parse(readFileSync(PROVIDER_CAPABILITIES_FIXTURE, "utf8"));
}

function extractSchemaBackedTemplate(doc) {
  const match = doc.match(
    /<!-- provider-config-template:codex:schema-backed:start -->\s*```toml\n([\s\S]*?)\n```\s*<!-- provider-config-template:codex:schema-backed:end -->/,
  );
  assert.ok(match, "Codex doc must expose a schema-backed TOML template block");
  return match[1];
}

test("Codex provider config doc covers required official configuration surfaces", () => {
  const doc = readCodexDoc();

  for (const source of [
    "https://developers.openai.com/codex/config-basic",
    "https://developers.openai.com/codex/config-advanced",
    "https://developers.openai.com/codex/config-reference",
    "https://developers.openai.com/codex/config-sample",
    "https://developers.openai.com/codex/subagents",
    "https://developers.openai.com/codex/guides/agents-md",
  ]) {
    assert.match(doc, new RegExp(source.replaceAll(".", "\\.")));
  }

  for (const required of [
    /~\/\.codex\/config\.toml/,
    /\.codex\/config\.toml/,
    /home config[\s\S]*preview-only/i,
    /\[features\][\s\S]*multi_agent/,
    /\[features\][\s\S]*memories/,
    /\[agents\][\s\S]*max_threads[\s\S]*max_depth[\s\S]*job_max_runtime_seconds/,
    /\[history\][\s\S]*persistence[\s\S]*max_bytes/,
    /\[mcp_servers\.<id>\]/,
    /web_search[\s\S]*cached[\s\S]*live[\s\S]*disabled/,
    /approval_policy[\s\S]*sandbox_mode[\s\S]*default_permissions/,
    /trust_level[\s\S]*trusted/,
    /AGENTS\.md[\s\S]*project_doc_max_bytes[\s\S]*project_doc_fallback_filenames/,
  ]) {
    assert.match(doc, required);
  }
});

test("Codex provider config template includes documented goals and excludes unsafe plugin boolean", () => {
  const doc = readCodexDoc();
  const template = extractSchemaBackedTemplate(doc);

  assert.match(template, /\[features\][\s\S]*multi_agent = true/);
  assert.match(template, /approval_policy = "never"/);
  assert.match(template, /web_search = "live"/);
  assert.match(template, /\[features\][\s\S]*apps = true/);
  assert.match(template, /\[features\][\s\S]*memories = true/);
  assert.match(template, /\[features\][\s\S]*goals = true/);
  assert.match(template, /\[agents\][\s\S]*max_threads = 8/);
  assert.match(template, /\[apps\._default\][\s\S]*enabled = true/);
  assert.match(template, /\[\[tool_suggest\.discoverables\]\][\s\S]*type = "plugin"[\s\S]*supervibe@supervibe-marketplace/);
  assert.match(template, /\[mcp_servers\.openaiDeveloperDocs\]/);
  assert.doesNotMatch(template, /plugins\s*=\s*true/);
  assert.doesNotMatch(template, /\[permissions\.workspace\.(filesystem|network)\]/);
  assert.doesNotMatch(template, /glob_scan_max_depth|":project_roots"|mode\s*=\s*"limited"/);

  assert.match(doc, /key: features\.goals/);
  assert.match(doc, /sourceKind: codex-use-case-doc/);
  assert.match(doc, /schemaStatus: documented-experimental/);
  assert.match(doc, /automaticApply: true/);
  assert.match(doc, /preserving any existing user-owned value/);
});

test("Claude Code provider config doc covers required official configuration surfaces", () => {
  const doc = readProviderDoc(CLAUDE_CODE_DOC);

  for (const source of [
    "https://docs.anthropic.com/en/docs/claude-code/settings",
    "https://docs.anthropic.com/en/docs/claude-code/mcp",
    "https://docs.anthropic.com/en/docs/claude-code/sub-agents",
    "https://docs.anthropic.com/en/docs/claude-code/hooks",
    "https://docs.anthropic.com/en/docs/claude-code/memory",
    "https://docs.anthropic.com/en/docs/claude-code/team",
  ]) {
    assert.match(doc, new RegExp(source.replaceAll(".", "\\.")));
  }

  for (const required of [
    /\.claude\/settings\.json/,
    /\.claude\/settings\.local\.json/,
    /\.mcp\.json/,
    /\.claude\/agents\//,
    /hooks[\s\S]*PreToolUse[\s\S]*PostToolUse[\s\S]*SubagentStop/i,
    /permissions[\s\S]*allow[\s\S]*ask[\s\S]*deny/i,
    /CLAUDE\.md[\s\S]*memory/i,
    /managed-settings\.json[\s\S]*higher precedence/i,
    /preserve user-owned host instructions|user-owned host instructions are preserved/i,
  ]) {
    assert.match(doc, required);
  }
});

test("Gemini CLI provider config doc covers required official configuration surfaces", () => {
  const doc = readProviderDoc(GEMINI_CLI_DOC);

  for (const source of [
    "https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md",
    "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/settings.md",
    "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md",
    "https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/commands.md",
    "https://github.com/google-gemini/gemini-cli/blob/main/docs/index.md",
  ]) {
    assert.match(doc, new RegExp(source.replaceAll(".", "\\.")));
  }

  for (const required of [
    /~\/\.gemini\/settings\.json/,
    /\.gemini\/settings\.json/,
    /GEMINI\.md[\s\S]*hierarchical memory/i,
    /checkpointing[\s\S]*general\.checkpointing\.enabled/i,
    /mcpServers[\s\S]*includeTools[\s\S]*excludeTools/i,
    /gemini extensions[\s\S]*install[\s\S]*enable[\s\S]*disable/i,
    /defaultApprovalMode[\s\S]*default[\s\S]*auto_edit[\s\S]*plan/i,
    /--approval-mode=yolo/,
    /--output-format[\s\S]*text[\s\S]*json[\s\S]*stream-json/i,
    /privacy\.usageStatisticsEnabled[\s\S]*respectGitIgnore[\s\S]*respectGeminiIgnore/i,
    /project memory[\s\S]*global memory/i,
  ]) {
    assert.match(doc, required);
  }
});

test("Cursor provider config doc covers required official configuration surfaces", () => {
  const doc = readProviderDoc(CURSOR_DOC);

  for (const source of [
    "https://docs.cursor.com/en/context",
    "https://docs.cursor.com/advanced/model-context-protocol",
    "https://docs.cursor.com/en/cli",
    "https://docs.cursor.com/en/cli/using",
    "https://docs.cursor.com/en/cli/reference/output-format",
    "https://docs.cursor.com/en/background-agents",
    "https://docs.cursor.com/account/privacy",
  ]) {
    assert.match(doc, new RegExp(source.replaceAll(".", "\\.")));
  }

  for (const required of [
    /\.cursor\/rules/,
    /AGENTS\.md[\s\S]*CLAUDE\.md/,
    /\.cursor\/mcp\.json[\s\S]*~\/\.cursor\/mcp\.json/,
    /cursor-agent[\s\S]*--print[\s\S]*full write access/i,
    /\.cursor\/environment\.json/,
    /background agents[\s\S]*remote/i,
    /Privacy Mode[\s\S]*does not change that running agent/i,
    /GitHub[\s\S]*separate branch[\s\S]*handoff/i,
    /Auto Attached[\s\S]*Agent Requested[\s\S]*Manual/i,
    /scoped Cursor rules/i,
  ]) {
    assert.match(doc, required);
  }
});

test("OpenCode provider config doc covers required official configuration surfaces", () => {
  const doc = readProviderDoc(OPENCODE_DOC);

  for (const source of [
    "https://opencode.ai/docs/config/",
    "https://opencode.ai/docs/agents/",
    "https://opencode.ai/docs/mcp-servers/",
    "https://opencode.ai/docs/providers/",
    "https://opencode.ai/docs/plugins/",
    "https://opencode.ai/config.json",
  ]) {
    assert.match(doc, new RegExp(source.replaceAll(".", "\\.")));
  }

  for (const required of [
    /opencode\.json/,
    /\.opencode\/agents/,
    /mcp[\s\S]*type[\s\S]*local[\s\S]*remote/i,
    /permission[\s\S]*ask[\s\S]*allow[\s\S]*deny/i,
    /provider[\s\S]*model[\s\S]*small_model/i,
    /server[\s\S]*port[\s\S]*hostname/i,
    /watcher[\s\S]*ignore/i,
    /plugin[\s\S]*\.opencode\/plugins/,
    /\$schema[\s\S]*https:\/\/opencode\.ai\/config\.json/,
    /per-agent permission|Per-agent permission/i,
    /Project `opencode\.json`[\s\S]*global config/i,
  ]) {
    assert.match(doc, required);
  }
});

test("provider capability matrix covers required provider execution surfaces", () => {
  const doc = readProviderMatrix();

  for (const provider of ["Codex", "Claude Code", "Gemini CLI", "Cursor", "OpenCode"]) {
    const row = doc.split(/\r?\n/).find((line) => line.startsWith(`| ${provider} |`));
    assert.ok(row, `${provider} row should exist`);
    assert.match(row, /Checked: 2026-05-13/);
    assert.match(row, /https?:\/\//);
  }

  for (const required of [
    /config path/i,
    /instructions path/i,
    /agents/i,
    /memory/i,
    /MCP/,
    /hooks/i,
    /background execution/i,
    /permissions/i,
    /schema/i,
    /Codex[\s\S]*~\/\.codex\/config\.toml[\s\S]*\.codex\/config\.toml/,
    /Claude Code[\s\S]*\.claude\/settings\.json[\s\S]*\.claude\/agents\//,
    /Gemini CLI[\s\S]*~\/\.gemini\/settings\.json[\s\S]*GEMINI\.md/,
    /Cursor[\s\S]*\.cursor\/rules[\s\S]*\.cursor\/environment\.json/,
    /OpenCode[\s\S]*opencode\.json[\s\S]*\.opencode\/agents/,
  ]) {
    assert.match(doc, required);
  }
});

test("provider capability manifest backs docs and doctor checks", () => {
  const manifest = readProviderCapabilities();
  const matrix = readProviderMatrix();
  const providerDocs = {
    codex: readProviderDoc(CODEX_DOC),
    "claude-code": readProviderDoc(CLAUDE_CODE_DOC),
    "gemini-cli": readProviderDoc(GEMINI_CLI_DOC),
    cursor: readProviderDoc(CURSOR_DOC),
    opencode: readProviderDoc(OPENCODE_DOC),
  };

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.checkedAt, "2026-05-13");
  assert.equal(manifest.providers.length, 5);

  for (const provider of manifest.providers) {
    assert.ok(provider.id, "provider id is required");
    assert.ok(provider.name, "provider name is required");
    assert.ok(provider.paths.config.length > 0, `${provider.id} config paths are required`);
    assert.ok(provider.paths.project.length > 0, `${provider.id} project paths are required`);
    assert.ok(provider.capabilities.agents.support, `${provider.id} agent support is required`);
    assert.ok(provider.capabilities.memory.support, `${provider.id} memory support is required`);
    assert.ok(provider.capabilities.mcp.support, `${provider.id} MCP support is required`);
    assert.ok(provider.capabilities.hooks.support, `${provider.id} hook support is required`);
    assert.ok(provider.capabilities.backgroundExecution.support, `${provider.id} background execution support is required`);
    assert.ok(provider.capabilities.permissions.support, `${provider.id} permission support is required`);
    assert.ok(provider.capabilities.schema.support, `${provider.id} schema support is required`);
    assert.ok(provider.providerLimits, `${provider.id} provider limits are required`);
    assert.ok(provider.sources.every((source) => /^https?:\/\//.test(source.url) && source.checkedAt === manifest.checkedAt));
    assert.match(matrix, new RegExp(`\\| ${provider.name.replaceAll(".", "\\.")} \\|`));
    assert.match(matrix, new RegExp(provider.paths.config[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const providerEvidence = `${providerDocs[provider.id] || ""}\n${matrix}`;
    for (const source of provider.sources) {
      assert.match(providerEvidence, new RegExp(source.url.replaceAll(".", "\\.")));
    }
  }
});

test("provider config doctor reports redacted preview-only recommendations", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-provider-doctor-project-"));
  const homeRoot = mkdtempSync(join(tmpdir(), "supervibe-provider-doctor-home-"));
  try {
    mkdirSync(join(projectRoot, ".codex"), { recursive: true });
    mkdirSync(join(homeRoot, ".codex"), { recursive: true });
    writeFileSync(join(projectRoot, ".codex", "config.toml"), [
      'model = "gpt-5.5"',
      'api_key = "sk-project-secret-1234567890"',
      "[features]",
      "multi_agent = true",
    ].join("\n"));
    writeFileSync(join(homeRoot, ".codex", "config.toml"), 'token = "abcdefghijklmnopqrstuvwxyz"\n');

    const report = createProviderConfigDoctorReport({
      rootDir: projectRoot,
      homeDir: homeRoot,
      provider: "codex",
      manifestPath: PROVIDER_CAPABILITIES_FIXTURE,
    });
    const output = formatProviderConfigDoctorReport(report);

    assert.equal(report.writeMode, "preview-only");
    assert.equal(report.mutationAllowed, false);
    assert.equal(report.providers.length, 1);
    assert.equal(report.providers[0].configPresence.projectConfig.present, true);
    assert.equal(report.providers[0].configPresence.userConfig.present, true);
    assert.equal(report.providers[0].applyPreview.mode, "dry-run-add-missing-only");
    assert.equal(report.providers[0].applyPreview.overwriteExistingValues, false);
    assert.equal(report.providers[0].applyPreview.preserveUserComments, true);
    assert.ok(report.providers[0].recommendations.some((entry) => entry.id === "safe-power-settings-preview"));
    assert.match(output, /SUPERVIBE_PROVIDER_CONFIG_DOCTOR/);
    assert.match(output, /WRITE_MODE: preview-only/);
    assert.match(output, /PROVIDER: codex projectConfig=present userConfig=present/);
    assert.match(output, /APPLY_PREVIEW: codex changed=true blocked=false mode=dry-run-add-missing-only/);
    assert.match(output, /SUPERVIBE_PROVIDER_CONFIG_APPLY/);
    assert.match(output, /OVERWRITE_EXISTING_VALUES: false/);
    assert.match(output, /PATCH_PREVIEW: codex/);
    assert.doesNotMatch(output, /sk-project-secret|abcdefghijklmnopqrstuvwxyz/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(homeRoot, { recursive: true, force: true });
  }
});

test("provider config doctor CLI is preview-only and rejects apply", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-provider-doctor-cli-"));
  const homeRoot = mkdtempSync(join(tmpdir(), "supervibe-provider-doctor-cli-home-"));
  try {
    const stdout = execFileSync(process.execPath, [
      join(ROOT, "scripts", "supervibe-provider-config-doctor.mjs"),
      "--root",
      projectRoot,
      "--home",
      homeRoot,
      "--provider",
      "codex",
    ], { encoding: "utf8" });
    assert.match(stdout, /SUPERVIBE_PROVIDER_CONFIG_DOCTOR/);
    assert.match(stdout, /MUTATION_ALLOWED: false/);
    assert.match(stdout, /home-config-preview-only/);

    assert.throws(() => execFileSync(process.execPath, [
      join(ROOT, "scripts", "supervibe-provider-config-doctor.mjs"),
      "--root",
      projectRoot,
      "--apply",
    ], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }), /Provider config doctor is preview-only/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(homeRoot, { recursive: true, force: true });
  }
});

test("provider power presets cover hidden capabilities with sourced risk labels", () => {
  const manifest = readProviderCapabilities();
  const doc = readProviderDoc(PROVIDER_POWER_PRESETS_DOC);
  const requiredTiers = new Set(["safe-default", "balanced", "max-power", "experimental", "manual-only"]);

  for (const phrase of [
    "stronger reasoning",
    "faster startup",
    "smarter context",
    "safer tools",
    "better memory",
    "more parallelism",
    "clearer observability",
    "preview-only",
    "Checked: 2026-05-13",
  ]) {
    assert.match(doc, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }

  for (const provider of manifest.providers) {
    assert.ok(Array.isArray(provider.powerPresets) && provider.powerPresets.length >= 3, `${provider.id} needs power presets`);
    assert.match(doc, new RegExp(`## ${provider.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    const tiers = new Set(provider.powerPresets.map((preset) => preset.tier));
    assert.ok([...tiers].every((tier) => requiredTiers.has(tier)), `${provider.id} has only known tiers`);
    for (const preset of provider.powerPresets) {
      assert.equal(preset.previewOnly, true);
      assert.equal(preset.checkedAt, manifest.checkedAt);
      assert.match(preset.sourceUrl, /^https?:\/\//);
      assert.ok(preset.outcome, `${provider.id} preset outcome is required`);
      assert.ok(preset.setting, `${provider.id} preset setting is required`);
    }
  }

  const codex = manifest.providers.find((provider) => provider.id === "codex");
  assert.equal(codex.providerLimits.defaultMaxThreads, 8);
  assert.ok(codex.powerPresets.some((preset) => /\[agents\]\.max_threads=8/.test(preset.preview || "")));
  assert.ok(codex.powerPresets.some((preset) => preset.setting === "web_search" && /web_search="live"/.test(preset.preview || "")));
  assert.ok(codex.powerPresets.some((preset) => /approval_policy/.test(preset.setting || "") && /approval_policy="never"/.test(preset.preview || "")));
  assert.ok(codex.powerPresets.some((preset) => /features\.apps/.test(preset.setting || "") && /tool_suggest\.discoverables/.test(preset.setting || "")));
  assert.ok(codex.powerPresets.some((preset) => preset.setting === "features.goals" && preset.tier === "experimental" && preset.schemaStatus === "documented-experimental"));
  assert.match(doc, /spawn_agents_on_csv/);
  assert.match(doc, /plan_mode_reasoning_effort/);
  assert.match(doc, /model_context_window/);
  assert.match(doc, /tool_output_token_limit/);
  assert.match(doc, /SubagentStart/);
  assert.match(doc, /max session turns/i);
  assert.match(doc, /\.cursor\/environment\.json/);
  assert.match(doc, /agent\.<name>\.steps/);
});

test("provider config doctor labels power recommendations with tier and source", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-provider-power-project-"));
  const homeRoot = mkdtempSync(join(tmpdir(), "supervibe-provider-power-home-"));
  const report = createProviderConfigDoctorReport({
    rootDir: projectRoot,
    homeDir: homeRoot,
    provider: "codex",
    manifestPath: PROVIDER_CAPABILITIES_FIXTURE,
  });
  const output = formatProviderConfigDoctorReport(report);

  try {
    const staleThreadCapPattern = new RegExp([
      "max_threads" + "=6",
      "max_threads" + " = 6",
      "threads at " + "6",
    ].join("|"));
    const stalePromptDefaultPattern = new RegExp([
      "approval_policy" + "=on-request",
      "approval_policy" + " = \"on-request\"",
      "web_search" + "=cached",
      "web_search" + " = \"cached\"",
    ].join("|"));
    assert.match(output, /create-project-config-preview/);
    assert.match(output, /\[agents\]\.max_threads=8/);
    assert.match(output, /approval_policy=never/);
    assert.match(output, /sandbox_mode=workspace-write/);
    assert.match(output, /default_permissions=:workspace/);
    assert.match(output, /web_search=live/);
    assert.match(output, /\[features\]\.apps=true/);
    assert.match(output, /tool_suggest\.discoverables/);
    assert.doesNotMatch(output, staleThreadCapPattern);
    assert.doesNotMatch(output, stalePromptDefaultPattern);
    assert.doesNotMatch(output, /plugins\s*=\s*true/);
    assert.match(output, /tier=max-power/);
    assert.match(output, /tier=experimental/);
    assert.match(output, /source=https:\/\/developers\.openai\.com\/codex\/config-reference/);
    assert.match(output, /features\.goals/);
    assert.match(output, /previewOnly=true/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(homeRoot, { recursive: true, force: true });
  }
});
