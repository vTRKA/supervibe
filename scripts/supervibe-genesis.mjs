#!/usr/bin/env node

import { copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildGenesisDryRunReport,
  formatGenesisDryRunReport,
} from "./lib/supervibe-agent-recommendation.mjs";
import { writeContextMigrationPlan } from "./lib/supervibe-context-migrator.mjs";
import { resolveSupervibePluginRoot } from "./lib/supervibe-plugin-root.mjs";

const SCRIPT_PLUGIN_ROOT = fileURLToPath(new URL("../", import.meta.url));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("SUPERVIBE_GENESIS_ERROR");
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(formatHelp());
    return;
  }

  const targetRoot = resolve(options.target || options.project || process.cwd());
  const pluginRoot = resolve(options["plugin-root"] || resolveSupervibePluginRoot({ env: process.env, cwd: SCRIPT_PLUGIN_ROOT }));
  const env = { ...process.env };
  if (options.host) env.SUPERVIBE_HOST = options.host;

  const report = buildGenesisDryRunReport({
    targetRoot,
    pluginRoot,
    env,
    selectedProfile: options.profile || "minimal",
    addOns: splitList(options.addons),
    explicitStackTags: splitList(options["stack-tags"]),
    stackText: options.request || "",
  });
  const mode = options.apply ? "apply" : "dry-run";
  const dryRunState = await writeGenesisState({ targetRoot, report, mode: "dry-run", options });

  if (!options.apply) {
    const result = {
      mode,
      report,
      statePath: dryRunState.path,
      created: [],
      skipped: [],
      missing: [],
    };
    outputResult(result, options);
    return;
  }

  const applyResult = await applyGenesisReport({ targetRoot, pluginRoot, report, options });
  const appliedState = await writeGenesisState({
    targetRoot,
    report,
    mode: "applied",
    options,
    operations: applyResult,
  });
  const generatedAppsForOutput = applyResult.generatedApps?.status === "not-requested"
    ? appliedState.state.generateAppsStep
    : applyResult.generatedApps;
  outputResult({
    mode,
    report,
    statePath: appliedState.path,
    ...applyResult,
    generatedApps: generatedAppsForOutput,
  }, options);
}

async function applyGenesisReport({ targetRoot, pluginRoot, report, options }) {
  const created = [];
  const updated = [];
  const skipped = [];
  const missing = [];
  const adapter = report.host.folders;

  for (const agentId of report.agentProfile.selectedAgents || []) {
    await copyNamedMarkdown({
      pluginRoot,
      sourceRoot: "agents",
      id: agentId,
      targetPath: join(targetRoot, adapter.agents, `${agentId}.md`),
      targetRoot,
      created,
      skipped,
      missing,
    });
  }

  for (const ruleId of report.selectedRules || []) {
    await copyNamedMarkdown({
      pluginRoot,
      sourceRoot: "rules",
      id: ruleId,
      targetPath: join(targetRoot, adapter.rules, `${ruleId}.md`),
      targetRoot,
      created,
      skipped,
      missing,
    });
  }

  for (const skillId of report.selectedSkills || []) {
    await copyDirectoryNonDestructive({
      sourceDir: join(pluginRoot, "skills", skillId),
      targetDir: join(targetRoot, adapter.skills, skillId),
      targetRoot,
      created,
      skipped,
      missing,
      missingId: `skill:${skillId}`,
    });
  }

  await writeContextMigrationPlan(report.contextMigration, { approved: true });
  created.push(toRel(targetRoot, report.contextMigration.absolutePath));

  await writeSupervibeStateArtifacts({ targetRoot, pluginRoot, report, created, skipped });
  await writeHostSettings({ targetRoot, report, created, skipped });
  await applyScaffoldArtifacts({ targetRoot, pluginRoot, report, created, updated, skipped, missing });
  const generatedApps = options["generate-apps"]
    ? await runGenerateAppsStep({ targetRoot, report, verifyApps: Boolean(options["verify-apps"]), env: process.env })
    : {
        status: "not-requested",
        commands: report.generateAppsStep?.commands || [],
        note: "Run with --generate-apps only after approving real framework scaffolding.",
      };

  return {
    created,
    updated,
    skipped,
    missing,
    generatedApps,
    postApplyCommands: report.postApplyCommands,
    verificationCommand: "node <resolved-supervibe-plugin-root>/scripts/supervibe-status.mjs",
  };
}

async function copyNamedMarkdown({ pluginRoot, sourceRoot, id, targetPath, targetRoot, created, skipped, missing }) {
  if (existsSync(targetPath)) {
    skipped.push(toRel(targetRoot, targetPath));
    return;
  }
  const sourcePath = await findMarkdownById(join(pluginRoot, sourceRoot), id);
  if (!sourcePath) {
    missing.push(`${sourceRoot}:${id}`);
    return;
  }
  await mkdir(dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
  created.push(toRel(targetRoot, targetPath));
}

async function copyDirectoryNonDestructive({ sourceDir, targetDir, targetRoot, created, skipped, missing, missingId }) {
  if (!existsSync(sourceDir)) {
    missing.push(missingId);
    return;
  }
  await mkdir(targetDir, { recursive: true });
  for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
    const source = join(sourceDir, entry.name);
    const target = join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryNonDestructive({ sourceDir: source, targetDir: target, targetRoot, created, skipped, missing, missingId });
      continue;
    }
    if (!entry.isFile()) continue;
    if (existsSync(target)) {
      skipped.push(toRel(targetRoot, target));
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
    created.push(toRel(targetRoot, target));
  }
}

async function writeSupervibeStateArtifacts({ targetRoot, pluginRoot, report, created, skipped }) {
  const memoryDir = join(targetRoot, ".supervibe", "memory");
  await mkdir(memoryDir, { recursive: true });
  created.push(".supervibe/memory/");

  const versionPath = join(memoryDir, ".supervibe-version");
  if (!existsSync(versionPath)) {
    const pkg = JSON.parse(await readFile(join(pluginRoot, "package.json"), "utf8"));
    await writeFile(versionPath, `${pkg.version}\n`, "utf8");
    created.push(".supervibe/memory/.supervibe-version");
  } else {
    skipped.push(".supervibe/memory/.supervibe-version");
  }

  const indexConfigPath = join(memoryDir, "index-config.json");
  if (!existsSync(indexConfigPath)) {
    await writeFile(indexConfigPath, `${JSON.stringify({
      schemaVersion: 1,
      refreshInterval: "5m",
      include: ["."],
      exclude: [],
      privacyPolicy: "secret-like, archive, binary, local-config, and generated-output blocks always win",
      createdBy: "supervibe-genesis",
      stackTags: report.fingerprint.tags,
    }, null, 2)}\n`, "utf8");
    created.push(".supervibe/memory/index-config.json");
  } else {
    skipped.push(".supervibe/memory/index-config.json");
  }
}

async function writeHostSettings({ targetRoot, report, created, skipped }) {
  const adapterSettings = report.filesToCreate.find((entry) => entry.reason === "host settings when supported");
  if (!adapterSettings?.path) return;
  const target = join(targetRoot, adapterSettings.path);
  if (existsSync(target)) {
    skipped.push(adapterSettings.path);
    return;
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify({
    supervibe: {
      managed: true,
      generatedBy: "supervibe-genesis",
      host: report.host.adapterId,
    },
  }, null, 2)}\n`, "utf8");
  created.push(adapterSettings.path);
}

async function applyScaffoldArtifacts({ targetRoot, pluginRoot, report, created, updated, skipped, missing }) {
  for (const artifact of report.scaffoldArtifacts || []) {
    const target = join(targetRoot, artifact.path);
    if (artifact.type === "directory" || artifact.path.endsWith("/")) {
      if (existsSync(target)) skipped.push(artifact.path);
      else {
        await mkdir(target, { recursive: true });
        created.push(artifact.path);
      }
      continue;
    }
    if (artifact.path === ".gitignore") {
      const result = await applyManagedGitignore({ targetRoot, pluginRoot, artifact });
      if (result.status === "created") created.push(artifact.path);
      else if (result.status === "updated") updated.push(artifact.path);
      else skipped.push(artifact.path);
      continue;
    }
    if (existsSync(target)) {
      skipped.push(artifact.path);
      continue;
    }
    if (!artifact.source) {
      missing.push(`scaffold:${artifact.path}`);
      continue;
    }
    const source = join(pluginRoot, artifact.source);
    if (!existsSync(source)) {
      missing.push(`scaffold-source:${artifact.source}`);
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    const content = await renderTemplateFile({ source, targetRoot });
    await writeFile(target, content, "utf8");
    created.push(artifact.path);
  }
}

async function applyManagedGitignore({ targetRoot, pluginRoot, artifact }) {
  const target = join(targetRoot, artifact.path);
  const source = artifact.source ? join(pluginRoot, artifact.source) : null;
  const template = source && existsSync(source)
    ? await renderTemplateFile({ source, targetRoot })
    : defaultManagedGitignoreBlock();
  const block = extractManagedBlock(template, "SUPERVIBE:BEGIN managed-gitignore", "SUPERVIBE:END managed-gitignore")
    || defaultManagedGitignoreBlock();
  if (!existsSync(target)) {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, ensureTrailingLf(template), "utf8");
    return { status: "created" };
  }
  const current = await readFile(target, "utf8");
  const next = upsertManagedBlock(current, block, "SUPERVIBE:BEGIN managed-gitignore", "SUPERVIBE:END managed-gitignore");
  if (next === current) return { status: "skipped" };
  await writeFile(target, next, "utf8");
  return { status: "updated" };
}

async function runGenerateAppsStep({ targetRoot, report, verifyApps = false, env = process.env }) {
  const results = [];
  for (const entry of report.generateAppsStep?.commands || []) {
    const command = String(entry.command || "").trim();
    const spawnPlan = commandSpawnPlan(entry);
    if (!command || !spawnPlan.executable) continue;
    const before = await inspectGeneratedAppDir(targetRoot, entry);
    const result = await runScaffolderCommand({ targetRoot, entry, spawnPlan, env });
    const normalization = result.status === 0
      ? await normalizeGeneratedAppMetadata({ targetRoot, entry, before })
      : { status: "not-run", actions: [] };
    const verification = result.status === 0 && verifyApps
      ? runAppVerificationCommands({ targetRoot, entry })
      : {
          status: "not-run",
          note: verifyApps ? "No app verification commands were declared for this scaffolder." : "Run with --verify-apps to execute app lint/build checks after generation.",
          results: [],
        };
    results.push({
      command,
      when: entry.when,
      status: result.status === 0 ? "completed" : "failed_recoverable",
      exitCode: result.status,
      error: result.error?.message || null,
      fallback: result.fallback || null,
      stdoutTail: tailLines(result.stdout || "", 20),
      stderrTail: tailLines(result.stderr || "", 20),
      normalization,
      verification,
    });
    if (result.status !== 0) break;
  }
  const completed = results.length > 0 && results.every((item) => item.status === "completed");
  const verificationResults = results.flatMap((item) => item.verification?.results || []);
  const verificationStatus = !verifyApps
    ? "not-run"
    : verificationResults.length > 0 && verificationResults.every((item) => item.status === "completed")
      ? "completed"
      : "failed_recoverable";
  return {
    status: results.length === 0
      ? "not-needed"
      : completed
        ? "completed"
        : "failed_recoverable",
    appGenerated: completed,
    appVerified: verificationStatus === "completed",
    appVerification: {
      status: verificationStatus,
      results: verificationResults,
      note: verifyApps
        ? "App verification ran after generation; appVerified is true only when every declared command passes."
        : "App generation is tracked separately from app verification. Run --verify-apps to execute declared lint/build checks.",
    },
    commands: report.generateAppsStep?.commands || [],
    results,
    note: "This step runs real framework scaffolders only when --generate-apps is explicitly provided. Failed commands are recoverable; install missing dependencies or rerun the command manually.",
  };
}

function commandSpawnPlan(entry = {}) {
  if (entry.executable) {
    return {
      executable: executableForPlatform(entry.executable),
      args: Array.isArray(entry.args) ? entry.args.map(String) : [],
    };
  }
  const command = String(entry.command || "").trim();
  if (command.startsWith("npx create-next-app@latest ")) {
    return {
      executable: executableForPlatform("npx"),
      args: commandToArgs(command).slice(1),
    };
  }
  if (command.startsWith("npm create vite@latest ")) {
    return {
      executable: executableForPlatform("npm"),
      args: commandToArgs(command).slice(1),
    };
  }
  if (command.startsWith("composer create-project ")) {
    return {
      executable: executableForPlatform("composer"),
      args: commandToArgs(command).slice(1),
    };
  }
  return { executable: "", args: [] };
}

async function runScaffolderCommand({ targetRoot, entry, spawnPlan, env }) {
  if (env.SUPERVIBE_GENESIS_FAKE_SCAFFOLDER === "1") {
    await fakeScaffolderOutput({ targetRoot, entry });
    return { status: 0, stdout: "fake scaffolder completed\n", stderr: "", error: null };
  }
  const primary = runScaffolderSpawn({ targetRoot, spawnPlan, env });
  if (!shouldRetryScaffolderWithShell(primary, spawnPlan, env)) return primary;

  const fallback = await runScaffolderShellFallback({ targetRoot, entry, spawnPlan, env, primary });
  return {
    ...fallback,
    fallback: {
      used: true,
      strategy: "shell-safe",
      reason: primary.error?.code || primary.error?.message || "primary spawn failed",
      executable: spawnPlan.executable,
    },
  };
}

function runScaffolderSpawn({ targetRoot, spawnPlan, env }) {
  if (env.SUPERVIBE_GENESIS_SIMULATE_SCAFFOLDER_EINVAL === "1") {
    const error = new Error(`spawnSync ${spawnPlan.executable} EINVAL`);
    error.code = "EINVAL";
    return { status: null, stdout: "", stderr: "", error };
  }
  return spawnSync(spawnPlan.executable, spawnPlan.args, {
    cwd: targetRoot,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 10,
  });
}

function shouldRetryScaffolderWithShell(result = {}, spawnPlan = {}, env = {}) {
  if (!result?.error) return false;
  const code = String(result.error.code || "");
  const executable = String(spawnPlan.executable || "");
  const windowsCommand = /\.(cmd|bat)$/i.test(executable) || process.platform === "win32";
  const simulated = env.SUPERVIBE_GENESIS_SIMULATE_SCAFFOLDER_EINVAL === "1";
  return (windowsCommand || simulated) && ["EINVAL", "ENOENT"].includes(code);
}

async function runScaffolderShellFallback({ targetRoot, entry, spawnPlan, env, primary }) {
  if (env.SUPERVIBE_GENESIS_FAKE_SHELL_FALLBACK === "1") {
    await fakeScaffolderOutput({ targetRoot, entry });
    return {
      status: 0,
      stdout: "fake scaffolder completed through shell-safe fallback\n",
      stderr: "",
      error: null,
    };
  }
  const executable = executableForShellFallback(spawnPlan.executable);
  const args = shellFallbackArgs(executable, spawnPlan.args || []);
  const result = spawnSync(executable, args, {
    cwd: targetRoot,
    encoding: "utf8",
    shell: true,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 10,
  });
  if (result.error && primary?.error) {
    result.stderr = `${result.stderr || ""}\nprimary spawn failed: ${primary.error.message}`.trim();
  }
  return result;
}

function executableForShellFallback(executable = "") {
  const value = String(executable || "");
  if (/npx(?:\.cmd)?$/i.test(value)) return "npx";
  if (/npm(?:\.cmd)?$/i.test(value)) return "npm";
  if (/composer(?:\.bat)?$/i.test(value)) return "composer";
  return value;
}

function shellFallbackArgs(executable = "", args = []) {
  const normalizedArgs = args.map(String);
  if (/^npx$/i.test(executable) && !normalizedArgs.includes("--yes") && !normalizedArgs.includes("-y")) {
    return ["--yes", ...normalizedArgs];
  }
  return normalizedArgs;
}

async function fakeScaffolderOutput({ targetRoot, entry }) {
  const appDir = generatedAppDir(targetRoot, entry);
  if (!appDir) return;
  await mkdir(appDir, { recursive: true });
  await mkdir(join(appDir, ".git"), { recursive: true });
  await writeFile(join(appDir, "AGENTS.md"), "# Generated app-local instructions\n", "utf8");
  await writeFile(join(appDir, "CLAUDE.md"), "# Generated Claude app instructions\n", "utf8");
  await writeFile(join(appDir, "package.json"), `${JSON.stringify({
    private: true,
    scripts: {
      lint: "node -e \"process.exit(0)\"",
      build: "node -e \"process.exit(0)\"",
    },
  }, null, 2)}\n`, "utf8");
}

async function inspectGeneratedAppDir(targetRoot, entry) {
  const appDir = generatedAppDir(targetRoot, entry);
  if (!appDir) return { appDir: "", existed: false, entries: [], emptyPlaceholder: false };
  try {
    const entries = await readdir(appDir);
    return {
      appDir,
      existed: true,
      entries,
      emptyPlaceholder: entries.length === 0,
    };
  } catch {
    return { appDir, existed: false, entries: [], emptyPlaceholder: true };
  }
}

async function normalizeGeneratedAppMetadata({ targetRoot, entry, before }) {
  const appDir = generatedAppDir(targetRoot, entry);
  const appRel = entry.appDir || "";
  if (!appDir || !before?.emptyPlaceholder) {
    return {
      status: "skipped",
      actions: [],
      note: "Generated app metadata normalization only runs for app dirs that were empty placeholders before the scaffolder.",
    };
  }

  const actions = [];
  const nestedGit = join(appDir, ".git");
  if (existsSync(nestedGit)) {
    await rm(nestedGit, { recursive: true, force: true });
    actions.push({ action: "removed-nested-git", path: toRel(targetRoot, nestedGit) });
  }

  const hostSurfaces = ["AGENTS.md", "CLAUDE.md", "GEMINI.md", "opencode.json"];
  for (const fileName of hostSurfaces) {
    const source = join(appDir, fileName);
    if (!existsSync(source)) continue;
    const archiveRel = [".supervibe", "memory", "genesis", "normalized-generated-host-files", appRel, fileName].filter(Boolean);
    const archive = join(targetRoot, ...archiveRel);
    await mkdir(dirname(archive), { recursive: true });
    await rm(archive, { recursive: true, force: true });
    await rename(source, archive);
    actions.push({
      action: "archived-generated-host-file",
      path: toRel(targetRoot, source),
      archivePath: toRel(targetRoot, archive),
    });
  }

  return {
    status: actions.length > 0 ? "completed" : "not-needed",
    actions,
  };
}

function runAppVerificationCommands({ targetRoot, entry }) {
  const results = [];
  for (const commandEntry of entry.verifyCommands || []) {
    const cwd = join(targetRoot, commandEntry.cwd || entry.appDir || ".");
    const executable = executableForPlatform(commandEntry.executable || "");
    if (!executable) continue;
    const result = runChildCommandWithShellFallback({
      cwd,
      executable,
      args: (commandEntry.args || []).map(String),
      env: process.env,
    });
    results.push({
      command: commandEntry.command,
      cwd: commandEntry.cwd || entry.appDir || ".",
      status: result.status === 0 ? "completed" : "failed_recoverable",
      exitCode: result.status,
      stdoutTail: tailLines(result.stdout || "", 20),
      stderrTail: tailLines(result.stderr || "", 20),
      error: result.error?.message || null,
      fallback: result.fallback || null,
    });
    if (result.status !== 0) break;
  }
  return {
    status: results.length > 0 && results.every((item) => item.status === "completed") ? "completed" : "failed_recoverable",
    results,
  };
}

function runChildCommandWithShellFallback({ cwd, executable, args = [], env = process.env }) {
  const primary = spawnSync(executable, args, {
    cwd,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 10,
  });
  if (!shouldRetryScaffolderWithShell(primary, { executable }, env)) return primary;
  const fallbackExecutable = executableForShellFallback(executable);
  const fallbackArgs = shellFallbackArgs(fallbackExecutable, args);
  return {
    ...spawnSync(fallbackExecutable, fallbackArgs, {
      cwd,
      encoding: "utf8",
      shell: true,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 1024 * 1024 * 10,
    }),
    fallback: {
      used: true,
      strategy: "shell-safe",
      reason: primary.error?.code || primary.error?.message || "primary spawn failed",
      executable,
    },
  };
}

function generatedAppDir(targetRoot, entry = {}) {
  const appDir = String(entry.appDir || "").trim();
  if (!appDir || appDir.includes("..")) return "";
  return join(targetRoot, ...appDir.split(/[\\/]+/).filter(Boolean));
}

function executableForPlatform(name) {
  if (!name) return "";
  if (process.platform === "win32" && /^(npm|npx)$/.test(name)) return `${name}.cmd`;
  if (process.platform === "win32" && name === "composer") return "composer.bat";
  return name;
}

function commandToArgs(command) {
  const matches = String(command || "").match(/"[^"]*"|'[^']*'|\S+/g) || [];
  return matches.map((item) => item.replace(/^["']|["']$/g, ""));
}

async function renderTemplateFile({ source, targetRoot }) {
  const content = await readFile(source, "utf8");
  const projectName = basename(targetRoot).toLowerCase().replace(/[^a-z0-9._-]+/g, "-") || "supervibe-project";
  return content.replaceAll("{{project-name}}", projectName);
}

async function findMarkdownById(rootDir, id) {
  if (!existsSync(rootDir)) return null;
  const wanted = `${id}.md`;
  const entries = await readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findMarkdownById(full, id);
      if (nested) return nested;
      continue;
    }
    if (entry.isFile() && entry.name === wanted) return full;
  }
  return null;
}

async function writeGenesisState({ targetRoot, report, mode, options, operations = null }) {
  const stateDir = join(targetRoot, ".supervibe", "memory", "genesis");
  const statePath = join(stateDir, "state.json");
  await mkdir(stateDir, { recursive: true });
  const previous = existsSync(statePath) ? safeJson(await readFile(statePath, "utf8")) : null;
  const now = new Date().toISOString();
  const generateAppsState = mergeGenerateAppsState({
    previous,
    reportGenerateAppsStep: report.generateAppsStep,
    operationGenerateAppsStep: operations?.generatedApps || null,
  });
  const appGenerated = generateAppsState?.appGenerated === true || generateAppsState?.status === "completed";
  const appVerified = generateAppsState?.appVerified === true;
  const history = [
    ...(Array.isArray(previous?.history) ? previous.history : []),
    { at: now, lifecycle: mode, pack: report.stackPack.id, host: report.host.adapterId },
  ];
  const state = {
    schemaVersion: 1,
    command: "/supervibe-genesis",
    lifecycle: mode,
    updatedAt: now,
    dryRunStateWriteAllowed: true,
    scaffoldWriteRequiresApproval: true,
    approved: mode === "applied",
    applied: mode === "applied",
    currentStage: mode,
    verification: {
      artifactVerified: mode === "applied" && !(operations?.missing || []).length,
      agentReceiptsVerified: hasAgentInvocationEvidence(targetRoot),
      appGenerated,
      appVerified,
      deployVerified: false,
      completionClaimAllowed: false,
      completionClaim: mode === "applied"
        ? "bootstrap applied; real agents and app/deploy verification are not claimed without receipts and explicit verification commands"
        : "dry-run state only; no scaffold completion claim",
    },
    targetRoot: "<project-root>",
    host: report.host,
    stackPack: report.stackPack,
    fingerprint: report.fingerprint,
    selectedProfile: report.agentProfile.selectedProfile,
    addOns: splitList(options.addons),
    explicitStackTags: splitList(options["stack-tags"]),
    userRequest: options.request || "",
    filesToCreate: report.filesToCreate,
    filesToModify: report.filesToModify,
    missingArtifacts: report.missingArtifacts,
    generateAppsStep: {
      ...(report.generateAppsStep || {}),
      ...(generateAppsState || {}),
      status: generateAppsState?.status || report.generateAppsStep?.status || "not-run",
    },
    operations,
    history,
  };
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return { path: toRel(targetRoot, statePath), state };
}

function mergeGenerateAppsState({
  previous = null,
  reportGenerateAppsStep = null,
  operationGenerateAppsStep = null,
} = {}) {
  if (operationGenerateAppsStep && operationGenerateAppsStep.status !== "not-requested") {
    return {
      ...(reportGenerateAppsStep || {}),
      ...operationGenerateAppsStep,
      statePreservedFromPrevious: false,
    };
  }

  const previousStep = previous?.generateAppsStep || null;
  const previousVerification = previous?.verification || {};
  const previousAppGenerated = previousVerification.appGenerated === true
    || previousStep?.appGenerated === true
    || previousStep?.status === "completed";
  const previousAppVerified = previousVerification.appVerified === true
    || previousStep?.appVerified === true;
  if (!previousAppGenerated && !previousAppVerified) return reportGenerateAppsStep;

  return {
    ...(reportGenerateAppsStep || {}),
    ...(previousStep || {}),
    status: previousStep?.status || (previousAppGenerated ? "completed" : reportGenerateAppsStep?.status || "not-run"),
    appGenerated: previousAppGenerated,
    appVerified: previousAppVerified,
    statePreservedFromPrevious: true,
    preservationNote: "Existing generated-app lifecycle state was preserved because this Genesis run did not execute --generate-apps.",
  };
}

function outputResult(result, options) {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const lines = [
    "SUPERVIBE_GENESIS_RUNNER",
    `MODE: ${result.mode}`,
    `HOST: ${result.report.host.adapterId}`,
    `PACK: ${result.report.stackPack.id}`,
    `STACK: ${result.report.fingerprint.tags.join(", ") || "unknown"}`,
    `STATE_WRITTEN: ${result.statePath}`,
    `CREATED: ${result.created.length}`,
    `UPDATED: ${(result.updated || []).length}`,
    `SKIPPED: ${result.skipped.length}`,
    `MISSING: ${result.missing.length}`,
    `GENERATED_APPS: ${result.generatedApps?.status || "not-requested"}`,
    `APP_GENERATED: ${result.generatedApps?.appGenerated === true}`,
    `APP_VERIFIED: ${result.generatedApps?.appVerified === true}`,
    `VERIFY: ${result.verificationCommand || "dry-run only"}`,
    "",
    formatGenesisDryRunReport(result.report),
  ];
  for (const entry of result.created.slice(0, 20)) lines.push(`CREATED_PATH: ${entry}`);
  for (const entry of (result.updated || []).slice(0, 20)) lines.push(`UPDATED_PATH: ${entry}`);
  for (const entry of result.skipped.slice(0, 20)) lines.push(`SKIPPED_PATH: ${entry}`);
  for (const entry of result.missing) lines.push(`MISSING_PATH: ${entry}`);
  for (const appResult of result.generatedApps?.results || []) {
    if (appResult.fallback?.used) {
      lines.push(`GENERATE_APPS_FALLBACK: ${appResult.fallback.strategy} ${appResult.fallback.reason}`);
    }
    for (const action of appResult.normalization?.actions || []) {
      lines.push(`GENERATED_APP_NORMALIZED: ${action.action} ${action.path}${action.archivePath ? ` -> ${action.archivePath}` : ""}`);
    }
  }
  console.log(lines.join("\n"));
}

function parseArgs(argv) {
  const parsed = {};
  const booleans = new Set(["apply", "dry-run", "json", "help", "no-color", "generate-apps", "verify-apps"]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (booleans.has(key)) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = argv[index + 1];
    index += 1;
  }
  return parsed;
}

function hasAgentInvocationEvidence(targetRoot) {
  const path = join(targetRoot, ".supervibe", "memory", "agent-invocations.jsonl");
  try {
    return existsSync(path) && readFileSync(path, "utf8").trim().length > 0;
  } catch {
    return false;
  }
}

function extractManagedBlock(content, beginMarker, endMarker) {
  const begin = `# ${beginMarker}`;
  const end = `# ${endMarker}`;
  const start = content.indexOf(begin);
  const finish = content.indexOf(end);
  if (start === -1 || finish === -1 || finish < start) return null;
  return ensureTrailingLf(content.slice(start, finish + end.length));
}

function upsertManagedBlock(current, block, beginMarker, endMarker) {
  const begin = `# ${beginMarker}`;
  const end = `# ${endMarker}`;
  const normalizedBlock = ensureTrailingLf(block);
  const start = current.indexOf(begin);
  const finish = current.indexOf(end);
  if (start !== -1 && finish !== -1 && finish >= start) {
    const before = current.slice(0, start).replace(/\s+$/g, "");
    const after = current.slice(finish + end.length).replace(/^\s+/g, "");
    return [before, normalizedBlock.trimEnd(), after].filter(Boolean).join("\n\n") + "\n";
  }
  return `${current.replace(/\s+$/g, "")}\n\n${normalizedBlock}`;
}

function defaultManagedGitignoreBlock() {
  return [
    "# SUPERVIBE:BEGIN managed-gitignore",
    ".supervibe/memory/code.db*",
    ".supervibe/memory/code-index-checkpoint.json",
    ".supervibe/memory/code-index.lock",
    ".supervibe/memory/agent-invocations.jsonl",
    ".supervibe/memory/workflow-invocation-ledger.jsonl",
    ".supervibe/memory/genesis/state.json",
    ".supervibe/memory/genesis/normalized-generated-host-files/",
    ".supervibe/memory/adapt/state.json",
    ".supervibe/research-cache/",
    "docker-compose.override.yml",
    "postgres-data/",
    ".docker/volumes/",
    "*.sql",
    "*.dump",
    ".env",
    ".env.*",
    "!.env.example",
    "# SUPERVIBE:END managed-gitignore",
    "",
  ].join("\n");
}

function ensureTrailingLf(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\s+$/g, "") + "\n";
}

function tailLines(value, maxLines) {
  const lines = String(value || "").replace(/\r\n/g, "\n").trim().split("\n").filter(Boolean);
  return lines.slice(-maxLines).join("\n");
}

function splitList(value) {
  return String(value || "").split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
}

function safeJson(text) {
  try { return JSON.parse(text); }
  catch { return null; }
}

function toRel(rootDir, path) {
  return relative(rootDir, path).split(sep).join("/") || path;
}

function formatHelp() {
  return [
    "SUPERVIBE_GENESIS_HELP",
    "Usage:",
    "  node scripts/supervibe-genesis.mjs --dry-run --target <project>",
    "  node scripts/supervibe-genesis.mjs --apply --target <project> --host codex --stack-tags nextjs,laravel,postgres",
    "  supervibe-genesis --dry-run --request \"Laravel Next Postgres\"",
    "",
    "Options:",
    "  --dry-run        Default. Writes only .supervibe/memory/genesis/state.json.",
    "  --apply          Writes scaffold files non-destructively; existing files are skipped.",
    "  --profile        minimal, product-design, full-stack, research-heavy, or custom.",
    "  --addons         Comma-separated add-ons such as ai-prompting, security-audit, project-adaptation, github-actions, gitlab-ci, ci-ready.",
    "  --generate-apps  Separate approved step marker for real Laravel/Next/Vite scaffolding after base placeholders.",
    "  --verify-apps    After --generate-apps, run declared app lint/build checks and set appVerified only if they pass.",
    "  --host           claude, codex, cursor, gemini, or opencode.",
    "  --stack-tags     Explicit stack tags for empty projects.",
    "  --request        Free-form user stack/context text used as stack evidence.",
    "  --json           Machine-readable UTF-8 output.",
  ].join("\n");
}
