#!/usr/bin/env node

import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
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
  outputResult({
    mode,
    report,
    statePath: appliedState.path,
    ...applyResult,
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
    ? await runGenerateAppsStep({ targetRoot, report })
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

async function runGenerateAppsStep({ targetRoot, report }) {
  const results = [];
  for (const entry of report.generateAppsStep?.commands || []) {
    const command = String(entry.command || "").trim();
    if (!command) continue;
    const result = spawnSync(command, {
      cwd: targetRoot,
      encoding: "utf8",
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 1024 * 1024 * 10,
    });
    results.push({
      command,
      when: entry.when,
      status: result.status === 0 ? "completed" : "failed_recoverable",
      exitCode: result.status,
      error: result.error?.message || null,
      stdoutTail: tailLines(result.stdout || "", 20),
      stderrTail: tailLines(result.stderr || "", 20),
    });
    if (result.status !== 0) break;
  }
  return {
    status: results.length === 0
      ? "not-needed"
      : results.every((item) => item.status === "completed")
        ? "completed"
        : "failed_recoverable",
    commands: report.generateAppsStep?.commands || [],
    results,
    note: "This step runs real framework scaffolders only when --generate-apps is explicitly provided. Failed commands are recoverable; install missing dependencies or rerun the command manually.",
  };
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
      appVerified: false,
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
    generateAppsStep: report.generateAppsStep,
    operations,
    history,
  };
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return { path: toRel(targetRoot, statePath), state };
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
    `VERIFY: ${result.verificationCommand || "dry-run only"}`,
    "",
    formatGenesisDryRunReport(result.report),
  ];
  for (const entry of result.created.slice(0, 20)) lines.push(`CREATED_PATH: ${entry}`);
  for (const entry of (result.updated || []).slice(0, 20)) lines.push(`UPDATED_PATH: ${entry}`);
  for (const entry of result.skipped.slice(0, 20)) lines.push(`SKIPPED_PATH: ${entry}`);
  for (const entry of result.missing) lines.push(`MISSING_PATH: ${entry}`);
  console.log(lines.join("\n"));
}

function parseArgs(argv) {
  const parsed = {};
  const booleans = new Set(["apply", "dry-run", "json", "help", "no-color", "generate-apps"]);
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
    "  --host           claude, codex, cursor, gemini, or opencode.",
    "  --stack-tags     Explicit stack tags for empty projects.",
    "  --request        Free-form user stack/context text used as stack evidence.",
    "  --json           Machine-readable UTF-8 output.",
  ].join("\n");
}
