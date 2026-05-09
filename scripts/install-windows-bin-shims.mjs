#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_ROOT = fileURLToPath(new URL("../", import.meta.url));
const MARKER = "Supervibe generated Windows command shim";

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  const report = await installWindowsBinShims({
    pluginRoot: args["plugin-root"] || process.env.SUPERVIBE_PLUGIN_ROOT || SCRIPT_ROOT,
    binDir: args["bin-dir"] || process.env.SUPERVIBE_WINDOWS_BIN_DIR || defaultWindowsBinDir(),
    dryRun: Boolean(args["dry-run"]),
    env: process.env,
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatWindowsBinShimsReport(report));
  }
  if (!report.pass) process.exitCode = 1;
}

export async function installWindowsBinShims({
  pluginRoot,
  binDir,
  dryRun = false,
  env = process.env,
} = {}) {
  const root = resolve(pluginRoot || SCRIPT_ROOT);
  const targetDir = resolve(binDir || defaultWindowsBinDir());
  const packageJson = await readPackageJson(root);
  const bin = packageJson.bin || {};
  const links = [];

  if (!dryRun) await mkdir(targetDir, { recursive: true });

  for (const [name, relativeTarget] of Object.entries(bin).sort(([a], [b]) => a.localeCompare(b))) {
    const target = resolve(root, relativeTarget);
    const cmdPath = join(targetDir, `${name}.cmd`);
    const ps1Path = join(targetDir, `${name}.ps1`);
    const exists = existsSync(target);
    let status = exists ? "create" : "missing-target";
    let ok = exists;

    if (exists && (await hasForeignFile(cmdPath) || await hasForeignFile(ps1Path))) {
      status = "skip-existing-file";
      ok = false;
    }

    if (!dryRun && ok) {
      await writeFile(cmdPath, renderCmdShim({ target, name }), "utf8");
      await writeFile(ps1Path, renderPowerShellShim({ target, name }), "utf8");
    }

    links.push({
      name,
      cmdPath,
      ps1Path,
      target,
      status,
      ok,
    });
  }

  const failures = links.filter((link) => !link.ok);
  const pathReady = pathContains(targetDir, `${env.Path || ""}${delimiter}${env.PATH || ""}`);
  return {
    pass: failures.length === 0,
    dryRun,
    pluginRoot: root,
    binDir: targetDir,
    pathReady,
    nextPathPowerShell: pathReady ? null : `[Environment]::SetEnvironmentVariable('Path', "$([Environment]::GetEnvironmentVariable('Path','User'));${targetDir}", 'User')`,
    total: links.length,
    linked: links.filter((link) => link.ok).length,
    skipped: failures.length,
    links,
  };
}

export function formatWindowsBinShimsReport(report) {
  const lines = [
    "SUPERVIBE_WINDOWS_BIN_SHIMS",
    `PASS: ${report.pass}`,
    `DRY_RUN: ${report.dryRun}`,
    `BIN_DIR: ${report.binDir}`,
    `TOTAL: ${report.total}`,
    `LINKED: ${report.linked}`,
    `SKIPPED: ${report.skipped}`,
    `PATH_READY: ${report.pathReady}`,
  ];
  if (report.nextPathPowerShell) lines.push(`NEXT_PATH_POWERSHELL: ${report.nextPathPowerShell}`);
  for (const link of report.links || []) {
    lines.push(`- ${link.name}: ${link.status} -> ${link.target}`);
  }
  return lines.join("\n");
}

function renderCmdShim({ target, name }) {
  const args = name === "supervibe" ? "%*" : `${name} %*`;
  return [
    "@echo off",
    `REM ${MARKER}; do not edit.`,
    "setlocal",
    `node "${target}" ${args}`,
    "exit /b %ERRORLEVEL%",
    "",
  ].join("\r\n");
}

function renderPowerShellShim({ target, name }) {
  const targetLiteral = target.replace(/'/g, "''");
  const commandArgs = name === "supervibe" ? "@args" : `'${name}' @args`;
  return [
    `# ${MARKER}; do not edit.`,
    "$ErrorActionPreference = 'Stop'",
    `& node '${targetLiteral}' ${commandArgs}`,
    "exit $LASTEXITCODE",
    "",
  ].join("\n");
}

async function hasForeignFile(path) {
  if (!existsSync(path)) return false;
  try {
    const raw = await readFile(path, "utf8");
    return !raw.includes(MARKER);
  } catch {
    return true;
  }
}

async function readPackageJson(root) {
  return JSON.parse(await readFile(join(root, "package.json"), "utf8"));
}

function defaultWindowsBinDir() {
  return join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "Supervibe", "bin");
}

function pathContains(dir, pathValue) {
  const normalized = normalizePath(dir);
  return String(pathValue || "")
    .split(delimiter)
    .filter(Boolean)
    .some((entry) => normalizePath(resolve(entry)) === normalized);
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function isMain() {
  return process.argv[1] ? resolve(process.argv[1]) === SCRIPT_PATH : false;
}

function parseArgs(argv) {
  const parsed = {};
  const booleans = new Set(["dry-run", "json", "no-color"]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (booleans.has(key)) {
      parsed[key] = true;
    } else {
      parsed[key] = argv[i + 1];
      i += 1;
    }
  }
  return parsed;
}
