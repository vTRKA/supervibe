import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const GENESIS_SCRIPT = join(ROOT, "scripts", "supervibe-genesis.mjs");

function runGenesis(args, cwd, env = {}) {
  return execFileSync(process.execPath, [GENESIS_SCRIPT, ...args], {
    cwd,
    env: {
      ...process.env,
      SUPERVIBE_HOST: "codex",
      SUPERVIBE_PLUGIN_ROOT: ROOT,
      ...env,
    },
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

test("supervibe-genesis dry-run writes resume state but no scaffold files in an empty no-git project", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-genesis-empty-"));
  try {
    const out = runGenesis([
      "--dry-run",
      "--target",
      projectRoot,
      "--host",
      "codex",
      "--request",
      "Laravel Next Postgres",
    ], projectRoot);

    assert.match(out, /SUPERVIBE_GENESIS_RUNNER/);
    assert.match(out, /MODE: dry-run/);
    assert.match(out, /PACK: laravel-nextjs-postgres/);
    assert.doesNotMatch(out, /\?\?\?/);
    assert.equal(existsSync(join(projectRoot, ".supervibe", "memory", "genesis", "state.json")), true);
    assert.equal(existsSync(join(projectRoot, ".codex", "agents")), false, "dry-run must not write scaffold agents");

    const state = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "genesis", "state.json"), "utf8"));
    assert.equal(state.lifecycle, "dry-run");
    assert.equal(state.dryRunStateWriteAllowed, true);
    assert.equal(state.scaffoldWriteRequiresApproval, true);
    assert.ok(state.fingerprint.tags.includes("laravel"));
    assert.ok(state.fingerprint.tags.includes("nextjs"));
    assert.ok(state.fingerprint.tags.includes("postgres"));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-genesis apply is non-destructive with existing AGENTS, .codex, and package.json", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-genesis-apply-"));
  try {
    await mkdir(join(projectRoot, ".codex", "agents"), { recursive: true });
    await writeFile(join(projectRoot, "AGENTS.md"), "# Existing instructions\n\n## User Section\nKeep me.\n", "utf8");
    await writeFile(join(projectRoot, "package.json"), JSON.stringify({ name: "existing-app", private: true }, null, 2), "utf8");
    await writeFile(join(projectRoot, ".gitignore"), "custom.local\n", "utf8");
    await writeFile(join(projectRoot, ".codex", "agents", "supervibe-orchestrator.md"), "# Local orchestrator\n", "utf8");

    const out = runGenesis([
      "--apply",
      "--target",
      projectRoot,
      "--host",
      "codex",
      "--stack-tags",
      "laravel,nextjs,postgres",
      "--addons",
      "ai-prompting",
    ], projectRoot);

    assert.match(out, /MODE: apply/);
    assert.match(out, /PACK: laravel-nextjs-postgres/);
    assert.doesNotMatch(out, /\?\?\?/);
    assert.equal(readFileSync(join(projectRoot, "package.json"), "utf8").includes("existing-app"), true, "package.json must not be overwritten");
    assert.equal(readFileSync(join(projectRoot, "AGENTS.md"), "utf8").includes("## User Section"), true, "user-owned AGENTS section must be preserved");
    assert.equal(readFileSync(join(projectRoot, "AGENTS.md"), "utf8").includes("SUPERVIBE:BEGIN managed-context codex"), true);
    const gitignore = readFileSync(join(projectRoot, ".gitignore"), "utf8");
    assert.equal(gitignore.includes("custom.local"), true, "user-owned .gitignore entries must be preserved");
    assert.equal(gitignore.includes("SUPERVIBE:BEGIN managed-gitignore"), true, "Supervibe .gitignore block must be managed");
    assert.equal(gitignore.includes(".supervibe/memory/agent-invocations.jsonl"), true);
    assert.equal(readFileSync(join(projectRoot, ".codex", "agents", "supervibe-orchestrator.md"), "utf8"), "# Local orchestrator\n");
    assert.equal(existsSync(join(projectRoot, ".codex", "agents", "nextjs-developer.md")), true);
    assert.equal(existsSync(join(projectRoot, ".codex", "skills", "genesis", "SKILL.md")), true);
    assert.equal(existsSync(join(projectRoot, ".supervibe", "memory", "index-config.json")), true);
    assert.equal(existsSync(join(projectRoot, ".github", "workflows")), false, "base scaffold must not create empty GitHub Actions directory");

    const state = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "genesis", "state.json"), "utf8"));
    assert.equal(state.lifecycle, "applied");
    assert.equal(state.applied, true);
    assert.equal(state.targetRoot, "<project-root>");
    assert.equal(state.verification.artifactVerified, true);
    assert.equal(state.verification.agentReceiptsVerified, false);
    assert.equal(state.verification.appVerified, false);
    assert.equal(state.verification.deployVerified, false);
    assert.ok(state.history.some((entry) => entry.lifecycle === "dry-run"));
    assert.ok(state.history.some((entry) => entry.lifecycle === "applied"));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-genesis CI add-on creates provider workflow only when requested", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-genesis-ci-"));
  try {
    const out = runGenesis([
      "--apply",
      "--target",
      projectRoot,
      "--host",
      "codex",
      "--stack-tags",
      "laravel,nextjs,postgres",
      "--addons",
      "github-actions",
    ], projectRoot);

    assert.equal(existsSync(join(projectRoot, ".github", "workflows", "supervibe-ci.yml")), true);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-genesis json output is machine-readable UTF-8", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-genesis-json-"));
  try {
    const out = runGenesis([
      "--dry-run",
      "--target",
      projectRoot,
      "--host",
      "codex",
      "--request",
      "сделай genesis scaffold под next laravel postgres",
      "--json",
    ], projectRoot);

    assert.doesNotMatch(out, /\?\?\?/);
    const parsed = JSON.parse(out);
    assert.equal(parsed.mode, "dry-run");
    assert.equal(parsed.report.stackPack.id, "laravel-nextjs-postgres");
    assert.ok(parsed.report.fingerprint.tags.includes("laravel"));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
