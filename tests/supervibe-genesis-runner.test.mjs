import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const GENESIS_SCRIPT = join(ROOT, "scripts", "supervibe-genesis.mjs");

function createIsolatedCodexHome(prefix = "supervibe-genesis-codex-home-") {
  const codexHome = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(join(codexHome, "config.toml"), [
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
  return codexHome;
}

function runGenesis(args, cwd, env = {}) {
  return execFileSync(process.execPath, [GENESIS_SCRIPT, ...args], {
    cwd,
    env: {
      ...process.env,
      SUPERVIBE_HOST: "codex",
      SUPERVIBE_PLUGIN_ROOT: ROOT,
      CODEX_HOME: env.CODEX_HOME || createIsolatedCodexHome(),
      ...env,
    },
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function runGenesisMaybeFails(args, cwd, env = {}) {
  try {
    return {
      status: 0,
      stdout: runGenesis(args, cwd, env),
      stderr: "",
    };
  } catch (error) {
    return {
      status: error.status,
      stdout: error.stdout?.toString("utf8") || "",
      stderr: error.stderr?.toString("utf8") || "",
    };
  }
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

test("supervibe-genesis verify-agents keeps runtime proof as a separate state gate", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-genesis-agent-verify-"));
  try {
    runGenesis([
      "--dry-run",
      "--target",
      projectRoot,
      "--host",
      "codex",
      "--stack-tags",
      "nextjs",
    ], projectRoot);

    const result = runGenesisMaybeFails([
      "--verify-agents",
      "--target",
      projectRoot,
      "--host",
      "codex",
    ], projectRoot);

    assert.equal(result.status, 2);
    assert.match(result.stdout, /SUPERVIBE_GENESIS_VERIFY_AGENTS/);
    assert.match(result.stdout, /AGENT_RUNTIME_VERIFIED: false/);
    assert.match(result.stdout, /NEXT_ACTION: node <resolved-supervibe-plugin-root>\/scripts\/supervibe-genesis\.mjs --verify-agents --record-smoke/);

    const state = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "genesis", "state.json"), "utf8"));
    assert.equal(state.verification.agentRuntimeVerified, false);
    assert.equal(state.bootstrap.agentRuntime.status, "awaiting-real-host-agent");
    assert.equal(state.bootstrap.agentSmokeTest.status, "pending-real-host-agent");
    assert.ok(state.history.some((entry) => entry.lifecycle === "agent-runtime-verification"));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-genesis verify-agents can record a receipt-bound smoke invocation", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-genesis-agent-smoke-"));
  try {
    runGenesis([
      "--dry-run",
      "--target",
      projectRoot,
      "--host",
      "codex",
      "--stack-tags",
      "nextjs",
    ], projectRoot);

    const out = runGenesis([
      "--verify-agents",
      "--record-smoke",
      "--target",
      projectRoot,
      "--host",
      "codex",
      "--host-invocation-id",
      "codex-smoke-1",
      "--summary-json",
    ], projectRoot);
    const summary = JSON.parse(out);

    assert.equal(summary.verified, true);
    assert.equal(summary.smokeRecord.status, "recorded");
    assert.equal(summary.agentRuntime.trustedHostAgentReceipts, 1);
    assert.equal(summary.confidence.score, 8);
    assert.equal(summary.confidence.gaps.some((gap) => gap.code === "agent-runtime-pending"), false);

    const state = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "genesis", "state.json"), "utf8"));
    assert.equal(state.verification.agentRuntimeVerified, true);
    assert.equal(state.verification.agentReceiptsVerified, true);
    assert.equal(state.confidence.score, 8);
    assert.equal(state.confidence.gaps.some((gap) => gap.code === "agent-runtime-pending"), false);
    assert.equal(state.bootstrap.agentSmokeTest.smokeRecord.status, "recorded");
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

test("supervibe-genesis summary-json returns compact operator state", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-genesis-summary-json-"));
  try {
    const out = runGenesis([
      "--dry-run",
      "--target",
      projectRoot,
      "--host",
      "codex",
      "--stack-tags",
      "nextjs,dokploy",
      "--summary-json",
    ], projectRoot);
    const summary = JSON.parse(out);

    assert.equal(summary.kind, "genesis-summary");
    assert.equal(summary.mode, "dry-run");
    assert.equal(summary.lifecycle, "dry-run");
    assert.equal(summary.host.adapterId, "codex");
    assert.equal(summary.deployAddOnPolicy.status, "requires-adapt-deploy-scope");
    assert.equal(summary.deploy.status, "pending");
    assert.equal(summary.deploy.verified, false);
    assert.match(summary.deploy.nextCommand, /supervibe-adapt\.mjs --scope deploy --target dokploy --dry-run/);
    assert.equal(summary.nodeRuntimePreflight.expected, "22.x");
    assert.equal(summary.app.appChoice.id, "next-app");
    assert.match(summary.nextAgentGate, /supervibe-genesis\.mjs --verify-agents --host codex/);
    assert.equal(Object.hasOwn(summary, "report"), false);
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
    assert.equal(gitignore.includes(".supervibe/memory/workflow-receipt-runtime.key"), true);
    assert.equal(gitignore.includes(".supervibe/memory/workflow-receipts-stale/"), true);
    assert.equal(gitignore.includes(".supervibe/.archive/"), true);
    assert.equal(gitignore.includes(".supervibe/servers/"), true);
    assert.equal(gitignore.includes("*.supervibe.bak"), true);
    assert.equal(readFileSync(join(projectRoot, ".codex", "agents", "supervibe-orchestrator.md"), "utf8"), "# Local orchestrator\n");
    assert.equal(existsSync(join(projectRoot, ".codex", "agents", "nextjs-developer.md")), true);
    assert.equal(existsSync(join(projectRoot, ".codex", "skills", "genesis", "SKILL.md")), true);
    assert.equal(existsSync(join(projectRoot, ".supervibe", "memory", "index-config.json")), true);
    assert.equal(existsSync(join(projectRoot, ".supervibe", "memory", "index.json")), true);
    assert.equal(existsSync(join(projectRoot, ".supervibe", "memory", "effectiveness.jsonl")), true);
    assert.equal(existsSync(join(projectRoot, ".supervibe", "confidence-log.jsonl")), true);
    assert.equal(existsSync(join(projectRoot, "commitlint.config.js")), true);
    assert.equal(existsSync(join(projectRoot, "lint-staged.config.js")), true);
    assert.equal(existsSync(join(projectRoot, ".husky", "pre-commit")), true);
    assert.equal(existsSync(join(projectRoot, ".husky", "commit-msg")), true);
    assert.equal(existsSync(join(projectRoot, ".github", "workflows")), false, "base scaffold must not create empty GitHub Actions directory");
    assert.match(out, /NEXT_AGENT_GATE: node <resolved-supervibe-plugin-root>\/scripts\/supervibe-genesis\.mjs --verify-agents --host codex/);

    const state = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "genesis", "state.json"), "utf8"));
    assert.equal(state.lifecycle, "applied");
    assert.equal(state.applied, true);
    assert.equal(state.targetRoot, "<project-root>");
    assert.equal(state.verification.artifactVerified, true);
    assert.equal(state.verification.agentReceiptsVerified, false);
    assert.equal(state.verification.appVerified, false);
    assert.equal(state.verification.deployVerified, false);
    assert.equal(state.nodeRuntimePreflight.expected, "22.x");
    assert.ok(["pass", "warn-runtime-drift"].includes(state.nodeRuntimePreflight.status));
    assert.equal(state.confidence.status, "WARN");
    assert.equal(state.confidence.label, "7/10");
    assert.ok(state.confidence.gaps.some((gap) => gap.code === "app-generation-pending"));
    assert.ok(state.confidence.gaps.some((gap) => gap.code === "agent-runtime-pending"));
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
    assert.equal(state.verification.artifactVerified, true);
    assert.deepEqual(state.verification.missingArtifactPaths, []);
    assert.equal(existsSync(join(projectRoot, ".supervibe", "memory", "adapt", "file-manifest.json")), true);
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
    assert.match(out, /BUILD_VERIFIED: true/);
    assert.match(out, /APP_VERIFY_RESULT: completed npm run lint cwd=frontend/);
    assert.match(out, /APP_DEPENDENCY_HEALTH: completed pass=true/);
    const state = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "genesis", "state.json"), "utf8"));
    assert.equal(state.generateAppsStep.verifyOnly, true);
    assert.equal(state.generateAppsStep.appGenerated, true);
    assert.equal(state.generateAppsStep.appVerified, true);
    assert.equal(state.generateAppsStep.buildVerified, true);
    assert.equal(state.generateAppsStep.dependencyHealthVerified, true);
    assert.equal(state.verification.appVerified, true);
    assert.equal(state.verification.buildVerified, true);
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

test("supervibe-genesis resolves Next plus Vite to a Turbopack Next app by policy", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-genesis-next-vite-policy-"));
  try {
    const out = runGenesis([
      "--dry-run",
      "--target",
      projectRoot,
      "--host",
      "codex",
      "--request",
      "React Next.js Vite TypeScript Tailwind",
      "--json",
    ], projectRoot);
    const parsed = JSON.parse(out);

    assert.equal(parsed.report.generateAppsStep.appChoice.id, "next-app");
    assert.equal(parsed.report.generateAppsStep.appChoice.bundler, "turbopack");
    assert.equal(parsed.report.generateAppsStep.clarificationRequired, false);
    assert.equal(parsed.report.fingerprint.tags.includes("nextjs"), true);
    assert.equal(parsed.report.fingerprint.tags.includes("vite"), false);
    assert.deepEqual(parsed.report.fingerprint.appChoice.ignoredStackTags, ["vite"]);
    assert.match(parsed.report.fingerprint.frontendTarget.policy, /Turbopack/);
    assert.equal(parsed.report.generateAppsStep.commands.filter((entry) => entry.framework === "nextjs").length, 1);
    assert.equal(parsed.report.generateAppsStep.commands.filter((entry) => entry.framework === "vite").length, 0);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-genesis records Docker tag as explicit Adapt deploy policy", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-genesis-docker-policy-"));
  try {
    const out = runGenesis([
      "--dry-run",
      "--target",
      projectRoot,
      "--host",
      "codex",
      "--request",
      "Next.js TypeScript Tailwind Docker",
      "--json",
    ], projectRoot);
    const parsed = JSON.parse(out);

    assert.equal(parsed.report.deployAddOnPolicy.requested, true);
    assert.equal(parsed.report.deployAddOnPolicy.status, "requires-adapt-deploy-scope");
    assert.deepEqual(parsed.report.deployAddOnPolicy.targets, ["docker"]);
    assert.match(parsed.report.deployAddOnPolicy.policy, /does not guess Dockerfiles from placeholder folders/);
    assert.equal(parsed.report.postApplyCommands.some((entry) => /--scope deploy --target docker --dry-run/.test(entry.command)), true);
    assert.equal(parsed.report.filesToCreate.some((entry) => entry.path === "frontend/Dockerfile"), false);

    const summary = JSON.parse(runGenesis([
      "--dry-run",
      "--target",
      projectRoot,
      "--host",
      "codex",
      "--request",
      "Next.js TypeScript Tailwind Docker",
      "--summary-json",
    ], projectRoot));
    assert.equal(summary.deploy.status, "pending");
    assert.equal(summary.deploy.verified, false);
    assert.match(summary.deploy.nextCommand, /supervibe-adapt\.mjs --scope deploy --target docker --dry-run/);
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

test("supervibe-genesis apply json does not mark execution as dry-run", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-genesis-apply-json-"));
  try {
    const out = runGenesis([
      "--apply",
      "--target",
      projectRoot,
      "--host",
      "codex",
      "--stack-tags",
      "laravel,nextjs,postgres",
      "--json",
    ], projectRoot);
    const parsed = JSON.parse(out);

    assert.equal(parsed.mode, "apply");
    assert.equal(parsed.lifecycle, "applied");
    assert.equal(parsed.dryRun, false);
    assert.equal(parsed.report.dryRun, false);
    assert.equal(parsed.report.lifecycle, "applied");
    assert.equal(parsed.report.applied, true);
    assert.equal(parsed.confidence.status, "WARN");
    assert.equal(parsed.adaptFileManifest.path, ".supervibe/memory/adapt/file-manifest.json");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
