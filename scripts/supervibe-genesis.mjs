#!/usr/bin/env node

import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
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
  await applyScaffoldArtifacts({ targetRoot, pluginRoot, report, created, skipped, missing });

  return {
    created,
    skipped,
    missing,
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

async function applyScaffoldArtifacts({ targetRoot, pluginRoot, report, created, skipped, missing }) {
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
    verified: false,
    targetRoot,
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
    `SKIPPED: ${result.skipped.length}`,
    `MISSING: ${result.missing.length}`,
    `VERIFY: ${result.verificationCommand || "dry-run only"}`,
    "",
    formatGenesisDryRunReport(result.report),
  ];
  for (const entry of result.created.slice(0, 20)) lines.push(`CREATED_PATH: ${entry}`);
  for (const entry of result.skipped.slice(0, 20)) lines.push(`SKIPPED_PATH: ${entry}`);
  for (const entry of result.missing) lines.push(`MISSING_PATH: ${entry}`);
  console.log(lines.join("\n"));
}

function parseArgs(argv) {
  const parsed = {};
  const booleans = new Set(["apply", "dry-run", "json", "help", "no-color"]);
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
    "  --addons         Comma-separated add-ons such as ai-prompting, security-audit, project-adaptation.",
    "  --host           claude, codex, cursor, gemini, or opencode.",
    "  --stack-tags     Explicit stack tags for empty projects.",
    "  --request        Free-form user stack/context text used as stack evidence.",
    "  --json           Machine-readable UTF-8 output.",
  ].join("\n");
}
