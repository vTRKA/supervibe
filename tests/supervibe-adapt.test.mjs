import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

function runAdapt(projectRoot, args = []) {
  return execFileSync(process.execPath, [ADAPT_SCRIPT, ...args], {
    cwd: projectRoot,
    env: {
      ...process.env,
      SUPERVIBE_HOST: "codex",
      SUPERVIBE_PLUGIN_ROOT: ROOT,
    },
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

test("supervibe-adapt --help prints usage and does not run dry-run", () => {
  const out = runAdapt(ROOT, ["--help"]);

  assert.match(out, /Usage:/);
  assert.match(out, /--apply/);
  assert.match(out, /--dry-run/);
  assert.doesNotMatch(out, /SUPERVIBE_ADAPT_DRY_RUN/);
});

test("supervibe-adapt dry-run plans host-aware project artifact updates without genesis", () => {
  const projectRoot = createCodexProject();
  try {
    const out = runAdapt(projectRoot, ["--dry-run", "--no-color"]);

    assert.match(out, /SUPERVIBE_ADAPT_DRY_RUN/);
    assert.match(out, /HOST: codex/);
    assert.match(out, new RegExp(`VERSION: 2\\.0\\.27 -> ${CURRENT_VERSION.replaceAll(".", "\\.")}`));
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
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-adapt prints diff summary and creates memory index during dry-run", () => {
  const projectRoot = createCodexProject();
  try {
    const out = runAdapt(projectRoot, ["--dry-run", "--diff-summary", "--no-color"]);

    assert.match(out, /SUPERVIBE_ADAPT_DIFF_SUMMARY/);
    assert.match(out, /DIFF: \.codex\/agents\/repo-researcher\.md \+\d+ -\d+ \(review-update\)/);
    assert.match(out, /MEMORY_INDEX: ready/);
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function previousPatchVersion(version) {
  const parts = String(version).split(".").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return "0.0.0";
  parts[2] = Math.max(0, parts[2] - 1);
  return parts.join(".");
}
