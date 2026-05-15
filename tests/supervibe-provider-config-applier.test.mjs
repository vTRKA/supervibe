import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyMissingProviderConfig,
  buildProviderDefaultEntries,
  createProviderConfigApplyReport,
  detectDuplicateProviderConfigKeys,
  formatProviderConfigApplyReport,
  validateProviderConfigEntries,
} from "../scripts/lib/supervibe-provider-config-applier.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PROVIDER_CAPABILITIES_FIXTURE = join(ROOT, "tests", "fixtures", "provider-configs", "provider-capabilities.json");

function readProviderCapabilities() {
  return JSON.parse(readFileSync(PROVIDER_CAPABILITIES_FIXTURE, "utf8"));
}

function codexProvider() {
  return readProviderCapabilities().providers.find((provider) => provider.id === "codex");
}

function codexDefaults() {
  return buildProviderDefaultEntries(codexProvider());
}

test("TOML apply adds only missing Codex defaults and preserves user values and comments", () => {
  const input = [
    "# user-owned Codex config",
    'approval_policy = "on-request"',
    'web_search = "cached"',
    "",
    "[features]",
    "# keep this comment",
    "multi_agent = false",
    "",
    "[agents]",
    "max_threads = 4",
    "",
  ].join("\n");

  const result = applyMissingProviderConfig({
    text: input,
    format: "toml",
    entries: codexDefaults(),
    targetPath: ".codex/config.toml",
  });

  assert.equal(result.blocked, false);
  assert.equal(result.changed, true);
  assert.match(result.output, /# user-owned Codex config/);
  assert.match(result.output, /# keep this comment/);
  assert.match(result.output, /approval_policy = "on-request"/);
  assert.match(result.output, /web_search = "cached"/);
  assert.match(result.output, /multi_agent = false/);
  assert.match(result.output, /max_threads = 4/);
  assert.match(result.output, /\[features\][\s\S]*apps = true/);
  assert.match(result.output, /\[features\][\s\S]*goals = true/);
  assert.match(result.output, /\[agents\][\s\S]*max_depth = 1/);
  assert.match(result.output, /\[\[tool_suggest\.discoverables\]\][\s\S]*id = "supervibe@supervibe-marketplace"/);
  assert.ok(result.output.indexOf("approval_policy") < result.output.indexOf("[features]"));
  assert.equal((result.output.match(/^\[features\]$/gm) || []).length, 1);
  assert.equal((result.output.match(/^\[agents\]$/gm) || []).length, 1);
});

test("TOML apply accepts quoted plugin table without treating enabled as previous table duplicate", () => {
  const input = String.raw`model = "gpt-5.5"
model_reasoning_effort = "xhigh"
model_provider = "openai"
approval_policy = "never"
sandbox_mode = "workspace-write"
web_search = "live"
default_permissions = ":workspace"
project_doc_max_bytes = 32768
project_doc_fallback_filenames = []

[projects.'d:\ggsel projects\evolve']
trust_level = "trusted"

[features]
apps = true
multi_agent = true
memories = true
shell_snapshot = true
codex_hooks = true
goals = true
plugins = true

[agents]
max_threads = 16
max_depth = 1
job_max_runtime_seconds = 1800

[history]
persistence = "save-all"
max_bytes = 104857600

[memories]
generate_memories = true
use_memories = true
disable_on_external_context = false

[apps._default]
enabled = true
destructive_enabled = false
open_world_enabled = true
default_tools_enabled = true
default_tools_approval_mode = "auto"

[[tool_suggest.discoverables]]
type = "plugin"
id = "supervibe@supervibe-marketplace"

[sandbox_workspace_write]
writable_roots = []
network_access = false
exclude_tmpdir_env_var = false
exclude_slash_tmp = false

[mcp_servers.openaiDeveloperDocs]
url = "https://developers.openai.com/mcp"
enabled = true
startup_timeout_sec = 10
tool_timeout_sec = 60

[plugins."supervibe@supervibe-marketplace"]
enabled = true
`;

  const duplicates = detectDuplicateProviderConfigKeys(input, "toml");
  const result = applyMissingProviderConfig({
    text: input,
    format: "toml",
    entries: codexDefaults(),
    targetPath: "config.toml",
  });
  const report = createProviderConfigApplyReport({
    provider: codexProvider(),
    manifest: readProviderCapabilities(),
    text: input,
    targetPath: "config.toml",
  });

  assert.deepEqual(duplicates, []);
  assert.equal(result.blocked, false);
  assert.equal(result.changed, false);
  assert.equal(result.output, input);
  assert.equal(result.operations.every((entry) => entry.action === "preserve-existing"), true);
  assert.equal(report.blocked, false);
  assert.equal(report.changed, false);
  assert.equal(report.outputPreview, input);
  assert.match(report.diff.preview, /\(no changes\)/);
});

test("TOML duplicate key detection blocks dotted and table-form conflicts", () => {
  const input = [
    "agents.max_threads = 4",
    "",
    "[agents]",
    "max_threads = 8",
    "",
  ].join("\n");

  const duplicates = detectDuplicateProviderConfigKeys(input, "toml");
  const result = applyMissingProviderConfig({
    text: input,
    format: "toml",
    entries: codexDefaults(),
    targetPath: ".codex/config.toml",
  });

  assert.ok(duplicates.some((entry) => entry.path === "agents.max_threads"));
  assert.equal(result.blocked, true);
  assert.equal(result.changed, false);
  assert.match(result.issues[0].code, /duplicate-provider-config-key/);
});

test("JSONC apply preserves comments and adds missing nested values without overwriting", () => {
  const input = [
    "{",
    "  // user comment",
    '  "approval_policy": "on-request",',
    "}",
    "",
  ].join("\n");

  const result = applyMissingProviderConfig({
    text: input,
    format: "jsonc",
    entries: codexDefaults(),
    targetPath: ".codex/config.jsonc",
  });

  assert.equal(result.blocked, false);
  assert.equal(result.changed, true);
  assert.match(result.output, /\/\/ user comment/);
  assert.match(result.output, /"approval_policy": "on-request"/);
  assert.match(result.output, /"features": \{[\s\S]*"apps": true/);
  assert.match(result.output, /"agents": \{[\s\S]*"max_threads": 8/);
  assert.equal((result.output.match(/"approval_policy"/g) || []).length, 1);
});

test("Codex schema validation accepts documented goals feature and still rejects unsafe plugin boolean", () => {
  const manifest = readProviderCapabilities();
  const goalsValidation = validateProviderConfigEntries({
    providerId: "codex",
    manifest,
    entries: [{ kind: "key", path: ["features", "goals"], value: true, surface: "features.goals" }],
  });
  const pluginValidation = validateProviderConfigEntries({
    providerId: "codex",
    manifest,
    entries: [{ kind: "key", path: ["plugins"], value: true, surface: "plugins" }],
  });

  assert.equal(goalsValidation.valid, true);
  assert.equal(pluginValidation.valid, false);
  assert.ok(pluginValidation.issues.some((entry) => entry.code === "unsafe-surface"));
});

test("provider config apply report is redacted and deterministic", () => {
  const manifest = readProviderCapabilities();
  const provider = codexProvider();
  const report = createProviderConfigApplyReport({
    provider,
    manifest,
    text: [
      'api_key = "sk-project-secret-1234567890"',
      "[features]",
      "multi_agent = true",
      "",
    ].join("\n"),
    targetPath: ".codex/config.toml",
  });
  const output = formatProviderConfigApplyReport(report);

  assert.equal(report.mode, "dry-run-add-missing-only");
  assert.equal(report.overwriteExistingValues, false);
  assert.equal(report.preserveUserComments, true);
  assert.match(output, /SUPERVIBE_PROVIDER_CONFIG_APPLY/);
  assert.match(output, /OVERWRITE_EXISTING_VALUES: false/);
  assert.match(output, /OPERATION: add-missing/);
  assert.doesNotMatch(output, /sk-project-secret/);
  assert.doesNotMatch(report.outputPreview, /sk-project-secret/);
});
