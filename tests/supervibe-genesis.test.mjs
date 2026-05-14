import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const GENESIS_SCRIPT = join(ROOT, "scripts", "supervibe-genesis.mjs");

function runGenesis(args = [], { cwd = ROOT, env = {} } = {}) {
  return execFileSync(process.execPath, [GENESIS_SCRIPT, ...args], {
    cwd,
    env: {
      ...process.env,
      ...env,
      SUPERVIBE_HOST: "codex",
      SUPERVIBE_PLUGIN_ROOT: ROOT,
      SUPERVIBE_SKIP_DOCKER_PROBE: "1",
    },
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function runGenesisMaybeFails(args = [], options = {}) {
  try {
    const stdout = runGenesis(args, options);
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      status: error.status,
      stdout: error.stdout?.toString("utf8") || "",
      stderr: error.stderr?.toString("utf8") || "",
    };
  }
}

test("supervibe-genesis dry-run previews Codex provider config without writing project or home config", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-genesis-provider-dry-"));
  const homeRoot = mkdtempSync(join(tmpdir(), "supervibe-genesis-home-"));
  try {
    const out = runGenesis(["--dry-run", "--target", projectRoot, "--host", "codex", "--summary-json", "--no-color"], {
      env: { HOME: homeRoot, USERPROFILE: homeRoot },
    });
    const summary = JSON.parse(out);
    const state = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "genesis", "state.json"), "utf8"));

    assert.equal(summary.providerConfig.providerId, "codex");
    const expectedTarget = join(homeRoot, ".codex", "config.toml").replace(/\\/g, "/");
    assert.equal(summary.providerConfig.targetPath, expectedTarget);
    assert.equal(summary.providerConfig.scope, "user-provider-home");
    assert.equal(summary.providerConfig.changed, true);
    assert.equal(summary.providerConfig.written, false);
    assert.equal(summary.providerConfig.blocked, false);
    assert.equal(summary.providerConfig.homeConfigAction, "apply-add-missing-only");
    assert.equal(state.providerConfig.apply.written, false);
    assert.equal(existsSync(join(projectRoot, ".codex", "config.toml")), false);
    assert.equal(existsSync(join(homeRoot, ".codex", "config.toml")), false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(homeRoot, { recursive: true, force: true });
  }
});

test("supervibe-genesis apply adds missing Codex provider config defaults without overwriting user values", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-genesis-provider-apply-"));
  const homeRoot = mkdtempSync(join(tmpdir(), "supervibe-genesis-home-"));
  try {
    mkdirSync(join(projectRoot, ".codex"), { recursive: true });
    mkdirSync(join(homeRoot, ".codex"), { recursive: true });
    const projectConfigBefore = "# unsafe project config must be ignored\napproval_policy = \"on-request\"\n";
    writeFileSync(join(projectRoot, ".codex", "config.toml"), projectConfigBefore);
    writeFileSync(join(homeRoot, ".codex", "config.toml"), [
      "# keep operator settings",
      "approval_policy = \"on-request\"",
      "",
      "[agents]",
      "max_threads = 4",
      "",
    ].join("\n"));

    const out = runGenesis(["--apply", "--target", projectRoot, "--host", "codex", "--summary-json", "--no-color"], {
      env: { HOME: homeRoot, USERPROFILE: homeRoot },
    });
    const summary = JSON.parse(out);
    const config = readFileSync(join(homeRoot, ".codex", "config.toml"), "utf8");
    const state = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "genesis", "state.json"), "utf8"));

    assert.equal(summary.providerConfig.written, true);
    assert.equal(summary.providerConfig.homeConfigAction, "apply-add-missing-only");
    assert.match(config, /# keep operator settings/);
    assert.match(config, /approval_policy = "on-request"/);
    assert.match(config, /max_threads = 4/);
    assert.match(config, /web_search = "live"/);
    assert.match(config, /sandbox_mode = "workspace-write"/);
    assert.equal(state.providerConfig.apply.written, true);
    assert.equal(state.providerConfig.homeConfigAction, "apply-add-missing-only");
    assert.equal(readFileSync(join(projectRoot, ".codex", "config.toml"), "utf8"), projectConfigBefore);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(homeRoot, { recursive: true, force: true });
  }
});

test("supervibe-genesis blocks duplicate Codex provider config keys before scaffold apply", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-genesis-provider-duplicate-"));
  const homeRoot = mkdtempSync(join(tmpdir(), "supervibe-genesis-home-"));
  try {
    mkdirSync(join(projectRoot, ".codex"), { recursive: true });
    mkdirSync(join(homeRoot, ".codex"), { recursive: true });
    const before = [
      "agents.max_threads = 2",
      "",
      "[agents]",
      "max_threads = 4",
      "",
    ].join("\n");
    writeFileSync(join(projectRoot, ".codex", "config.toml"), "# ignored project duplicate\n" + before);
    writeFileSync(join(homeRoot, ".codex", "config.toml"), before);

    const result = runGenesisMaybeFails(["--apply", "--target", projectRoot, "--host", "codex", "--no-color"], {
      env: { HOME: homeRoot, USERPROFILE: homeRoot },
    });
    const state = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "genesis", "state.json"), "utf8"));

    assert.equal(result.status, 1);
    assert.match(result.stderr, /SUPERVIBE_GENESIS_ERROR/);
    assert.match(result.stderr, /duplicate key agents\.max_threads/);
    assert.equal(readFileSync(join(homeRoot, ".codex", "config.toml"), "utf8"), before);
    assert.match(readFileSync(join(projectRoot, ".codex", "config.toml"), "utf8"), /# ignored project duplicate/);
    assert.equal(state.lifecycle, "dry-run");
    assert.equal(existsSync(join(projectRoot, ".codex", "agents")), false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(homeRoot, { recursive: true, force: true });
  }
});
