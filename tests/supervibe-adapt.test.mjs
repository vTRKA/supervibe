import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

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
