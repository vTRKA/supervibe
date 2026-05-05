import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SOURCE_RAG_INDEX_COMMAND } from "../scripts/lib/supervibe-command-catalog.mjs";

const ROOT = process.cwd();
const ADAPT_SCRIPT = join(ROOT, "scripts", "supervibe-adapt.mjs");
const CURRENT_VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;

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
  writeFileSync(join(projectRoot, ".supervibe", "memory", ".supervibe-version"), previousPatchVersion(CURRENT_VERSION) + "\n");
  writeFileSync(join(projectRoot, ".supervibe", "memory", "adapt", "baseline.json"), JSON.stringify({
    schemaVersion: 1,
    pluginVersion: previousPatchVersion(CURRENT_VERSION),
    hostAdapter: "codex",
    artifacts: {},
  }, null, 2) + "\n");
  return projectRoot;
}

function runAdapt(projectRoot, args = [], { pluginRoot = ROOT } = {}) {
  return execFileSync(process.execPath, [ADAPT_SCRIPT, ...args], {
    cwd: projectRoot,
    env: {
      ...process.env,
      SUPERVIBE_HOST: "codex",
      SUPERVIBE_PLUGIN_ROOT: pluginRoot,
    },
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function runAdaptRaw(projectRoot, args = [], { pluginRoot = ROOT } = {}) {
  const result = execFileSync(process.execPath, [ADAPT_SCRIPT, ...args], {
    cwd: projectRoot,
    env: {
      ...process.env,
      SUPERVIBE_HOST: "codex",
      SUPERVIBE_PLUGIN_ROOT: pluginRoot,
    },
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return { status: 0, stdout: result, stderr: "" };
}

function runAdaptMaybeFails(projectRoot, args = [], { pluginRoot = ROOT } = {}) {
  try {
    return runAdaptRaw(projectRoot, args, { pluginRoot });
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
    assert.match(out, /CONFLICTS: 0/);
    assert.match(out, /FAST_PATH_ELIGIBLE: true/);
    assert.match(out, /FAST_PATH_ROLES: .*supervibe-orchestrator.*quality-gate-reviewer/);
    assert.match(out, /UPDATE: \.codex\/agents\/repo-researcher\.md/);
    assert.match(out, /APPROVAL_REQUIRED: true/);
    assert.doesNotMatch(out, /SUPERVIBE_GENESIS_DRY_RUN/);
    assert.doesNotMatch(out, /RECOMMENDED_AGENTS: none/);
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
    assert.match(dryRun, /APPROVAL_REQUIRED: false/);
    assert.match(dryRun, /NEXT_APPLY_METADATA:/);

    const out = runAdapt(projectRoot, ["--apply", "--no-color"]);

    assert.match(out, /SUPERVIBE_ADAPT_APPLY/);
    assert.match(out, /APPLIED: 0/);
    assert.match(out, /METADATA_UPDATED: true/);
    assert.match(out, /VERSION_MARKER: updated/);
    assert.equal(
      readFileSync(join(projectRoot, ".supervibe", "memory", ".supervibe-version"), "utf8").trim(),
      CURRENT_VERSION,
    );
    const baseline = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "adapt", "baseline.json"), "utf8"));
    assert.equal(baseline.pluginVersion, CURRENT_VERSION);
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

test("supervibe-adapt provisions agents through first-class add-agents mode", () => {
  const projectRoot = createCodexProject();
  try {
    const plan = runAdapt(projectRoot, ["--add-agents", "creative-director", "--no-color"]);
    assert.match(plan, /SUPERVIBE_ADAPT_AGENT_PROVISIONING_PLAN/);
    assert.match(plan, /ADD: agent:creative-director/);
    assert.doesNotMatch(plan, /SUPERVIBE_ADAPT_DRY_RUN/);

    const out = runAdapt(projectRoot, ["--add-agents", "creative-director", "--apply", "--no-color"]);
    assert.match(out, /SUPERVIBE_ADAPT_AGENT_PROVISIONING_APPLY/);
    assert.match(out, /APPLIED_FILE: \.codex\/agents\/_design\/creative-director\.md/);
    assert.equal(existsSync(join(projectRoot, ".codex", "agents", "_design", "creative-director.md")), true);
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
    assert.equal(summary.fastPath.eligible, true);
    assert.match(summary.agentPlanCommand, /--adds 0 --updates 1 --project-only 0 --conflicts 0 --memory-writes false/);
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

test("supervibe-adapt dokploy deploy add-on creates explicit deploy artifacts without claiming deploy verification", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-adapt-dokploy-"));
  try {
    mkdirSync(join(projectRoot, "backend"), { recursive: true });
    mkdirSync(join(projectRoot, "frontend"), { recursive: true });

    const dryRun = runAdapt(projectRoot, ["--scope", "deploy", "--target", "dokploy", "--dry-run", "--summary-json", "--no-color"]);
    const summary = JSON.parse(dryRun);
    assert.equal(summary.kind, "adapt-deploy-summary");
    assert.equal(summary.counts.create, 6);
    assert.equal(summary.approvalRequired, true);
    assert.match(summary.migrationCommand, /php artisan migrate --force/);

    const apply = runAdapt(projectRoot, ["--scope", "deploy", "--target", "dokploy", "--apply", "--no-color"]);
    assert.match(apply, /SUPERVIBE_ADAPT_DEPLOY_APPLY/);
    assert.match(apply, /CREATED: 6/);
    assert.match(apply, /DEPLOY_VERIFIED: false/);

    const compose = readFileSync(join(projectRoot, "docker-compose.dokploy.yml"), "utf8");
    assert.match(compose, /env_file:/);
    assert.match(compose, /queue:/);
    assert.match(compose, /scheduler:/);
    assert.match(compose, /postgres-data:/);
    assert.match(compose, /healthcheck:/);
    assert.equal(existsSync(join(projectRoot, "backend", "Dockerfile")), true);
    assert.equal(existsSync(join(projectRoot, "frontend", "Dockerfile")), true);
    assert.equal(existsSync(join(projectRoot, ".env.example")), true);

    const notes = readFileSync(join(projectRoot, "docs", "deploy", "dokploy.md"), "utf8");
    assert.match(notes, /Run migrations explicitly/);
    assert.match(notes, /Do not auto-migrate on container start/);

    const state = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "adapt", "state.json"), "utf8"));
    assert.equal(state.scope, "deploy");
    assert.equal(state.verification.artifactVerified, true);
    assert.equal(state.verification.deployVerified, false);
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
  parts[2] = Math.max(0, parts[2] - 1);
  return parts.join(".");
}
