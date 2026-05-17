import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyUserProviderConfigDefaults,
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

test("project provider runtime config detector is non-destructive", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-provider-project-"));
  try {
    mkdirSync(join(projectRoot, ".codex"), { recursive: true });
    mkdirSync(join(projectRoot, ".claude"), { recursive: true });
    writeFileSync(join(projectRoot, ".codex", "config.toml"), 'approval_policy = "on-request"\n');
    writeFileSync(join(projectRoot, ".claude", "settings.local.json"), "{}\n");
    writeFileSync(join(projectRoot, "config.toml"), 'web_search = "cached"\n');

    const detected = detectProjectProviderRuntimeConfigs({ projectRoot });

    assert.deepEqual(detected.map((entry) => entry.projectRel).sort(), [
      ".claude/settings.local.json",
      ".codex/config.toml",
      "config.toml",
    ]);
    assert.equal(existsSync(join(projectRoot, ".codex", "config.toml")), true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
