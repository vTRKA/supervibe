import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyMissingProviderConfig,
  applyUserProviderConfigDefaults,
  detectDuplicateProviderConfigKeys,
  detectProjectProviderRuntimeConfigs,
  resolveUserProviderConfigTarget,
} from "../scripts/lib/supervibe-provider-config-applier.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PROVIDER_CAPABILITIES_FIXTURE = join(ROOT, "tests", "fixtures", "provider-configs", "provider-capabilities.json");

function readProviderCapabilities() {
  return JSON.parse(readFileSync(PROVIDER_CAPABILITIES_FIXTURE, "utf8"));
}

function codexProvider() {
  return readProviderCapabilities().providers.find((provider) => provider.id === "codex");
}

function providerById(id) {
  return readProviderCapabilities().providers.find((provider) => provider.id === id);
}

function withDifferentPathCase(value) {
  if (process.platform !== "win32") return value;
  return String(value).replace(/[A-Za-z]/, (char) => (char === char.toLowerCase() ? char.toUpperCase() : char.toLowerCase()));
}

test("Codex provider config target resolves CODEX_HOME before user home and never project root", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-provider-project-"));
  const userHome = mkdtempSync(join(tmpdir(), "supervibe-provider-home-"));
  const codexHome = mkdtempSync(join(tmpdir(), "supervibe-provider-codex-home-"));
  try {
    const target = resolveUserProviderConfigTarget({
      provider: codexProvider(),
      providerId: "codex",
      projectRoot,
      userHome,
      env: { CODEX_HOME: codexHome, USERPROFILE: userHome, HOME: userHome },
    });

    assert.equal(target.scope, "user-provider-home");
    assert.equal(target.absolutePath, resolve(codexHome, "config.toml"));
    assert.equal(target.targetPath.endsWith(".codex/config.toml"), false);
    assert.equal(target.projectRootBlocked, false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(userHome, { recursive: true, force: true });
    rmSync(codexHome, { recursive: true, force: true });
  }
});

test("Codex provider config target falls back to USERPROFILE or HOME provider directory", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-provider-project-"));
  const userHome = mkdtempSync(join(tmpdir(), "supervibe-provider-home-"));
  try {
    const target = resolveUserProviderConfigTarget({
      provider: codexProvider(),
      providerId: "codex",
      projectRoot,
      userHome,
      env: { USERPROFILE: userHome, HOME: join(tmpdir(), "ignored-home") },
    });

    assert.equal(target.absolutePath, resolve(userHome, ".codex", "config.toml"));
    assert.equal(target.providerHome, resolve(userHome, ".codex"));
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(userHome, { recursive: true, force: true });
  }
});

test("provider config apply writes user Codex config, preserves values, and ignores project configs", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-provider-project-"));
  const userHome = mkdtempSync(join(tmpdir(), "supervibe-provider-home-"));
  const manifest = readProviderCapabilities();
  try {
    mkdirSync(join(projectRoot, ".codex"), { recursive: true });
    mkdirSync(join(projectRoot, ".claude"), { recursive: true });
    mkdirSync(join(userHome, ".codex"), { recursive: true });
    const projectCodexBefore = [
      "# unsafe project config must be ignored",
      'approval_policy = "on-request"',
      "",
    ].join("\n");
    const projectClaudeBefore = "{\"permissions\":{\"allow\":[]}}\n";
    writeFileSync(join(projectRoot, ".codex", "config.toml"), projectCodexBefore);
    writeFileSync(join(projectRoot, ".claude", "settings.json"), projectClaudeBefore);
    writeFileSync(join(projectRoot, "config.toml"), 'approval_policy = "on-request"\n');
    writeFileSync(join(userHome, ".codex", "config.toml"), [
      "# keep operator settings",
      'approval_policy = "on-request"',
      "",
      "[agents]",
      "max_threads = 4",
      "",
    ].join("\n"));

    const result = await applyUserProviderConfigDefaults({
      provider: codexProvider(),
      providerId: "codex",
      projectRoot,
      userHome,
      env: { USERPROFILE: userHome, HOME: userHome },
      manifest,
      write: true,
    });
    const homeConfig = readFileSync(join(userHome, ".codex", "config.toml"), "utf8");

    assert.equal(result.scope, "user-provider-home");
    assert.equal(result.written, true);
    assert.equal(result.created, false);
    assert.equal(result.updated, true);
    assert.equal(result.targetPath, resolve(userHome, ".codex", "config.toml").replace(/\\/g, "/"));
    assert.deepEqual(result.ignoredProjectConfigs.map((entry) => entry.projectRel).sort(), [
      ".claude/settings.json",
      ".codex/config.toml",
      "config.toml",
    ]);
    assert.match(homeConfig, /# keep operator settings/);
    assert.match(homeConfig, /approval_policy = "on-request"/);
    assert.match(homeConfig, /max_threads = 4/);
    assert.match(homeConfig, /web_search = "live"/);
    assert.match(homeConfig, /plugin_hooks = true/);
    assert.equal(readFileSync(join(projectRoot, ".codex", "config.toml"), "utf8"), projectCodexBefore);
    assert.equal(readFileSync(join(projectRoot, ".claude", "settings.json"), "utf8"), projectClaudeBefore);

    const second = await applyUserProviderConfigDefaults({
      provider: codexProvider(),
      providerId: "codex",
      projectRoot,
      userHome,
      env: { USERPROFILE: userHome, HOME: userHome },
      manifest,
      write: true,
    });
    assert.equal(second.changed, false);
    assert.equal(second.written, false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(userHome, { recursive: true, force: true });
  }
});

test("provider config apply returns a manual patch when provider home cannot be written", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-provider-project-"));
  const userHome = mkdtempSync(join(tmpdir(), "supervibe-provider-home-"));
  const manifest = readProviderCapabilities();
  try {
    const codexHome = join(userHome, ".codex");
    mkdirSync(codexHome, { recursive: true });
    writeFileSync(join(codexHome, "locked"), "not a directory\n");
    const provider = {
      ...codexProvider(),
      runtimeConfig: {
        ...codexProvider().runtimeConfig,
        configFile: "locked/config.toml",
      },
    };

    const result = await applyUserProviderConfigDefaults({
      provider,
      providerId: "codex",
      projectRoot,
      userHome,
      env: { CODEX_HOME: codexHome, USERPROFILE: userHome, HOME: userHome },
      manifest,
      write: true,
    });

    assert.equal(result.blocked, false);
    assert.equal(result.written, false);
    assert.equal(result.manualPatchRequired, true);
    assert.equal(result.homeConfigAction, "manual-patch-required");
    assert.equal(result.skipReason, "provider-config-write-unavailable");
    assert.match(result.report.diff.preview, /approval_policy = "never"/);
    assert.ok(result.report.issues.some((entry) => entry.code === "provider-config-write-unavailable"));
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(userHome, { recursive: true, force: true });
  }
});

test("project provider runtime config detector is non-destructive", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-provider-project-"));
  try {
    mkdirSync(join(projectRoot, ".codex"), { recursive: true });
    mkdirSync(join(projectRoot, ".claude"), { recursive: true });
    mkdirSync(join(projectRoot, ".gemini"), { recursive: true });
    mkdirSync(join(projectRoot, ".cursor"), { recursive: true });
    mkdirSync(join(projectRoot, ".opencode"), { recursive: true });
    writeFileSync(join(projectRoot, ".codex", "config.toml"), 'approval_policy = "on-request"\n');
    writeFileSync(join(projectRoot, ".claude", "settings.local.json"), "{}\n");
    writeFileSync(join(projectRoot, ".gemini", "settings.json"), "{}\n");
    writeFileSync(join(projectRoot, ".cursor", "cli.json"), "{}\n");
    writeFileSync(join(projectRoot, ".cursor", "cli-config.json"), "{}\n");
    writeFileSync(join(projectRoot, "opencode.json"), "{}\n");
    writeFileSync(join(projectRoot, ".opencode", "opencode.jsonc"), "{}\n");
    writeFileSync(join(projectRoot, "config.toml"), 'web_search = "cached"\n');

    const detected = detectProjectProviderRuntimeConfigs({ projectRoot });

    assert.deepEqual(detected.map((entry) => entry.projectRel).sort(), [
      ".claude/settings.local.json",
      ".codex/config.toml",
      ".cursor/cli-config.json",
      ".cursor/cli.json",
      ".gemini/settings.json",
      ".opencode/opencode.jsonc",
      "config.toml",
      "opencode.json",
    ]);
    assert.equal(existsSync(join(projectRoot, ".codex", "config.toml")), true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});


test("OpenCode explicit config respects JSONC format and inline override precedence", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-provider-project-"));
  const userHome = mkdtempSync(join(tmpdir(), "supervibe-provider-home-"));
  const manifest = readProviderCapabilities();
  try {
    const customConfig = join(userHome, "custom-opencode.jsonc");
    writeFileSync(customConfig, "{\n  // user comment\n}\n");

    const jsoncResult = await applyUserProviderConfigDefaults({
      provider: providerById("opencode"),
      providerId: "opencode",
      projectRoot,
      userHome,
      env: { USERPROFILE: userHome, HOME: userHome, OPENCODE_CONFIG: customConfig },
      manifest,
      write: true,
    });

    assert.equal(jsoncResult.format, "jsonc");
    assert.equal(jsoncResult.written, true);
    assert.match(readFileSync(customConfig, "utf8"), /"permission"\s*:\s*"allow"/);

    const inlineResult = await applyUserProviderConfigDefaults({
      provider: providerById("opencode"),
      providerId: "opencode",
      projectRoot,
      userHome,
      env: { USERPROFILE: userHome, HOME: userHome, OPENCODE_CONFIG_CONTENT: '{"permission":"ask"}' },
      manifest,
      write: true,
    });

    assert.equal(inlineResult.blocked, true);
    assert.equal(inlineResult.skipReason, "provider-config-inline-override-present");
    assert.ok(inlineResult.report.issues.some((entry) => entry.code === "provider-config-inline-override-present"));
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(userHome, { recursive: true, force: true });
  }
});

test("OpenCode explicit project-local config is blocked before apply", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-provider-project-"));
  const userHome = mkdtempSync(join(tmpdir(), "supervibe-provider-home-"));
  try {
    const explicitConfig = join(withDifferentPathCase(projectRoot), "opencode.jsonc");
    const target = resolveUserProviderConfigTarget({
      provider: providerById("opencode"),
      providerId: "opencode",
      projectRoot,
      userHome,
      env: { USERPROFILE: userHome, HOME: userHome, OPENCODE_CONFIG: explicitConfig },
    });

    assert.equal(target.scope, "user-provider-home");
    assert.equal(target.writable, false);
    assert.equal(target.projectRootBlocked, true);
    assert.equal(target.issue.code, "provider-config-target-inside-project-root");
    assert.equal(target.format, "jsonc");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(userHome, { recursive: true, force: true });
  }
});

test("TOML duplicate standard tables block provider config apply", () => {
  const text = [
    "[features]",
    "apps = true",
    "",
    "[features]",
    "hooks = true",
    "",
  ].join("\n");
  const duplicateKeys = detectDuplicateProviderConfigKeys(text, "toml");
  const result = applyMissingProviderConfig({
    text,
    format: "toml",
    targetPath: "~/.codex/config.toml",
    entries: [{ kind: "key", path: ["features", "memories"], value: true, surface: "features.memories" }],
  });

  assert.ok(duplicateKeys.some((entry) => entry.path === "[features]"));
  assert.equal(result.blocked, true);
  assert.ok(result.duplicateKeys.some((entry) => entry.path === "[features]"));
  assert.ok(result.issues.some((entry) => entry.code === "duplicate-provider-config-key"));
  assert.doesNotMatch(result.output, /memories = true/);
});

test("provider config apply writes no-prompt user defaults for every writable provider", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-provider-project-"));
  const userHome = mkdtempSync(join(tmpdir(), "supervibe-provider-home-"));
  const manifest = readProviderCapabilities();
  const cases = [
    {
      id: "codex",
      rel: [".codex", "config.toml"],
      assertConfig(text) { assert.match(text, /approval_policy = "never"/); },
    },
    {
      id: "claude-code",
      rel: [".claude", "settings.json"],
      assertConfig(text) {
        const json = JSON.parse(text);
        assert.equal(json.permissions.defaultMode, "bypassPermissions");
        assert.equal(json.permissions.skipDangerousModePermissionPrompt, true);
      },
    },
    {
      id: "gemini-cli",
      rel: [".gemini", "settings.json"],
      assertConfig(text) { assert.equal(JSON.parse(text).general.defaultApprovalMode, "auto_edit"); },
    },
    {
      id: "cursor",
      rel: [".cursor", "cli-config.json"],
      assertConfig(text) {
        const allow = JSON.parse(text).permissions.allow;
        assert.deepEqual(allow, ["Shell(*)", "Read(**)", "Write(**)"]);
      },
    },
    {
      id: "opencode",
      rel: [".config", "opencode", "opencode.json"],
      envExtra(root) { return { OPENCODE_CONFIG: join(root, ".config", "opencode", "opencode.json") }; },
      assertConfig(text) { assert.equal(JSON.parse(text).permission, "allow"); },
    },
  ];

  try {
    for (const item of cases) {
      const env = { USERPROFILE: userHome, HOME: userHome, ...(item.envExtra?.(userHome) || {}) };
      const result = await applyUserProviderConfigDefaults({
        provider: providerById(item.id),
        providerId: item.id,
        projectRoot,
        userHome,
        env,
        manifest,
        write: true,
      });
      const configPath = join(userHome, ...item.rel);
      assert.equal(result.scope, "user-provider-home", item.id);
      assert.equal(result.written, true, item.id);
      assert.equal(result.projectConfigPathSafe, false, item.id);
      assert.equal(result.targetPath.includes(projectRoot.replace(/\\/g, "/")), false, item.id);
      item.assertConfig(readFileSync(configPath, "utf8"));
    }
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(userHome, { recursive: true, force: true });
  }
});
