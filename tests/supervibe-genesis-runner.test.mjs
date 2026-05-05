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

test("supervibe-genesis Next generate-apps command disables nested git by default", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-genesis-next-command-"));
  try {
    const out = runGenesis([
      "--dry-run",
      "--target",
      projectRoot,
      "--host",
      "codex",
      "--stack-tags",
      "nextjs",
      "--json",
    ], projectRoot);
    const parsed = JSON.parse(out);
    const nextCommand = parsed.report.generateAppsStep.commands.find((entry) => entry.framework === "nextjs");

    assert.ok(nextCommand);
    assert.match(nextCommand.command, /--disable-git/);
    assert.deepEqual(nextCommand.args.slice(-1), ["--disable-git"]);
    assert.equal(nextCommand.executable, "npx");
    assert.equal(nextCommand.appDir, "frontend");
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
    assert.equal(existsSync(join(projectRoot, ".supervibe", "memory", "index.json")), true);
    assert.equal(existsSync(join(projectRoot, ".supervibe", "memory", "effectiveness.jsonl")), true);
    assert.equal(existsSync(join(projectRoot, ".supervibe", "confidence-log.jsonl")), true);
    assert.equal(existsSync(join(projectRoot, ".github", "workflows")), false, "base scaffold must not create empty GitHub Actions directory");

    const state = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "genesis", "state.json"), "utf8"));
    assert.equal(state.lifecycle, "applied");
    assert.equal(state.applied, true);
    assert.equal(state.targetRoot, "<project-root>");
    assert.equal(state.verification.artifactVerified, true);
    assert.equal(state.verification.agentReceiptsVerified, false);
    assert.equal(state.verification.appVerified, false);
    assert.equal(state.verification.deployVerified, false);
    assert.equal(state.bootstrap.memoryIndex.status, "present");
    assert.equal(state.bootstrap.effectivenessLog.status, "present");
    assert.equal(state.bootstrap.confidenceLog.status, "present");
    assert.equal(state.bootstrap.agentRuntime.status, "awaiting-real-host-agent");
    assert.equal(state.bootstrap.agentRuntime.loggedAgentInvocations, 0);
    assert.equal(state.bootstrap.agentSmokeTest.status, "pending-real-host-agent");
    assert.ok(state.history.some((entry) => entry.lifecycle === "dry-run"));
    assert.ok(state.history.some((entry) => entry.lifecycle === "applied"));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-genesis generate-apps normalizes nested git and generated host files", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-genesis-generate-apps-"));
  try {
    const out = runGenesis([
      "--apply",
      "--target",
      projectRoot,
      "--host",
      "codex",
      "--stack-tags",
      "nextjs",
      "--generate-apps",
    ], projectRoot, { SUPERVIBE_GENESIS_FAKE_SCAFFOLDER: "1" });

    assert.match(out, /GENERATED_APPS: completed/);
    assert.match(out, /APP_GENERATED: true/);
    assert.match(out, /APP_VERIFIED: false/);
    assert.equal(existsSync(join(projectRoot, "frontend", ".git")), false, "nested app .git must be removed");
    assert.equal(existsSync(join(projectRoot, "frontend", "AGENTS.md")), false, "generated app-local AGENTS must be normalized out");
    assert.equal(existsSync(join(projectRoot, "frontend", "CLAUDE.md")), false, "generated app-local CLAUDE must be normalized out");
    assert.equal(existsSync(join(projectRoot, ".supervibe", "memory", "genesis", "normalized-generated-host-files", "frontend", "AGENTS.md")), true);
    assert.equal(existsSync(join(projectRoot, ".supervibe", "memory", "genesis", "normalized-generated-host-files", "frontend", "CLAUDE.md")), true);

    const state = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "genesis", "state.json"), "utf8"));
    assert.equal(state.generateAppsStep.status, "completed");
    assert.equal(state.generateAppsStep.appGenerated, true);
    assert.equal(state.verification.appGenerated, true);
    assert.equal(state.verification.appVerified, false);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-genesis verify-apps runs against existing generated app without rerunning scaffolder", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-genesis-verify-only-"));
  try {
    runGenesis([
      "--apply",
      "--target",
      projectRoot,
      "--host",
      "codex",
      "--stack-tags",
      "nextjs",
      "--generate-apps",
    ], projectRoot, { SUPERVIBE_GENESIS_FAKE_SCAFFOLDER: "1" });

    const out = runGenesis([
      "--apply",
      "--target",
      projectRoot,
      "--host",
      "codex",
      "--stack-tags",
      "nextjs",
      "--verify-apps",
    ], projectRoot);

    assert.match(out, /GENERATED_APPS: completed/);
    assert.match(out, /APP_VERIFIED: true/);
    assert.match(out, /APP_VERIFY_RESULT: completed npm run lint cwd=frontend/);
    assert.match(out, /APP_VERIFY_RESULT: completed node scripts\/dependency-health\.mjs --root \. cwd=frontend/);
    const state = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "genesis", "state.json"), "utf8"));
    assert.equal(state.generateAppsStep.verifyOnly, true);
    assert.equal(state.generateAppsStep.appGenerated, true);
    assert.equal(state.generateAppsStep.appVerified, true);
    assert.equal(state.verification.appVerified, true);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-genesis generate-apps retries Windows npx spawn failures with shell-safe fallback", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-genesis-generate-apps-fallback-"));
  try {
    const out = runGenesis([
      "--apply",
      "--target",
      projectRoot,
      "--host",
      "codex",
      "--stack-tags",
      "nextjs",
      "--generate-apps",
    ], projectRoot, {
      SUPERVIBE_GENESIS_SIMULATE_SCAFFOLDER_EINVAL: "1",
      SUPERVIBE_GENESIS_FAKE_SHELL_FALLBACK: "1",
    });

    assert.match(out, /GENERATED_APPS: completed/);
    assert.match(out, /GENERATE_APPS_FALLBACK: shell-safe EINVAL/);
    assert.equal(existsSync(join(projectRoot, "frontend", ".git")), false);
    const state = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "genesis", "state.json"), "utf8"));
    assert.equal(state.generateAppsStep.appGenerated, true);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-genesis parser handles negated Vite and persists explicit app choice", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-genesis-app-choice-"));
  try {
    const negatedOut = runGenesis([
      "--dry-run",
      "--target",
      projectRoot,
      "--host",
      "codex",
      "--request",
      "Use a Next app with Laravel and Postgres. Vite is not used.",
      "--json",
    ], projectRoot);
    const negated = JSON.parse(negatedOut);
    assert.equal(negated.report.generateAppsStep.appChoice.id, "next-app");
    assert.equal(negated.report.generateAppsStep.clarificationRequired, false);
    assert.equal(negated.report.fingerprint.tags.includes("nextjs"), true);
    assert.equal(negated.report.fingerprint.tags.includes("vite"), false);

    runGenesis([
      "--dry-run",
      "--target",
      projectRoot,
      "--host",
      "codex",
      "--request",
      "Next and Vite are both mentioned in old notes",
      "--app-choice",
      "next-app",
      "--json",
    ], projectRoot);

    const persistedOut = runGenesis([
      "--dry-run",
      "--target",
      projectRoot,
      "--host",
      "codex",
      "--request",
      "Next and Vite are both mentioned in old notes",
      "--json",
    ], projectRoot);
    const persisted = JSON.parse(persistedOut);
    assert.equal(persisted.report.generateAppsStep.appChoice.id, "next-app");
    assert.equal(persisted.report.generateAppsStep.clarificationRequired, false);
    assert.equal(persisted.report.fingerprint.tags.includes("vite"), false);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-genesis apply preserves prior generated and verified app state", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-genesis-preserve-app-state-"));
  try {
    runGenesis([
      "--apply",
      "--target",
      projectRoot,
      "--host",
      "codex",
      "--stack-tags",
      "nextjs",
      "--generate-apps",
      "--verify-apps",
    ], projectRoot, { SUPERVIBE_GENESIS_FAKE_SCAFFOLDER: "1" });

    const out = runGenesis([
      "--apply",
      "--target",
      projectRoot,
      "--host",
      "codex",
      "--stack-tags",
      "nextjs",
    ], projectRoot);

    assert.match(out, /APP_GENERATED: true/);
    assert.match(out, /APP_VERIFIED: true/);
    const state = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "genesis", "state.json"), "utf8"));
    assert.equal(state.generateAppsStep.appGenerated, true);
    assert.equal(state.generateAppsStep.appVerified, true);
    assert.equal(state.generateAppsStep.statePreservedFromPrevious, true);
    assert.equal(state.verification.appGenerated, true);
    assert.equal(state.verification.appVerified, true);
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
