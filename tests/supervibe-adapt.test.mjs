import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SOURCE_RAG_INDEX_COMMAND } from "../scripts/lib/supervibe-command-catalog.mjs";
import { writeAdaptFileManifestSnapshot } from "../scripts/lib/supervibe-adapt.mjs";

const ROOT = process.cwd();
const ADAPT_SCRIPT = join(ROOT, "scripts", "supervibe-adapt.mjs");
const CURRENT_VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
const NEXT_HEALTHCHECK_FETCH_RE = /fetch\('http:\/\/127\.0\.0\.1:' \+ \(process\.env\.PORT \|\| 3000\)\)/;

function createCodexProject() {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-adapt-project-"));
  mkdirSync(join(projectRoot, ".codex", "agents"), { recursive: true });
  mkdirSync(join(projectRoot, ".supervibe", "memory"), { recursive: true });
  writeFileSync(join(projectRoot, "AGENTS.md"), "# Project instructions\n");
  writeFileSync(join(projectRoot, ".codex", "agents", "repo-researcher.md"), "# stale repo researcher\n\nlocal-old-copy\n");
  writeFileSync(join(projectRoot, ".supervibe", "memory", ".supervibe-version"), "2.0.27\n");
  return projectRoot;
}

function createUpToDateCodexProjectWithVersionDrift() {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-adapt-clean-project-"));
  const artifactRel = ".codex/agents/repo-researcher.md";
  mkdirSync(join(projectRoot, ".codex", "agents"), { recursive: true });
  mkdirSync(join(projectRoot, ".supervibe", "memory", "adapt"), { recursive: true });
  writeFileSync(join(projectRoot, "AGENTS.md"), "# Project instructions\n");
  writeFileSync(join(projectRoot, artifactRel), readFileSync(join(ROOT, "agents", "_core", "repo-researcher.md"), "utf8"));
  writeUpToDateCodexProviderConfig(projectRoot);
  writeFileSync(join(projectRoot, ".supervibe", "memory", ".supervibe-version"), previousPatchVersion(CURRENT_VERSION) + "\n");
  writeFileSync(join(projectRoot, ".supervibe", "memory", "adapt", "baseline.json"), JSON.stringify({
    schemaVersion: 1,
    pluginVersion: previousPatchVersion(CURRENT_VERSION),
    hostAdapter: "codex",
    artifacts: {},
  }, null, 2) + "\n");
  return projectRoot;
}

function writeUpToDateCodexProviderConfig(projectRoot) {
  mkdirSync(join(projectRoot, ".codex"), { recursive: true });
  writeFileSync(join(projectRoot, ".codex", "config.toml"), [
    'approval_policy = "never"',
    'sandbox_mode = "workspace-write"',
    'default_permissions = ":workspace"',
    'web_search = "live"',
    "",
    "[features]",
    "apps = true",
    "multi_agent = true",
    "memories = true",
    "shell_snapshot = true",
    "codex_hooks = true",
    "goals = true",
    "",
    "[agents]",
    "max_threads = 8",
    "max_depth = 1",
    "job_max_runtime_seconds = 1800",
    "",
    "[apps._default]",
    "enabled = true",
    "",
    "[[tool_suggest.discoverables]]",
    'type = "plugin"',
    'id = "supervibe@supervibe-marketplace"',
    "",
  ].join("\n"));
}

function defaultHomeForProject(projectRoot) {
  const homeRoot = `${projectRoot}-home`;
  writeUpToDateCodexProviderConfig(homeRoot);
  return homeRoot;
}

function buildCommandEnv(projectRoot, env = {}) {
  const needsDefaultHome = !env.HOME && !env.USERPROFILE && !env.CODEX_HOME;
  const defaultHome = needsDefaultHome ? defaultHomeForProject(projectRoot) : null;
  return {
    ...process.env,
    ...(defaultHome ? { HOME: defaultHome, USERPROFILE: defaultHome, CODEX_HOME: join(defaultHome, ".codex") } : { CODEX_HOME: "" }),
    ...env,
    SUPERVIBE_HOST: "codex",
    SUPERVIBE_PLUGIN_ROOT: ROOT,
    SUPERVIBE_SKIP_DOCKER_PROBE: "1",
  };
}
function runAdapt(projectRoot, args = [], { pluginRoot = ROOT, env = {} } = {}) {
  return execFileSync(process.execPath, [ADAPT_SCRIPT, ...args], {
    cwd: projectRoot,
    env: {
      ...buildCommandEnv(projectRoot, env),
      SUPERVIBE_PLUGIN_ROOT: pluginRoot,
    },
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function runAdaptRaw(projectRoot, args = [], { pluginRoot = ROOT, env = {} } = {}) {
  const result = execFileSync(process.execPath, [ADAPT_SCRIPT, ...args], {
    cwd: projectRoot,
    env: {
      ...buildCommandEnv(projectRoot, env),
      SUPERVIBE_PLUGIN_ROOT: pluginRoot,
    },
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return { status: 0, stdout: result, stderr: "" };
}

function runAdaptMaybeFails(projectRoot, args = [], { pluginRoot = ROOT, env = {} } = {}) {
  try {
    return runAdaptRaw(projectRoot, args, { pluginRoot, env });
  } catch (error) {
    return {
      status: error.status,
      stdout: error.stdout?.toString("utf8") || "",
      stderr: error.stderr?.toString("utf8") || "",
    };
  }
}

function createPluginFixture({ version = "9.9.9", agentName = "prototype-builder", content = "# Prototype\n\nupstream\n" } = {}) {
  const pluginRoot = mkdtempSync(join(tmpdir(), "supervibe-adapt-plugin-"));
  mkdirSync(join(pluginRoot, ".claude-plugin"), { recursive: true });
  mkdirSync(join(pluginRoot, "agents"), { recursive: true });
  mkdirSync(join(pluginRoot, "rules"), { recursive: true });
  mkdirSync(join(pluginRoot, "skills"), { recursive: true });
  writeFileSync(join(pluginRoot, ".claude-plugin", "plugin.json"), JSON.stringify({ version }, null, 2) + "\n");
  writeFileSync(join(pluginRoot, "agents", `${agentName}.md`), content);
  return pluginRoot;
}

function createCodexProjectWithAgent({ agentName = "prototype-builder", content, version = "9.9.9", baselineHash = null } = {}) {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-adapt-project-"));
  const artifactRel = `.codex/agents/${agentName}.md`;
  mkdirSync(join(projectRoot, ".codex", "agents"), { recursive: true });
  mkdirSync(join(projectRoot, ".supervibe", "memory", "adapt"), { recursive: true });
  writeFileSync(join(projectRoot, "AGENTS.md"), "# Project instructions\n");
  writeFileSync(join(projectRoot, artifactRel), content);
  writeFileSync(join(projectRoot, ".supervibe", "memory", ".supervibe-version"), `${version}\n`);
  writeFileSync(join(projectRoot, ".supervibe", "memory", "adapt", "baseline.json"), JSON.stringify({
    schemaVersion: 1,
    pluginVersion: version,
    hostAdapter: "codex",
    artifacts: baselineHash
      ? {
          [artifactRel]: {
            hash: baselineHash,
            upstream: `agents/${agentName}.md`,
            updatedAt: "2026-05-01T00:00:00.000Z",
          },
        }
      : {},
  }, null, 2) + "\n");
  return { projectRoot, artifactRel };
}

function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

test("supervibe-adapt --help prints usage and does not run dry-run", () => {
  const out = runAdapt(ROOT, ["--help"]);

  assert.match(out, /Usage:/);
  assert.match(out, /--apply/);
  assert.match(out, /--dry-run/);
  assert.doesNotMatch(out, /SUPERVIBE_ADAPT_DRY_RUN/);
});

test("supervibe-adapt dry-run previews Codex provider config without writing project or home config", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-adapt-provider-dry-"));
  const homeRoot = mkdtempSync(join(tmpdir(), "supervibe-adapt-home-"));
  try {
    writeFileSync(join(projectRoot, "AGENTS.md"), "# Project instructions\n");

    const out = runAdapt(projectRoot, ["--dry-run", "--summary-json", "--no-refresh-memory-index", "--no-color"], {
      env: { HOME: homeRoot, USERPROFILE: homeRoot },
    });
    const summary = JSON.parse(out);

    assert.equal(summary.providerConfig.providerId, "codex");
    const expectedTarget = join(homeRoot, ".codex", "config.toml").replace(/\\/g, "/");
    assert.equal(summary.providerConfig.targetPath, expectedTarget);
    assert.equal(summary.providerConfig.scope, "user-provider-home");
    assert.equal(summary.providerConfig.changed, true);
    assert.equal(summary.providerConfig.written, false);
    assert.equal(summary.providerConfig.blocked, false);
    assert.equal(summary.providerConfig.homeConfigAction, "apply-add-missing-only");
    assert.equal(summary.nextApply, "node <resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs --apply");
    assert.equal(existsSync(join(projectRoot, ".codex", "config.toml")), false);
    assert.equal(existsSync(join(homeRoot, ".codex", "config.toml")), false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(homeRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt apply adds missing Codex user provider config defaults without overwriting user values", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-adapt-provider-apply-"));
  const homeRoot = mkdtempSync(join(tmpdir(), "supervibe-adapt-home-"));
  try {
    mkdirSync(join(projectRoot, ".codex"), { recursive: true });
    mkdirSync(join(homeRoot, ".codex"), { recursive: true });
    writeFileSync(join(projectRoot, "AGENTS.md"), "# Project instructions\n");
    const projectConfigBefore = "# unsafe project config must be ignored\napproval_policy = \"on-request\"\n";
    writeFileSync(join(projectRoot, ".codex", "config.toml"), projectConfigBefore);
    writeFileSync(join(homeRoot, ".codex", "config.toml"), [
      "# user tuned",
      "approval_policy = \"on-request\"",
      "",
      "[agents]",
      "max_threads = 4",
      "",
    ].join("\n"));

    const out = runAdapt(projectRoot, ["--apply", "--no-refresh-memory-index", "--no-color"], {
      env: { HOME: homeRoot, USERPROFILE: homeRoot },
    });
    const config = readFileSync(join(homeRoot, ".codex", "config.toml"), "utf8");
    const state = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "adapt", "state.json"), "utf8"));

    assert.match(out, /PROVIDER_CONFIG_WRITTEN: true/);
    assert.match(out, /PROVIDER_CONFIG_HOME_WRITE: apply-add-missing-only/);
    assert.match(out, /MUTATED: .*\.codex\/config\.toml/);
    assert.doesNotMatch(out, /MUTATED: \.codex\/config\.toml/);
    assert.match(config, /# user tuned/);
    assert.match(config, /approval_policy = "on-request"/);
    assert.match(config, /max_threads = 4/);
    assert.match(config, /web_search = "live"/);
    assert.match(config, /sandbox_mode = "workspace-write"/);
    assert.equal(state.providerConfig.written, true);
    assert.equal(state.providerConfig.homeConfigAction, "apply-add-missing-only");
    assert.equal(readFileSync(join(projectRoot, ".codex", "config.toml"), "utf8"), projectConfigBefore);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(homeRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt blocks duplicate Codex provider config keys without mutating files", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-adapt-provider-duplicate-"));
  const homeRoot = mkdtempSync(join(tmpdir(), "supervibe-adapt-home-"));
  try {
    mkdirSync(join(projectRoot, ".codex"), { recursive: true });
    mkdirSync(join(homeRoot, ".codex"), { recursive: true });
    writeFileSync(join(projectRoot, "AGENTS.md"), "# Project instructions\n");
    const before = [
      "agents.max_threads = 2",
      "",
      "[agents]",
      "max_threads = 4",
      "",
    ].join("\n");
    writeFileSync(join(projectRoot, ".codex", "config.toml"), "# ignored project duplicate\n" + before);
    writeFileSync(join(homeRoot, ".codex", "config.toml"), before);

    const result = runAdaptMaybeFails(projectRoot, ["--apply", "--no-refresh-memory-index", "--no-color"], {
      env: { HOME: homeRoot, USERPROFILE: homeRoot },
    });

    assert.equal(result.status, 2);
    assert.match(result.stdout, /PROVIDER_CONFIG_BLOCKED: true/);
    assert.match(result.stdout, /PROVIDER_CONFIG_DUPLICATE: agents\.max_threads/);
    assert.equal(readFileSync(join(homeRoot, ".codex", "config.toml"), "utf8"), before);
    assert.match(readFileSync(join(projectRoot, ".codex", "config.toml"), "utf8"), /# ignored project duplicate/);
    assert.equal(existsSync(join(projectRoot, ".codex", "config.toml.supervibe-backup")), false);
    assert.equal(existsSync(join(projectRoot, ".supervibe", "memory", "adapt", "state.json")), false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(homeRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt classifies CRLF-only managed artifact drift without blocking as both-changed", () => {
  const upstreamContent = "# Prototype\n\nsame upstream content\n";
  const pluginRoot = createPluginFixture({ content: upstreamContent });
  const { projectRoot, artifactRel } = createCodexProjectWithAgent({
    content: upstreamContent.replace(/\n/g, "\r\n"),
    baselineHash: sha256("# stale baseline\n"),
  });
  try {
    const out = runAdapt(projectRoot, ["--dry-run", "--diff-summary", "--no-color"], { pluginRoot });

    assert.match(out, /UPDATES: 0/);
    assert.match(out, /CONFLICTS: 0/);
    assert.match(out, /LINE_ENDING_ONLY_DRIFT: 1/);
    assert.match(out, /BASELINE_REFRESH_REQUIRED: true/);
    assert.match(out, new RegExp(`LINE_ENDING_ONLY: ${escapeRegExp(artifactRel)}`));
    assert.doesNotMatch(out, /both-changed/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(pluginRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt --resolve refreshes baseline after manual merge matches upstream modulo line endings", () => {
  const upstreamContent = "# Prototype\n\nmanual merge result\n";
  const pluginRoot = createPluginFixture({ content: upstreamContent });
  const { projectRoot, artifactRel } = createCodexProjectWithAgent({
    content: upstreamContent.replace(/\n/g, "\r\n"),
    baselineHash: sha256("# stale baseline\n"),
  });
  try {
    const out = runAdapt(projectRoot, ["--resolve", artifactRel, "--no-color"], { pluginRoot });

    assert.match(out, /SUPERVIBE_ADAPT_RESOLVE/);
    assert.match(out, /RESOLVED: 1/);
    assert.match(out, /BASELINE_UPDATED: true/);
    assert.match(out, new RegExp(`RESOLVED_FILE: ${escapeRegExp(artifactRel)} \\(line-ending-only\\)`));

    const baseline = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "adapt", "baseline.json"), "utf8"));
    assert.equal(baseline.artifacts[artifactRel].hash, sha256(upstreamContent));

    const dryRun = runAdapt(projectRoot, ["--dry-run", "--no-color"], { pluginRoot });
    assert.match(dryRun, /CONFLICTS: 0/);
    assert.match(dryRun, /BASELINE_REFRESH_REQUIRED: false/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(pluginRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt metadata-only apply refreshes stale baseline hashes for identical upstream artifacts", () => {
  const upstreamContent = "# Prototype\n\nalready upstream bytes\n";
  const pluginRoot = createPluginFixture({ content: upstreamContent });
  const { projectRoot, artifactRel } = createCodexProjectWithAgent({
    content: upstreamContent,
    baselineHash: sha256("# stale baseline\n"),
  });
  try {
    const dryRun = runAdapt(projectRoot, ["--dry-run", "--no-color"], { pluginRoot });

    assert.match(dryRun, /UPDATES: 0/);
    assert.match(dryRun, /BASELINE_REFRESH_REQUIRED: true/);
    assert.match(dryRun, /NEXT_APPLY_METADATA:/);

    const out = runAdapt(projectRoot, ["--apply", "--no-refresh-memory-index", "--no-color"], { pluginRoot });

    assert.match(out, /APPLIED: 0/);
    assert.match(out, /BASELINE_REFRESHED: true/);
    assert.match(out, /METADATA_UPDATED: true/);
    const baseline = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "adapt", "baseline.json"), "utf8"));
    assert.equal(baseline.pluginVersion, "9.9.9");
    assert.equal(baseline.artifacts[artifactRel].hash, sha256(upstreamContent));
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(pluginRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt refreshes stale Codex managed context in AGENTS.md", () => {
  const upstreamContent = readFileSync(join(ROOT, "agents", "_core", "repo-researcher.md"), "utf8");
  const { projectRoot } = createCodexProjectWithAgent({
    agentName: "repo-researcher",
    content: upstreamContent,
    version: CURRENT_VERSION,
    baselineHash: sha256(upstreamContent),
  });
  try {
    writeFileSync(join(projectRoot, "AGENTS.md"), [
      "# Project instructions",
      "",
      "## Local",
      "Keep this.",
      "",
      "<!-- SUPERVIBE:BEGIN managed-context codex -->",
      "# Supervibe Managed Context (OpenAI Codex)",
      "",
      "Host agents folder: .codex/agents",
      "Provisioned/requested agents: none",
      "",
      "## Agent Roles",
      "- none",
      "<!-- SUPERVIBE:END managed-context codex -->",
      "",
    ].join("\n"));

    const dryRun = runAdapt(projectRoot, ["--dry-run", "--summary-json", "--changed-only", "--no-color"]);
    const summary = JSON.parse(dryRun);
    assert.equal(summary.counts.update, 1);
    assert.equal(summary.changedItems.length, 1);
    assert.equal(summary.changedItems[0].path, "AGENTS.md");
    assert.equal(summary.changedItems[0].classification, "host-context-managed-block-refresh");

    const apply = runAdapt(projectRoot, ["--apply", "--include", "AGENTS.md", "--no-refresh-memory-index", "--no-color"]);
    assert.match(apply, /APPLIED_FILE: AGENTS\.md/);
    assert.match(apply, /ARTIFACT_ADAPT_CLEAN: true/);

    const instructions = readFileSync(join(projectRoot, "AGENTS.md"), "utf8");
    assert.match(instructions, /## Local\nKeep this\./);
    assert.match(instructions, /Host-callable agents: repo-researcher/);
    assert.match(instructions, /- repo-researcher: /);
    assert.match(instructions, /node <resolved-supervibe-plugin-root>\/scripts\/validate-agent-producer-receipts\.mjs --root \./);
    assert.doesNotMatch(instructions, /Run `npm run validate:agent-producer-receipts`/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt blocked apply does not mutate lifecycle state or memory index", () => {
  const pluginRoot = createPluginFixture({ content: "# Prototype\n\nupstream changed\n" });
  const { projectRoot, artifactRel } = createCodexProjectWithAgent({
    content: "# Prototype\n\nlocal edit\n",
    baselineHash: sha256("# Prototype\n\nold upstream\n"),
  });
  try {
    const beforeBaseline = readFileSync(join(projectRoot, ".supervibe", "memory", "adapt", "baseline.json"), "utf8");
    const result = runAdaptMaybeFails(projectRoot, ["--apply", "--include", artifactRel, "--refresh-memory-index", "--no-color"], { pluginRoot });

    assert.equal(result.status, 2);
    assert.match(result.stdout, /BLOCKED: 1/);
    assert.match(result.stdout, /ADAPT_STATE: not-written/);
    assert.match(result.stdout, /MUTATED: none/);
    assert.equal(existsSync(join(projectRoot, ".supervibe", "memory", "adapt", "state.json")), false);
    assert.equal(existsSync(join(projectRoot, ".supervibe", "memory", "index.json")), false);
    assert.equal(readFileSync(join(projectRoot, ".supervibe", "memory", "adapt", "baseline.json"), "utf8"), beforeBaseline);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(pluginRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt dry-run plans host-aware project artifact updates without genesis", () => {
  const projectRoot = createCodexProject();
  try {
    const out = runAdapt(projectRoot, ["--dry-run", "--no-color"]);

    assert.match(out, /SUPERVIBE_ADAPT_DRY_RUN/);
    assert.match(out, /HOST: codex/);
    assert.match(out, new RegExp(`VERSION: 2\\.0\\.27 -> ${CURRENT_VERSION.replaceAll(".", "\\.")}`));
    assert.match(out, /CHANGE_DETECTION: snapshot/);
    assert.match(out, /NO_GIT_SNAPSHOT: initial-snapshot-missing/);
    assert.match(out, /CONFLICTS: 0/);
    assert.match(out, /PROVIDER_CONFIG_APPLY_REQUIRED: false/);
    assert.match(out, /FAST_PATH_ELIGIBLE: true/);
    assert.match(out, /FAST_PATH_EXECUTION: cli-apply-plus-validators/);
    assert.match(out, /UPDATE: \.codex\/agents\/repo-researcher\.md/);
    assert.match(out, /APPROVAL_REQUIRED: true/);
    assert.doesNotMatch(out, /SUPERVIBE_GENESIS_DRY_RUN/);
    assert.doesNotMatch(out, /RECOMMENDED_AGENTS: none/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt no-git snapshot ignores internal index checkpoint noise", async () => {
  const projectRoot = createCodexProject();
  try {
    runAdapt(projectRoot, ["--apply", "--include", ".codex/agents/repo-researcher.md", "--no-refresh-memory-index", "--no-color"]);
    await writeAdaptFileManifestSnapshot(projectRoot);
    writeFileSync(join(projectRoot, ".supervibe", "memory", "code-index-checkpoint.json"), JSON.stringify({
      phase: "indexing",
      current: 1,
      total: 2,
    }, null, 2) + "\n");

    const out = runAdapt(projectRoot, ["--dry-run", "--changed-only", "--summary-json", "--no-refresh-memory-index", "--no-color"]);
    const summary = JSON.parse(out);

    assert.equal(summary.changeDetection.mode, "snapshot");
    assert.equal(summary.changeDetection.counts.added, 0);
    assert.equal(summary.changeDetection.changedFiles.some((entry) => entry.path === ".supervibe/memory/code-index-checkpoint.json"), false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt reads Genesis frontend state before classifying Vite drift", () => {
  const projectRoot = createCodexProject();
  try {
    mkdirSync(join(projectRoot, ".supervibe", "memory", "genesis"), { recursive: true });
    mkdirSync(join(projectRoot, "frontend"), { recursive: true });
    writeFileSync(join(projectRoot, ".supervibe", "memory", "genesis", "state.json"), JSON.stringify({
      schemaVersion: 1,
      command: "/supervibe-genesis",
      appChoice: {
        id: "next-app",
        bundler: "turbopack",
        ignoredStackTags: ["vite"],
      },
    }, null, 2) + "\n");
    writeFileSync(join(projectRoot, "frontend", "package.json"), JSON.stringify({
      private: true,
      dependencies: {
        next: "16.2.4",
        react: "19.2.4",
        vite: "^7.0.0",
      },
    }, null, 2) + "\n");

    const out = runAdapt(projectRoot, ["--dry-run", "--summary-json", "--changed-only", "--no-color"]);
    const summary = JSON.parse(out);

    assert.equal(summary.frontendTarget.id, "next-app");
    assert.equal(summary.frontendTarget.bundler, "turbopack");
    assert.deepEqual(summary.frontendTarget.ignoredStackTags, ["vite"]);
    assert.ok(summary.frontendTarget.driftWarnings.some((entry) => entry.code === "vite-detected-in-next-app"));
    assert.equal(summary.frontendTarget.activeStackTags.includes("vite"), false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt metadata-only apply closes version and baseline drift", () => {
  const projectRoot = createUpToDateCodexProjectWithVersionDrift();
  try {
    const dryRun = runAdapt(projectRoot, ["--dry-run", "--no-color"]);

    assert.match(dryRun, /UPDATES: 0/);
    assert.match(dryRun, /VERSION_DRIFT: true/);
    assert.match(dryRun, /METADATA_UPDATE_REQUIRED: true/);
    assert.match(dryRun, /FAST_PATH_EXECUTION: baseline-only-cli-apply-plus-quality-gate/);
    assert.match(dryRun, /AGENT_PLAN_COMMAND: .*command-agent-plan\.mjs --command \/supervibe-adapt --apply --adds 0 --updates 0 --project-only 0 --conflicts 0 --memory-writes false/);
    assert.match(dryRun, /APPROVAL_REQUIRED: false/);
    assert.match(dryRun, /NEXT_APPLY_METADATA:/);

    const out = runAdapt(projectRoot, ["--apply", "--no-color"]);

    assert.match(out, /SUPERVIBE_ADAPT_APPLY/);
    assert.match(out, /APPLIED: 0/);
    assert.match(out, /METADATA_UPDATED: true/);
    assert.match(out, /ADAPT_BASELINE_COMPLETE: true/);
    assert.match(out, /AGENT_RECEIPTS_REQUIRED: false/);
    assert.match(out, /APP_VERIFICATION_STATUS: not-applicable/);
    assert.match(out, /DEPLOY_VERIFICATION_STATUS: not-applicable/);
    assert.match(out, /VERSION_MARKER: updated/);
    assert.equal(
      readFileSync(join(projectRoot, ".supervibe", "memory", ".supervibe-version"), "utf8").trim(),
      CURRENT_VERSION,
    );
    assert.equal(existsSync(join(projectRoot, ".supervibe", "memory", "adapt", "file-manifest.json")), true);
    const baseline = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "adapt", "baseline.json"), "utf8"));
    assert.equal(baseline.pluginVersion, CURRENT_VERSION);
    const state = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "adapt", "state.json"), "utf8"));
    assert.equal(state.lifecycle, "baseline_verified");
    assert.equal(state.verification.adaptBaselineComplete, true);
    assert.equal(state.verification.agentReceiptsRequired, false);
    assert.equal(state.verification.completionClaimAllowed, true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt applies only explicitly approved files and updates version marker", () => {
  const projectRoot = createCodexProject();
  try {
    const approvedPath = ".codex/agents/repo-researcher.md";
    const out = runAdapt(projectRoot, ["--apply", "--include", approvedPath, "--no-color"]);

    assert.match(out, /SUPERVIBE_ADAPT_APPLY/);
    assert.match(out, /APPLIED: 1/);
    assert.match(out, /SKIPPED: 0/);
    assert.equal(
      readFileSync(join(projectRoot, approvedPath), "utf8"),
      readFileSync(join(ROOT, "agents", "_core", "repo-researcher.md"), "utf8"),
    );
    assert.equal(
      readFileSync(join(projectRoot, ".supervibe", "memory", ".supervibe-version"), "utf8").trim(),
      CURRENT_VERSION,
    );
    const state = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "adapt", "state.json"), "utf8"));
    assert.equal(state.lifecycle, "artifact_verified");
    assert.deepEqual(state.updatedArtifacts, [approvedPath]);
    assert.equal(state.validators.artifactAdaptClean, true);
    assert.equal(state.verification.artifactVerified, true);
    assert.equal(state.verification.agentReceiptsVerified, false);
    assert.equal(state.verification.appVerified, false);
    assert.equal(state.verification.deployVerified, false);
    assert.equal(state.recovery.appliedFiles.includes(approvedPath), true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt verify-agents updates runtime proof gate without blocking artifact state", () => {
  const projectRoot = createCodexProject();
  try {
    const approvedPath = ".codex/agents/repo-researcher.md";
    runAdapt(projectRoot, ["--apply", "--include", approvedPath, "--no-color"]);

    const result = runAdaptMaybeFails(projectRoot, ["--verify-agents", "--no-color"]);

    assert.equal(result.status, 2);
    assert.match(result.stdout, /SUPERVIBE_ADAPT_VERIFY_AGENTS/);
    assert.match(result.stdout, /AGENT_RUNTIME_VERIFIED: false/);
    assert.match(result.stdout, /STATE_UPDATED: \.supervibe\/memory\/adapt\/state\.json/);
    assert.match(result.stdout, /NEXT_ACTION: node <resolved-supervibe-plugin-root>\/scripts\/supervibe-adapt\.mjs --verify-agents --record-smoke/);

    const state = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "adapt", "state.json"), "utf8"));
    assert.equal(state.verification.artifactVerified, true);
    assert.equal(state.verification.agentRuntimeVerified, false);
    assert.equal(state.validators.agentRuntimeVerified, false);
    assert.equal(state.evidence.agentRuntime.status, "awaiting-real-host-agent");
    assert.equal(state.evidence.agentSmokeTest.status, "pending-real-host-agent");
    assert.ok(state.history.some((entry) => entry.state === "agent-runtime-verification"));
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt recovery-status reports last trusted stage and one next safe command", () => {
  const projectRoot = createCodexProject();
  try {
    runAdapt(projectRoot, ["--apply", "--include", ".codex/agents/repo-researcher.md", "--no-color"]);

    const out = runAdapt(projectRoot, ["--recovery-status", "--no-color"]);

    assert.match(out, /SUPERVIBE_ADAPT_RECOVERY_STATUS/);
    assert.match(out, /TRUSTED_RECEIPTS: 1/);
    assert.match(out, /DIRTY_RECEIPTS: 0/);
    assert.match(out, /LAST_TRUSTED_ADAPT_STAGE: \/supervibe-adapt:command:supervibe-adapt-runner@adapt-apply/);
    assert.match(out, /ADAPT_STATE: \.supervibe\/memory\/adapt\/state\.json/);
    assert.match(out, /ADAPT_CURRENT_STAGE: artifact_verified/);
    assert.match(out, /NEXT_SAFE_COMMAND: node <resolved-supervibe-plugin-root>\/scripts\/supervibe-adapt\.mjs --verify-agents/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt provisions agents through first-class add-agents mode", () => {
  const projectRoot = createCodexProject();
  try {
    const plan = runAdapt(projectRoot, ["--add-agents", "creative-director", "--no-color"]);
    assert.match(plan, /SUPERVIBE_ADAPT_AGENT_PROVISIONING_PLAN/);
    assert.match(plan, /ADD: agent:creative-director/);
    assert.doesNotMatch(plan, /SUPERVIBE_ADAPT_DRY_RUN/);

    const out = runAdapt(projectRoot, ["--add-agents", "creative-director", "--apply", "--no-color"]);
    assert.match(out, /SUPERVIBE_ADAPT_AGENT_PROVISIONING_APPLY/);
    assert.match(out, /APPLIED_FILE: \.codex\/agents\/creative-director\.md/);
    assert.equal(existsSync(join(projectRoot, ".codex", "agents", "creative-director.md")), true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt profile add-ons keep web design separate from desktop and presentation", () => {
  const projectRoot = createCodexProject();
  try {
    const out = runAdapt(projectRoot, ["--profile", "product-design", "--addons", "creative-brand,web-design", "--no-color"]);

    assert.match(out, /SUPERVIBE_ADAPT_AGENT_PROVISIONING_PLAN/);
    assert.match(out, /SELECTED_AGENTS: .*creative-director/);
    assert.match(out, /SELECTED_AGENTS: .*competitive-design-researcher/);
    assert.doesNotMatch(out, /SELECTED_AGENTS: .*electron-ui-designer/);
    assert.doesNotMatch(out, /SELECTED_AGENTS: .*mobile-ui-designer/);
    assert.doesNotMatch(out, /SELECTED_AGENTS: .*presentation-director/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt summary-json changed-only omits identical artifact payload noise", () => {
  const projectRoot = createCodexProject();
  try {
    const out = runAdapt(projectRoot, ["--dry-run", "--summary-json", "--changed-only", "--no-color"]);
    const summary = JSON.parse(out);

    assert.equal(summary.kind, "adapt-summary");
    assert.equal(summary.counts.update, 1);
    assert.equal(summary.providerConfigApplyRequired, false);
    assert.equal(summary.fastPath.eligible, true);
    assert.match(summary.agentPlanCommand, /--adds 0 --updates 1 --project-only 0 --conflicts 0 --memory-writes false/);
    assert.equal(summary.commandAgentReadiness.ready, true);
    assert.deepEqual(summary.commandAgentReadiness.missingCallableAgents, []);
    assert.equal(summary.commandAgentReadiness.blockedCommands.length, 0);
    assert.equal(summary.commandAgentReadiness.repairCommand, null);
    assert.equal(summary.changedItems.length, 1);
    assert.equal(summary.changedItems[0].path, ".codex/agents/repo-researcher.md");
    assert.equal(Object.hasOwn(summary, "items"), false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt dry-run memory writes disable the low-risk fast path", () => {
  const projectRoot = createCodexProject();
  try {
    const out = runAdapt(projectRoot, ["--dry-run", "--refresh-memory-index", "--summary-json", "--changed-only", "--no-color"]);
    const summary = JSON.parse(out);

    assert.equal(summary.memoryWrites, true);
    assert.equal(summary.fastPath.eligible, false);
    assert.match(summary.agentPlanCommand, /--memory-writes true/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt dry-run is read-only for memory index by default", () => {
  const projectRoot = createCodexProject();
  try {
    const out = runAdapt(projectRoot, ["--dry-run", "--diff-summary", "--no-color"]);

    assert.match(out, /SUPERVIBE_ADAPT_DIFF_SUMMARY/);
    assert.match(out, /COMMAND_AGENT_READINESS: ready/);
    assert.match(out, /COMMAND_AGENT_MISSING_CALLABLE_AGENTS: none/);
    assert.doesNotMatch(out, /COMMAND_AGENT_GAP:/);
    assert.doesNotMatch(out, /COMMAND_AGENT_REPAIR:/);
    assert.match(out, /DIFF: \.codex\/agents\/repo-researcher\.md \+\d+ -\d+ \(review-update\)/);
    assert.match(out, /MEMORY_INDEX: not-refreshed/);
    assert.match(out, /MEMORY_INDEX_REFRESHED: false/);
    assert.equal(existsSync(join(projectRoot, ".supervibe", "memory", "index.json")), false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt can explicitly refresh memory index during dry-run", () => {
  const projectRoot = createCodexProject();
  try {
    const out = runAdapt(projectRoot, ["--dry-run", "--refresh-memory-index", "--no-color"]);

    assert.match(out, /MEMORY_INDEX: ready/);
    assert.match(out, /MEMORY_INDEX_REFRESHED: true/);
    assert.equal(existsSync(join(projectRoot, ".supervibe", "memory", "index.json")), true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt --apply --all separates adapt success from index repair and writes ISO baseline timestamps", () => {
  const projectRoot = createCodexProject();
  try {
    const out = runAdapt(projectRoot, ["--apply", "--all", "--no-color"]);

    assert.match(out, /SUPERVIBE_ADAPT_DIFF_SUMMARY/);
    assert.match(out, /APPLIED: 1/);
    assert.match(out, /ARTIFACT_ADAPT_CLEAN: true/);
    assert.match(out, /POST_APPLY_ADDS: 0/);
    assert.match(out, /POST_APPLY_UPDATES: 0/);
    assert.match(out, /CODE_INDEX_READY: false/);
    assert.match(out, new RegExp(`NEXT_INDEX_REPAIR: ${escapeRegExp(SOURCE_RAG_INDEX_COMMAND)}`));
    assert.doesNotMatch(out, /^ADAPT_CLEAN:/m);
    assert.doesNotMatch(out, /^INDEX_REPAIR_NEEDED:/m);

    const baseline = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "adapt", "baseline.json"), "utf8"));
    const updatedAt = baseline.artifacts[".codex/agents/repo-researcher.md"].updatedAt;
    assert.match(updatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.notEqual(updatedAt, "deterministic-local");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt adds upstream related-rule closure candidates", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-adapt-closure-project-"));
  const pluginRoot = mkdtempSync(join(tmpdir(), "supervibe-adapt-closure-plugin-"));
  try {
    mkdirSync(join(projectRoot, ".codex", "rules"), { recursive: true });
    mkdirSync(join(projectRoot, ".supervibe", "memory"), { recursive: true });
    mkdirSync(join(pluginRoot, ".claude-plugin"), { recursive: true });
    mkdirSync(join(pluginRoot, "rules"), { recursive: true });
    writeFileSync(join(projectRoot, "AGENTS.md"), "# Project instructions\n");
    writeFileSync(join(pluginRoot, ".claude-plugin", "plugin.json"), JSON.stringify({ version: "9.9.9" }));
    writeFileSync(join(pluginRoot, "rules", "base-rule.md"), [
      "---",
      "name: base-rule",
      "mandatory: true",
      "related-rules: [optional-rule]",
      "---",
      "# Base Rule",
      "",
    ].join("\n"));
    writeFileSync(join(pluginRoot, "rules", "optional-rule.md"), [
      "---",
      "name: optional-rule",
      "mandatory: false",
      "related-rules: []",
      "---",
      "# Optional Rule",
      "",
    ].join("\n"));
    writeFileSync(join(projectRoot, ".codex", "rules", "base-rule.md"), readFileSync(join(pluginRoot, "rules", "base-rule.md"), "utf8"));

    const dryRun = runAdapt(projectRoot, ["--dry-run", "--no-color"], { pluginRoot });

    assert.match(dryRun, /ADDS: 1/);
    assert.match(dryRun, /ADD: \.codex\/rules\/optional-rule\.md <= rules\/optional-rule\.md \(related-rule-closure; mandatory: false\)/);
    assert.match(dryRun, /APPROVAL_REQUIRED: true/);
    assert.match(dryRun, /NEXT_APPLY: .*\.codex\/rules\/optional-rule\.md/);

    const apply = runAdapt(projectRoot, ["--apply", "--include", ".codex/rules/optional-rule.md", "--no-color"], { pluginRoot });

    assert.match(apply, /APPLIED: 1/);
    assert.match(apply, /ARTIFACT_ADAPT_CLEAN: true/);
    assert.equal(
      readFileSync(join(projectRoot, ".codex", "rules", "optional-rule.md"), "utf8"),
      readFileSync(join(pluginRoot, "rules", "optional-rule.md"), "utf8"),
    );
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(pluginRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt fixed-point apply closes related-rule additions discovered after first update", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-adapt-fixed-point-"));
  const pluginRoot = mkdtempSync(join(tmpdir(), "supervibe-adapt-fixed-point-plugin-"));
  try {
    mkdirSync(join(projectRoot, ".codex", "rules"), { recursive: true });
    mkdirSync(join(projectRoot, ".supervibe", "memory", "adapt"), { recursive: true });
    mkdirSync(join(pluginRoot, ".claude-plugin"), { recursive: true });
    mkdirSync(join(pluginRoot, "rules"), { recursive: true });
    writeFileSync(join(projectRoot, "AGENTS.md"), "# Project instructions\n");
    writeFileSync(join(pluginRoot, ".claude-plugin", "plugin.json"), JSON.stringify({ version: "9.9.9" }));
    const oldBaseRule = [
      "---",
      "name: base-rule",
      "mandatory: true",
      "related-rules: []",
      "---",
      "# Base Rule",
      "",
    ].join("\n");
    writeFileSync(join(projectRoot, ".supervibe", "memory", ".supervibe-version"), "9.9.8\n");
    writeFileSync(join(projectRoot, ".supervibe", "memory", "adapt", "baseline.json"), JSON.stringify({
      schemaVersion: 1,
      pluginVersion: "9.9.8",
      hostAdapter: "codex",
      artifacts: {
        ".codex/rules/base-rule.md": {
          hash: sha256(oldBaseRule),
          upstream: "rules/base-rule.md",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      },
    }, null, 2) + "\n");
    writeFileSync(join(projectRoot, ".codex", "rules", "base-rule.md"), oldBaseRule);
    writeFileSync(join(pluginRoot, "rules", "base-rule.md"), [
      "---",
      "name: base-rule",
      "mandatory: true",
      "related-rules: [optional-rule]",
      "---",
      "# Base Rule",
      "",
    ].join("\n"));
    writeFileSync(join(pluginRoot, "rules", "optional-rule.md"), [
      "---",
      "name: optional-rule",
      "mandatory: false",
      "related-rules: []",
      "---",
      "# Optional Rule",
      "",
    ].join("\n"));

    const apply = runAdapt(projectRoot, ["--apply", "--all", "--fixed-point", "--no-refresh-memory-index", "--no-color"], { pluginRoot });

    assert.match(apply, /FIXED_POINT: true/);
    assert.match(apply, /FIXED_POINT_STATUS: clean/);
    assert.match(apply, /FIXED_POINT_ROUNDS: 2/);
    assert.match(apply, /NEXT_APPLY: null/);
    assert.match(apply, /TRANSACTION_ARTIFACT: \.supervibe\/artifacts\/_workflow-transactions\/supervibe-adapt\//);
    assert.match(apply, /WORKFLOW_RECEIPT: \.supervibe\/artifacts\/_workflow-invocations\/supervibe-adapt\//);
    assert.equal(existsSync(join(projectRoot, ".codex", "rules", "optional-rule.md")), true);

    const validation = execFileSync(process.execPath, [
      join(ROOT, "scripts", "validate-workflow-receipts.mjs"),
      "--root",
      projectRoot,
    ], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    assert.match(validation, /PASS: true/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(pluginRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt dokploy deploy add-on creates explicit deploy artifacts without claiming deploy verification", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-adapt-dokploy-"));
  try {
    mkdirSync(join(projectRoot, "backend"), { recursive: true });
    mkdirSync(join(projectRoot, "frontend"), { recursive: true });
    writeFileSync(join(projectRoot, "backend", "composer.json"), JSON.stringify({
      require: { "laravel/framework": "^12.0" },
    }, null, 2) + "\n");
    writeFileSync(join(projectRoot, "frontend", "package.json"), JSON.stringify({
      dependencies: { next: "16.2.4", react: "19.2.4", "react-dom": "19.2.4" },
    }, null, 2) + "\n");

    const dryRun = runAdapt(projectRoot, ["--scope", "deploy", "--target", "dokploy", "--dry-run", "--summary-json", "--no-color"]);
    const summary = JSON.parse(dryRun);
    assert.equal(summary.kind, "adapt-deploy-summary");
    assert.equal(summary.deployProfile.id, "laravel-next-postgres");
    assert.equal(summary.counts.create, 8);
    assert.equal(summary.approvalRequired, true);
    assert.match(summary.migrationCommand, /php artisan migrate --force/);

    const apply = runAdapt(projectRoot, ["--scope", "deploy", "--target", "dokploy", "--apply", "--no-color"]);
    assert.match(apply, /SUPERVIBE_ADAPT_DEPLOY_APPLY/);
    assert.match(apply, /CREATED: 8/);
    assert.match(apply, /DEPLOY_VERIFIED: false/);
    assert.match(apply, /DEPLOY_ARTIFACTS_VERIFIED: true/);
    assert.match(apply, /COMPOSE_CONFIG_VERIFIED: false/);
    assert.match(apply, /COMPOSE_CONFIG_STATUS: compose-config-skipped/);

    const compose = readFileSync(join(projectRoot, "docker-compose.dokploy.yml"), "utf8");
    assert.doesNotMatch(compose, /env_file:/);
    assert.match(compose, /\$\{POSTGRES_DB:-app\}/);
    assert.match(compose, /queue:/);
    assert.match(compose, /scheduler:/);
    assert.match(compose, /postgres-data:/);
    assert.match(compose, /healthcheck:/);
    assert.match(compose, NEXT_HEALTHCHECK_FETCH_RE);
    assert.match(compose, /start_period: 30s/);
    assert.doesNotMatch(compose, /wget -qO-/);
    assert.equal(existsSync(join(projectRoot, "backend", "Dockerfile")), true);
    assert.equal(existsSync(join(projectRoot, "frontend", "Dockerfile")), true);
    assert.equal(existsSync(join(projectRoot, "backend", ".dockerignore")), true);
    assert.equal(existsSync(join(projectRoot, "frontend", ".dockerignore")), true);
    assert.equal(existsSync(join(projectRoot, ".env.example")), true);

    const notes = readFileSync(join(projectRoot, "docs", "deploy", "dokploy.md"), "utf8");
    assert.match(notes, /Run migrations explicitly/);
    assert.match(notes, /Do not auto-migrate on container start/);

    const state = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "adapt", "state.json"), "utf8"));
    assert.equal(state.scope, "deploy");
    assert.equal(state.verification.artifactVerified, true);
    assert.equal(state.verification.deployArtifactsVerified, true);
    assert.equal(state.verification.composeConfigVerified, false);
    assert.equal(state.verification.deployRuntimeVerified, false);
    assert.equal(state.verification.deployVerified, false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt dokploy deploy add-on uses Next-only pack without Laravel evidence", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-adapt-dokploy-next-"));
  try {
    mkdirSync(join(projectRoot, "frontend"), { recursive: true });
    mkdirSync(join(projectRoot, ".supervibe", "memory", "genesis"), { recursive: true });
    mkdirSync(join(projectRoot, "docs"), { recursive: true });
    writeFileSync(join(projectRoot, ".supervibe", "memory", "genesis", "state.json"), JSON.stringify({
      frontendTarget: { id: "next-app", bundler: "turbopack" },
      appChoice: { id: "next-app" },
      deployAddOnPolicy: { requested: true, status: "requires-adapt-deploy-scope", targets: ["dokploy"] },
      confidence: {
        score: 8,
        maxScore: 10,
        label: "8/10",
        status: "WARN",
        gaps: [{ code: "deploy-addon-pending", message: "Deploy pending." }],
      },
    }, null, 2) + "\n");
    writeFileSync(join(projectRoot, "frontend", "package.json"), JSON.stringify({
      dependencies: { next: "16.2.4", react: "19.2.4", "react-dom": "19.2.4" },
    }, null, 2) + "\n");
    writeFileSync(join(projectRoot, "docker-compose.yml"), [
      "services:",
      "  frontend:",
      "    image: example/next-app",
      "    expose:",
      "      - \"3000\"",
      "    networks:",
      "      - dokploy-network",
      "networks:",
      "  dokploy-network:",
      "    external: true",
      "",
    ].join("\n"));
    writeFileSync(join(projectRoot, "docs", "dokploy-deploy.md"), "Dokploy deploy docs for frontend service on port 3000.\n");

    const dryRun = runAdapt(projectRoot, ["--scope", "deploy", "--target", "dokploy", "--dry-run", "--summary-json", "--no-color"]);
    const summary = JSON.parse(dryRun);

    assert.equal(summary.deployProfile.id, "next-only");
    assert.equal(summary.migrationCommand, null);
    assert.equal(summary.changedItems.some((item) => item.path === "backend/Dockerfile"), false);
    assert.equal(summary.changedItems.some((item) => item.path === "docker-compose.dokploy.yml"), false);
    assert.equal(summary.changedItems.some((item) => item.path === "docker-compose.yml"), false);
    assert.equal(summary.counts.identical >= 2, true);

    const apply = runAdapt(projectRoot, ["--scope", "deploy", "--target", "dokploy", "--apply", "--no-color"]);
    assert.match(apply, /DEPLOY_PROFILE: next-only/);
    assert.match(apply, /MIGRATION_COMMAND: none/);
    assert.match(apply, /GENESIS_STATE_RECONCILED: \.supervibe\/memory\/genesis\/state\.json/);
    assert.equal(existsSync(join(projectRoot, "backend", "Dockerfile")), false);
    assert.equal(existsSync(join(projectRoot, "docker-compose.dokploy.yml")), false);
    assert.equal(existsSync(join(projectRoot, "frontend", "Dockerfile")), true);
    const genesisState = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "genesis", "state.json"), "utf8"));
    assert.equal(genesisState.verification.deployArtifactsVerified, true);
    assert.equal(genesisState.deployAddOnPolicy.status, "adapt-deploy-artifacts-verified");
    assert.equal(genesisState.evidence.adaptDeployState.path, ".supervibe/memory/adapt/state.json");
    assert.equal(genesisState.confidence.gaps.some((gap) => gap.code === "deploy-addon-pending"), false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt dokploy deploy add-on creates Next-only healthcheck without wget", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-adapt-dokploy-next-health-"));
  try {
    mkdirSync(join(projectRoot, "frontend"), { recursive: true });
    mkdirSync(join(projectRoot, ".supervibe", "memory", "genesis"), { recursive: true });
    writeFileSync(join(projectRoot, ".supervibe", "memory", "genesis", "state.json"), JSON.stringify({
      frontendTarget: { id: "next-app", bundler: "turbopack" },
      appChoice: { id: "next-app" },
    }, null, 2) + "\n");
    writeFileSync(join(projectRoot, "frontend", "package.json"), JSON.stringify({
      dependencies: { next: "16.2.4", react: "19.2.4", "react-dom": "19.2.4" },
    }, null, 2) + "\n");

    const apply = runAdapt(projectRoot, ["--scope", "deploy", "--target", "dokploy", "--apply", "--no-color"]);
    assert.match(apply, /DEPLOY_PROFILE: next-only/);
    assert.equal(existsSync(join(projectRoot, "docker-compose.dokploy.yml")), true);

    const compose = readFileSync(join(projectRoot, "docker-compose.dokploy.yml"), "utf8");
    assert.match(compose, /HOSTNAME: 0\.0\.0\.0/);
    assert.match(compose, /PORT: 3000/);
    assert.match(compose, /expose:\n      - "3000"/);
    assert.match(compose, NEXT_HEALTHCHECK_FETCH_RE);
    assert.match(compose, /start_period: 30s/);
    assert.doesNotMatch(compose, /wget -qO-/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt dokploy deploy add-on uses Laravel-only backend pack without Next evidence", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-adapt-dokploy-laravel-"));
  try {
    mkdirSync(join(projectRoot, "backend"), { recursive: true });
    writeFileSync(join(projectRoot, "backend", "composer.json"), JSON.stringify({
      require: { "laravel/framework": "^12.0" },
    }, null, 2) + "\n");

    const dryRun = runAdapt(projectRoot, ["--scope", "deploy", "--target", "dokploy", "--dry-run", "--summary-json", "--no-color"]);
    const summary = JSON.parse(dryRun);

    assert.equal(summary.deployProfile.id, "laravel-postgres");
    assert.equal(summary.deployProfile.target, "dokploy");
    assert.match(summary.migrationCommand, /php artisan migrate --force/);
    assert.equal(summary.changedItems.some((item) => item.path === "frontend/Dockerfile"), false);
    assert.equal(summary.changedItems.some((item) => item.path === "backend/Dockerfile"), true);

    const apply = runAdapt(projectRoot, ["--scope", "deploy", "--target", "dokploy", "--apply", "--no-color"]);
    assert.match(apply, /DEPLOY_PROFILE: laravel-postgres/);
    assert.equal(existsSync(join(projectRoot, "backend", "Dockerfile")), true);
    assert.equal(existsSync(join(projectRoot, "frontend", "Dockerfile")), false);
    const compose = readFileSync(join(projectRoot, "docker-compose.dokploy.yml"), "utf8");
    assert.match(compose, /backend:/);
    assert.doesNotMatch(compose, /frontend:/);
    assert.doesNotMatch(compose, /NEXT_PUBLIC/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt docker deploy add-on uses Next-only Docker pack without Dokploy coupling", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-adapt-docker-next-"));
  try {
    mkdirSync(join(projectRoot, "frontend"), { recursive: true });
    mkdirSync(join(projectRoot, ".supervibe", "memory", "genesis"), { recursive: true });
    writeFileSync(join(projectRoot, ".supervibe", "memory", "genesis", "state.json"), JSON.stringify({
      frontendTarget: { id: "next-app", bundler: "turbopack" },
      appChoice: { id: "next-app" },
    }, null, 2) + "\n");
    writeFileSync(join(projectRoot, "frontend", "package.json"), JSON.stringify({
      dependencies: { next: "16.2.4", react: "19.2.4", "react-dom": "19.2.4" },
    }, null, 2) + "\n");

    const dryRun = runAdapt(projectRoot, ["--scope", "deploy", "--target", "docker", "--dry-run", "--summary-json", "--no-color"]);
    const summary = JSON.parse(dryRun);

    assert.equal(summary.target, "docker");
    assert.equal(summary.deployProfile.id, "next-only");
    assert.equal(summary.deployProfile.target, "docker");
    assert.equal(summary.migrationCommand, null);
    assert.equal(summary.changedItems.some((item) => item.path === "backend/Dockerfile"), false);
    assert.equal(summary.changedItems.some((item) => item.path === "docker-compose.dokploy.yml"), false);

    const apply = runAdapt(projectRoot, ["--scope", "deploy", "--target", "docker", "--apply", "--no-color"]);
    assert.match(apply, /TARGET: docker/);
    assert.match(apply, /DEPLOY_PROFILE: next-only/);
    assert.equal(existsSync(join(projectRoot, "frontend", "Dockerfile")), true);
    assert.equal(existsSync(join(projectRoot, "docker-compose.yml")), true);
    assert.equal(existsSync(join(projectRoot, "docker-compose.dokploy.yml")), false);
    const compose = readFileSync(join(projectRoot, "docker-compose.yml"), "utf8");
    assert.match(compose, /ports:/);
    assert.match(compose, NEXT_HEALTHCHECK_FETCH_RE);
    assert.match(compose, /start_period: 30s/);
    assert.doesNotMatch(compose, /wget -qO-/);
    assert.doesNotMatch(compose, /dokploy-network/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt deploy add-on blocks Genesis Next placeholder before app generation", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-adapt-docker-placeholder-"));
  try {
    mkdirSync(join(projectRoot, "frontend"), { recursive: true });
    mkdirSync(join(projectRoot, ".supervibe", "memory", "genesis"), { recursive: true });
    writeFileSync(join(projectRoot, ".supervibe", "memory", "genesis", "state.json"), JSON.stringify({
      frontendTarget: { id: "next-app", bundler: "turbopack" },
      appChoice: { id: "next-app" },
      verification: { appGenerated: false, appVerified: false },
      generateAppsStep: { appGenerated: false, appChoice: { id: "next-app" } },
    }, null, 2) + "\n");

    const dryRun = runAdapt(projectRoot, ["--scope", "deploy", "--target", "docker", "--dry-run", "--summary-json", "--no-color"]);
    const summary = JSON.parse(dryRun);

    assert.equal(summary.deployProfile.id, "needs-app-generation");
    assert.equal(summary.deployProfile.target, "docker");
    assert.equal(summary.counts.create, 0);
    assert.equal(summary.approvalRequired, false);
    assert.match(summary.deployProfile.blockedReason, /no Next\.js package\.json evidence exists/);
    assert.equal(summary.changedItems.some((item) => /Dockerfile|docker-compose/.test(item.path)), false);

    const apply = runAdapt(projectRoot, ["--scope", "deploy", "--target", "docker", "--apply", "--no-color"]);
    assert.match(apply, /DEPLOY_PROFILE: needs-app-generation/);
    assert.match(apply, /ARTIFACT_VERIFIED: false/);
    assert.equal(existsSync(join(projectRoot, "frontend", "Dockerfile")), false);
    assert.equal(existsSync(join(projectRoot, "docker-compose.yml")), false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt docker deploy add-on uses Laravel-only backend pack without frontend artifacts", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-adapt-docker-laravel-"));
  try {
    mkdirSync(join(projectRoot, "backend"), { recursive: true });
    writeFileSync(join(projectRoot, "backend", "composer.json"), JSON.stringify({
      require: { "laravel/framework": "^12.0" },
    }, null, 2) + "\n");

    const dryRun = runAdapt(projectRoot, ["--scope", "deploy", "--target", "docker", "--dry-run", "--summary-json", "--no-color"]);
    const summary = JSON.parse(dryRun);

    assert.equal(summary.target, "docker");
    assert.equal(summary.deployProfile.id, "laravel-postgres");
    assert.equal(summary.deployProfile.target, "docker");
    assert.match(summary.migrationCommand, /docker compose run --rm backend php artisan migrate --force/);
    assert.equal(summary.changedItems.some((item) => item.path === "frontend/Dockerfile"), false);
    assert.equal(summary.changedItems.some((item) => item.path === "backend/Dockerfile"), true);

    runAdapt(projectRoot, ["--scope", "deploy", "--target", "docker", "--apply", "--no-color"]);
    assert.equal(existsSync(join(projectRoot, "backend", "Dockerfile")), true);
    assert.equal(existsSync(join(projectRoot, "frontend", "Dockerfile")), false);
    const compose = readFileSync(join(projectRoot, "docker-compose.yml"), "utf8");
    assert.match(compose, /backend:/);
    assert.match(compose, /postgres:/);
    assert.doesNotMatch(compose, /frontend:/);
    assert.doesNotMatch(compose, /NEXT_PUBLIC/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt docker deploy add-on discovers multiple supported services without frontend/backend folder assumptions", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-adapt-docker-multi-"));
  try {
    for (const dir of ["apps/web", "apps/admin", "services/api", "services/billing"]) {
      mkdirSync(join(projectRoot, dir), { recursive: true });
    }
    writeFileSync(join(projectRoot, "apps", "web", "package.json"), JSON.stringify({
      dependencies: { next: "16.2.4", react: "19.2.4", "react-dom": "19.2.4" },
    }, null, 2) + "\n");
    writeFileSync(join(projectRoot, "apps", "admin", "package.json"), JSON.stringify({
      dependencies: { next: "16.2.4", react: "19.2.4", "react-dom": "19.2.4" },
    }, null, 2) + "\n");
    writeFileSync(join(projectRoot, "services", "api", "composer.json"), JSON.stringify({
      require: { "laravel/framework": "^12.0" },
    }, null, 2) + "\n");
    writeFileSync(join(projectRoot, "services", "billing", "composer.json"), JSON.stringify({
      require: { "laravel/framework": "^12.0" },
    }, null, 2) + "\n");

    const dryRun = runAdapt(projectRoot, ["--scope", "deploy", "--target", "docker", "--dry-run", "--summary-json", "--no-color"]);
    const summary = JSON.parse(dryRun);

    assert.equal(summary.deployProfile.id, "laravel-next-postgres");
    assert.equal(summary.deployProfile.services.length, 4);
    assert.equal(summary.deployProfile.nextServices.length, 2);
    assert.equal(summary.deployProfile.laravelServices.length, 2);
    assert.equal(summary.deployProfile.unsupportedServices.length, 0);
    assert.equal(summary.counts.create, 12);
    assert.match(summary.migrationCommand, /laravel-services-api/);
    assert.match(summary.migrationCommand, /laravel-services-billing/);

    runAdapt(projectRoot, ["--scope", "deploy", "--target", "docker", "--apply", "--no-color"]);
    for (const path of [
      "apps/web/Dockerfile",
      "apps/admin/Dockerfile",
      "services/api/Dockerfile",
      "services/billing/Dockerfile",
      "apps/web/.dockerignore",
      "apps/admin/.dockerignore",
      "services/api/.dockerignore",
      "services/billing/.dockerignore",
    ]) {
      assert.equal(existsSync(join(projectRoot, ...path.split("/"))), true, path);
    }
    const compose = readFileSync(join(projectRoot, "docker-compose.yml"), "utf8");
    assert.match(compose, /next-apps-web:/);
    assert.match(compose, /next-apps-admin:/);
    assert.match(compose, /laravel-services-api:/);
    assert.match(compose, /laravel-services-billing:/);
    assert.match(compose, NEXT_HEALTHCHECK_FETCH_RE);
    assert.match(compose, /start_period: 30s/);
    assert.doesNotMatch(compose, /wget -qO-/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt deploy add-on blocks unsupported service-only projects instead of guessing Dockerfiles", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-adapt-docker-unsupported-"));
  try {
    mkdirSync(join(projectRoot, "apps", "portal"), { recursive: true });
    writeFileSync(join(projectRoot, "apps", "portal", "package.json"), JSON.stringify({
      dependencies: { "@vitejs/plugin-react": "latest", vite: "latest", react: "19.2.4" },
    }, null, 2) + "\n");

    const dryRun = runAdapt(projectRoot, ["--scope", "deploy", "--target", "docker", "--dry-run", "--summary-json", "--no-color"]);
    const summary = JSON.parse(dryRun);

    assert.equal(summary.deployProfile.id, "needs-stack-evidence");
    assert.equal(summary.counts.create, 0);
    assert.equal(summary.deployProfile.unsupportedServices.length, 1);
    assert.match(summary.deployProfile.blockedReason, /unsupported deploy services/);

    const apply = runAdapt(projectRoot, ["--scope", "deploy", "--target", "docker", "--apply", "--no-color"]);
    assert.match(apply, /ARTIFACT_VERIFIED: false/);
    assert.equal(existsSync(join(projectRoot, "apps", "portal", "Dockerfile")), false);
    assert.equal(existsSync(join(projectRoot, "docker-compose.yml")), false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function previousPatchVersion(version) {
  const parts = String(version).split(".").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return "0.0.0";
  if (parts[2] > 0) {
    parts[2] -= 1;
    return parts.join(".");
  }
  if (parts[1] > 0) {
    parts[1] -= 1;
    parts[2] = 999;
    return parts.join(".");
  }
  if (parts[0] > 0) {
    parts[0] -= 1;
    parts[1] = 999;
    parts[2] = 999;
    return parts.join(".");
  }
  return parts.join(".");
}
